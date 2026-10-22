import { create } from "zustand";
import {
    addEdge,
    applyEdgeChanges,
    applyNodeChanges,
    type Connection,
    type Edge,
    type EdgeChange,
    type Node,
    type NodeChange,
    type XYPosition,
} from "@xyflow/react";
import { compatible, portKind, registry } from "../modules/registry";
import { defaultParams, type ParamValues, type PortKind } from "../modules/types";

export interface ModuleData extends Record<string, unknown> {
    type: string;
    params: ParamValues;
    /** Bloc en train de tomber après suppression. */
    removing?: boolean;
}

export type ModuleNode = Node<ModuleData, "module">;
export interface CableData extends Record<string, unknown> {
    kind: PortKind;
    /** Câble en train de tomber après un débranchement : l'extrémité indiquée est libre. */
    dropping?: "source" | "target";
}

export type CableEdge = Edge<CableData, "cable">;

/** Prise depuis laquelle on tire un câble. */
export interface Grab {
    nodeId: string;
    handleId: string;
    side: "source" | "target";
    /** Type de la prise tirée, pour allumer les prises compatibles. */
    kind?: PortKind;
    /** La prise avait déjà au moins un câble : lâcher dans le vide le débranche. */
    plugged?: boolean;
}

/** Durée de la chute d'un câble débranché avant qu'il disparaisse, en ms. */
export const DROP_MS = 700;

const isLive = (e: CableEdge) => !e.data?.dropping;

const attachedTo = (e: CableEdge, grab: Grab) =>
    grab.side === "source"
        ? e.source === grab.nodeId && (e.sourceHandle ?? "out") === grab.handleId
        : e.target === grab.nodeId && (e.targetHandle ?? "in") === grab.handleId;

interface GraphState {
    nodes: ModuleNode[];
    edges: CableEdge[];
    grab: Grab | null;
    onNodesChange(changes: NodeChange<ModuleNode>[]): void;
    onEdgesChange(changes: EdgeChange<CableEdge>[]): void;
    onConnect(connection: Connection): void;
    /** Début d'un tirage depuis une prise. */
    startGrab(grab: Grab): void;
    /** Fin du tirage : `droppedInVoid` si on a lâché ailleurs que sur une prise. */
    endGrab(droppedInVoid: boolean): void;
    /** Débranche les câbles d'une prise : ils tombent puis disparaissent. */
    unplug(grab: Grab): void;
    isValidConnection(connection: Connection | CableEdge): boolean;
    addModule(type: string, position: XYPosition): void;
    setParam(nodeId: string, paramId: string, value: number): void;
    removeNode(nodeId: string): void;
}

let counter = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

const makeNode = (type: string, position: XYPosition, id = newId(type)): ModuleNode => ({
    id,
    type: "module",
    position,
    data: { type, params: defaultParams(registry[type]) },
});

/** Patch de départ : Séquenceur ⇢ Bruit → Filtre → Réverb → Sortie. */
const initialNodes: ModuleNode[] = [
    makeNode("sequencer", { x: -120, y: 360 }, "sequencer-1"),
    makeNode("noise", { x: 40, y: 80 }, "noise-1"),
    makeNode("filter", { x: 330, y: 40 }, "filter-1"),
    makeNode("reverb", { x: 620, y: 160 }, "reverb-1"),
    makeNode("output", { x: 910, y: 80 }, "output-1"),
];

const cable = (source: string, target: string, kind: PortKind = "audio", sourceHandle = "out", targetHandle = "in"): CableEdge => ({
    id: `${source}:${sourceHandle}->${target}:${targetHandle}`,
    source,
    sourceHandle,
    target,
    targetHandle,
    type: "cable",
    data: { kind },
});

const initialEdges: CableEdge[] = [
    cable("sequencer-1", "noise-1", "trigger", "row0", "gate"),
    cable("noise-1", "filter-1"),
    cable("filter-1", "reverb-1"),
    cable("reverb-1", "output-1"),
];

/** Taille supposée d'un nouveau bloc tant qu'il n'est pas mesuré. */
const NEW_BLOCK = { width: 240, height: 230 };
// Assez large pour que les prises de deux blocs voisins ne se touchent pas.
const MARGIN = 56;

/**
 * Première place libre autour de `wanted`, en tournant en spirale,
 * pour qu'un nouveau bloc ne recouvre pas les prises d'un autre.
 */
const freeSpot = (nodes: ModuleNode[], wanted: XYPosition): XYPosition => {
    const overlaps = (p: XYPosition) =>
        nodes.some((n) => {
            const w = n.measured?.width ?? NEW_BLOCK.width;
            const h = n.measured?.height ?? NEW_BLOCK.height;
            return (
                p.x < n.position.x + w + MARGIN &&
                p.x + NEW_BLOCK.width + MARGIN > n.position.x &&
                p.y < n.position.y + h + MARGIN &&
                p.y + NEW_BLOCK.height + MARGIN > n.position.y
            );
        });
    if (!overlaps(wanted)) return wanted;
    for (let ring = 1; ring < 12; ring++) {
        const radius = ring * 90;
        const steps = ring * 8;
        for (let i = 0; i < steps; i++) {
            const angle = (i / steps) * Math.PI * 2;
            const p = { x: wanted.x + Math.cos(angle) * radius, y: wanted.y + Math.sin(angle) * radius };
            if (!overlaps(p)) return p;
        }
    }
    return wanted;
};

