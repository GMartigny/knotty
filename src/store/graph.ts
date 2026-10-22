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
import { loadPatch, savePatch } from "./persist";
import { COMMENT_SIZE, commentFrame } from "../modules/comment";
import { examplePatch } from "./example";
import { defaultParams, type ParamValues, type PortKind } from "../modules/types";

export interface ModuleData extends Record<string, unknown> {
    type: string;
    params: ParamValues;
    /** Text of a Comment. */
    text?: string;
    /** Block falling after being removed. */
    removing?: boolean;
}

export type ModuleNode = Node<ModuleData, "module">;
export interface CableData extends Record<string, unknown> {
    kind: PortKind;
    /** Cable falling after being unplugged: the given end is loose. */
    dropping?: "source" | "target";
}

export type CableEdge = Edge<CableData, "cable">;

/** Socket a cable is being pulled from. */
export interface Grab {
    nodeId: string;
    handleId: string;
    side: "source" | "target";
    /** Kind of the pulled socket, to light up compatible sockets. */
    kind?: PortKind;
    /** The socket already had at least one cable: dropping in empty space unplugs it. */
    plugged?: boolean;
}

/** How long an unplugged cable falls before it disappears, in ms. */
export const DROP_MS = 700;

/**
 * Duration of the cascade when clearing everything, in ms, whatever the number of blocks:
 * the gap between two falls is this duration divided by the number of blocks (10 blocks → 100 ms).
 */
const CLEAR_TOTAL_MS = 1000;

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
    /** Start of a pull from a socket. */
    startGrab(grab: Grab): void;
    /** End of the pull: `droppedInVoid` if released anywhere but on a socket. */
    endGrab(droppedInVoid: boolean): void;
    /** Unplugs a socket's cables: they fall, then disappear. */
    unplug(grab: Grab): void;
    isValidConnection(connection: Connection | CableEdge): boolean;
    addModule(type: string, position: XYPosition): void;
    setParam(nodeId: string, paramId: string, value: number): void;
    setText(nodeId: string, text: string): void;
    /** Changes how many rows a block shows (Sequencer, Mixer); cables on removed rows fall. */
    setRows(nodeId: string, rows: number): void;
    removeNode(nodeId: string): void;
    /** Removes all blocks, in a cascade. */
    clearAll(): void;
    /** Replaces the mat with a preset (see EXAMPLES). */
    loadExample(id?: string): void;
}

let counter = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

const makeNode = (type: string, position: XYPosition, id = newId(type), params: ParamValues = {}): ModuleNode => ({
    id,
    type: "module",
    position,
    data: { type, params: { ...defaultParams(registry[type]), ...params } },
    ...(type === "comment" && commentFrame(COMMENT_SIZE.width, COMMENT_SIZE.height)),
});

/** Assumed size of a new block until it is measured. */
const NEW_BLOCK = { width: 240, height: 230 };
// Wide enough that the sockets of two neighboring blocks don't touch.
const MARGIN = 56;

/**
 * First free spot around `wanted`, spiraling outward,
 * so a new block doesn't cover another one's sockets.
 */
const freeSpot = (nodes: ModuleNode[], wanted: XYPosition): XYPosition => {
    const overlaps = (p: XYPosition) =>
        nodes.some((n) => {
            // A block can be dropped inside a Comment frame.
            if (n.data.type === "comment") return false;
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

/** True if `to` can be reached from `from` (to refuse loops). */
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

/** Patch restored from the browser, otherwise the example patch. */
const restored = loadPatch() ?? examplePatch();

export const useGraph = create<GraphState>((set, get) => ({
    nodes: restored.nodes,
    edges: restored.edges,
    grab: null,

    onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
    onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),

    startGrab(grab) {
        const node = get().nodes.find((n) => n.id === grab.nodeId);
        const kind = node && portKind(node.data.type, grab.handleId, grab.side === "source" ? "out" : "in", node.data.params);
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
        // The cable stays visible while it falls, but is no longer "live" for the audio engine.
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
        const outKind = portKind(src.data.type, sourceHandle ?? "", "out", src.data.params);
        const inKind = portKind(dst.data.type, targetHandle ?? "", "in", dst.data.params);
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
        // A Comment lands where it is dropped, even over blocks (it goes behind them).
        const at = type === "comment" ? position : freeSpot(nodes, position);
        set({ nodes: [...nodes, makeNode(type, at)] });
    },

    setParam: (nodeId, paramId, value) =>
        set({
            nodes: get().nodes.map((n) =>
                n.id === nodeId ? { ...n, data: { ...n.data, params: { ...n.data.params, [paramId]: value } } } : n,
            ),
        }),

    setRows(nodeId, rows) {
        const node = get().nodes.find((n) => n.id === nodeId);
        const def = node && registry[node.data.type];
        if (!node || !def?.rows) return;
        const count = Math.round(Math.min(def.rows.max, Math.max(def.rows.min, rows)));
        if (count === node.data.params[def.rows.param]) return;
        get().setParam(nodeId, def.rows.param, count);
        // Cables plugged into a row that just disappeared come loose on this block's side.
        const params = get().nodes.find((n) => n.id === nodeId)!.data.params;
        for (const e of get().edges.filter(isLive)) {
            if (e.source === nodeId && !portKind(def.type, e.sourceHandle ?? "out", "out", params))
                get().unplug({ nodeId, handleId: e.sourceHandle ?? "out", side: "source" });
            if (e.target === nodeId && !portKind(def.type, e.targetHandle ?? "in", "in", params))
                get().unplug({ nodeId, handleId: e.targetHandle ?? "in", side: "target" });
        }
    },

    setText: (nodeId, text) =>
        set({ nodes: get().nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, text } } : n)) }),

    loadExample(id) {
        // The audio engine computes the diff: old blocks are disposed, new ones created.
        set(examplePatch(id));
    },

    clearAll() {
        // Blocks fall one after the other, from left to right.
        const ids = get()
            .nodes.filter((n) => !n.data.removing)
            .sort((a, b) => a.position.x - b.position.x)
            .map((n) => n.id);
        const gap = CLEAR_TOTAL_MS / Math.max(1, ids.length);
        ids.forEach((id, i) => setTimeout(() => get().removeNode(id), i * gap));
    },

    removeNode(nodeId) {
        const node = get().nodes.find((n) => n.id === nodeId);
        if (!node || node.data.removing) return;
        // The block falls and fades out; its cables come loose on its side and fall too.
        // For the audio engine, it is already removed.
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

// Every change to the patch is saved in the browser.
useGraph.subscribe((state, prev) => {
    if (state.nodes !== prev.nodes || state.edges !== prev.edges) savePatch(state.nodes, state.edges);
});
