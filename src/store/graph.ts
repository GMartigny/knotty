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
import { portKind, registry } from "../modules/registry";
import { defaultParams, type ParamValues, type PortKind } from "../modules/types";

export interface ModuleData extends Record<string, unknown> {
    type: string;
    params: ParamValues;
}

export type ModuleNode = Node<ModuleData, "module">;
export type CableEdge = Edge<{ kind: PortKind }, "cable">;

interface GraphState {
    nodes: ModuleNode[];
    edges: CableEdge[];
    onNodesChange(changes: NodeChange<ModuleNode>[]): void;
    onEdgesChange(changes: EdgeChange<CableEdge>[]): void;
    onConnect(connection: Connection): void;
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

    onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
    onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),

    isValidConnection(connection) {
        const { nodes, edges } = get();
        const { source, target, sourceHandle, targetHandle } = connection;
        if (!source || !target || source === target) return false;
        const src = nodes.find((n) => n.id === source);
        const dst = nodes.find((n) => n.id === target);
        if (!src || !dst) return false;
        const outKind = portKind(src.data.type, sourceHandle ?? "", "out");
        const inKind = portKind(dst.data.type, targetHandle ?? "", "in");
        if (!outKind || outKind !== inKind) return false;
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

    addModule: (type, position) => set({ nodes: [...get().nodes, makeNode(type, position)] }),

    setParam: (nodeId, paramId, value) =>
        set({
            nodes: get().nodes.map((n) =>
                n.id === nodeId ? { ...n, data: { ...n.data, params: { ...n.data.params, [paramId]: value } } } : n,
            ),
        }),

    removeNode: (nodeId) =>
        set({
            nodes: get().nodes.filter((n) => n.id !== nodeId),
            edges: get().edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
        }),
}));