/** Vrai si `to` est atteignable depuis `from` (pour refuser les boucles). */
const reaches = (edges: CableEdge[], from: string, to: string): boolean => {
    const stack = [from];
    const seen = new Set<string>();
    while (stack.length) {
        const current = stack.pop()!;
        if (current === to) return true;
        if (seen.has(current)) continue;
        seen.add(current);
        for (const e of edges) if (e.source === current) stack.push(e.target);
    }
    return false;
};

export const useGraph = create<GraphState>((set, get) => ({
    nodes: initialNodes,
    edges: initialEdges,
    grab: null,

    onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
    onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),

    startGrab(grab) {
        const node = get().nodes.find((n) => n.id === grab.nodeId);
        const kind = node && portKind(node.data.type, grab.handleId, grab.side === "source" ? "out" : "in");
        const plugged = get().edges.some((e) => isLive(e) && attachedTo(e, grab));
        set({ grab: { ...grab, kind, plugged } });
    },

    endGrab(droppedInVoid) {
        const { grab } = get();
        set({ grab: null });
        if (grab?.plugged && droppedInVoid) get().unplug(grab);
    },

    unplug(grab) {
        const ids = new Set(get().edges.filter((e) => isLive(e) && attachedTo(e, grab)).map((e) => e.id));
        if (!ids.size) return;
        // Le câble reste affiché le temps de sa chute, mais n'est plus « vivant » pour le moteur audio.
        set({
            edges: get().edges.map((e) =>
                ids.has(e.id) ? { ...e, selectable: false, data: { ...e.data!, dropping: grab.side } } : e,
            ),
        });
        setTimeout(() => set({ edges: get().edges.filter((e) => !ids.has(e.id)) }), DROP_MS);
    },

    isValidConnection(connection) {
        const nodes = get().nodes.filter((n) => !n.data.removing);
        const edges = get().edges.filter(isLive);
        const { source, target, sourceHandle, targetHandle } = connection;
        if (!source || !target || source === target) return false;
        const src = nodes.find((n) => n.id === source);
        const dst = nodes.find((n) => n.id === target);
        if (!src || !dst) return false;
        const outKind = portKind(src.data.type, sourceHandle ?? "", "out");
        const inKind = portKind(dst.data.type, targetHandle ?? "", "in");
        if (!outKind || !inKind || !compatible(outKind, inKind)) return false;
        const duplicate = edges.some(
            (e) =>
                e.source === source &&
                e.target === target &&
                e.sourceHandle === sourceHandle &&
                e.targetHandle === targetHandle,
        );
        return !duplicate && !reaches(edges, target, source);
    },

    onConnect(connection) {
        if (!get().isValidConnection(connection)) return;
        const src = get().nodes.find((n) => n.id === connection.source)!;
        const kind = portKind(src.data.type, connection.sourceHandle ?? "", "out")!;
        set({
            edges: addEdge<CableEdge>({ ...connection, id: newId("cable"), type: "cable", data: { kind } }, get().edges),
        });
    },

    addModule: (type, position) => {
        const nodes = get().nodes;
        set({ nodes: [...nodes, makeNode(type, freeSpot(nodes, position))] });
    },

    setParam: (nodeId, paramId, value) =>
        set({
            nodes: get().nodes.map((n) =>
                n.id === nodeId ? { ...n, data: { ...n.data, params: { ...n.data.params, [paramId]: value } } } : n,
            ),
        }),

    removeNode(nodeId) {
        const node = get().nodes.find((n) => n.id === nodeId);
        if (!node || node.data.removing) return;
        // Le bloc tombe et s'efface ; ses câbles se décrochent de son côté et tombent aussi.
        // Pour le moteur audio, il est déjà retiré.
        set({
            nodes: get().nodes.map((n) =>
                n.id === nodeId
                    ? { ...n, draggable: false, selectable: false, connectable: false, data: { ...n.data, removing: true } }
                    : n,
            ),
            edges: get().edges.map((e) =>
                isLive(e) && (e.source === nodeId || e.target === nodeId)
                    ? { ...e, selectable: false, data: { ...e.data!, dropping: e.source === nodeId ? "source" : "target" } }
                    : e,
            ),
        });
        setTimeout(
            () =>
                set({
                    nodes: get().nodes.filter((n) => n.id !== nodeId),
                    edges: get().edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
                }),
            DROP_MS,
        );
    },
}));
