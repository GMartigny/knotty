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
import { examplePatch } from "./example";
import { alignShared, createNode, newId } from "./nodes";
import type { ParamValues, PortKind } from "../modules/types";

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
const DROP_MS = 700;

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
    /** Undoes the last change to the patch (Ctrl+Z). */
    undo(): void;
    /** Redoes the last undone change (Ctrl+Shift+Z, Ctrl+Y). */
    redo(): void;
    /** Selects every block on the mat (Ctrl+A). */
    selectAll(): void;
    /** Copies the selected blocks: their settings and texts, not their cables. Returns how many. */
    copy(): number;
    /** Pastes the copied blocks, their top-left corner at `at` (otherwise next to the originals), selected. */
    paste(at?: XYPosition): void;
}

/** The same nodes, with one block's settings changed. */
const withParams = (nodes: ModuleNode[], nodeId: string, changes: ParamValues) =>
    nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, params: { ...n.data.params, ...changes } } } : n));

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
            // A block can be dropped inside a Comment frame, or where a block is falling.
            if (n.data.type === "comment" || n.data.removing) return false;
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

/** A state of the patch in the undo history: only what lasts, without animations or selection. */
interface Snapshot {
    nodes: ModuleNode[];
    edges: CableEdge[];
}

/** Most undo steps kept. */
const HISTORY_MAX = 100;
/** Changes to the same slider or text closer than this (ms) make a single undo step. */
const COALESCE_MS = 800;

const snapshot = ({ nodes, edges }: Snapshot): Snapshot => ({
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    nodes: nodes.filter((n) => !n.data.removing).map(({ selected, dragging, resizing, ...n }) => n),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    edges: edges.filter(isLive).map(({ selected, ...e }) => e),
});

/** Patch restored from the browser, otherwise the example patch. */
const restored = loadPatch() ?? examplePatch();

export const useGraph = create<GraphState>((set, get) => {
    // ——— Undo history ———
    const past: Snapshot[] = [];
    const future: Snapshot[] = [];
    let last = { key: "", at: 0 };
    /** A block is being dragged or a Comment resized: the whole gesture is one undo step. */
    let gesture = false;
    /** Blocks copied with Ctrl+C, and how many times they were pasted without a position. */
    let clipboard: ModuleNode[] = [];
    let pastes = 0;
    /** Falls still to come from a "clear everything" cascade, cancelled by undo/redo. */
    let pendingFalls: { id: string; timer: ReturnType<typeof setTimeout> }[] = [];

    /**
     * Saves the current patch as an undo step, before a change. With a `key` (a slider or a text),
     * changes that follow each other quickly on the same key make a single step.
     */
    const record = (key = "") => {
        const now = performance.now();
        const merge = key !== "" && key === last.key && now - last.at < COALESCE_MS;
        last = { key, at: now };
        if (merge) return;
        past.push(snapshot(get()));
        if (past.length > HISTORY_MAX) past.shift();
        future.length = 0;
    };

    /** Moves one step from `from` to `to` (undo: past → future, redo: future → past). */
    const restore = (from: Snapshot[], to: Snapshot[]) => {
        const target = from.pop();
        if (!target) return;
        // Mid "clear everything": the step to come back to is the cleared mat, not the half-fallen one.
        const pending = new Set(pendingFalls.map((f) => f.id));
        pendingFalls.forEach((f) => clearTimeout(f.timer));
        pendingFalls = [];
        const current = snapshot(get());
        to.push({
            nodes: current.nodes.filter((n) => !pending.has(n.id)),
            edges: current.edges.filter((e) => !pending.has(e.source) && !pending.has(e.target)),
        });
        last = { key: "", at: 0 };
        set({ nodes: target.nodes, edges: target.edges, grab: null });
    };

    /** Unplugs a socket's cables: they fall, then disappear. */
    const unplug = (grab: Grab) => {
        const ids = new Set(get().edges.filter((e) => isLive(e) && attachedTo(e, grab)).map((e) => e.id));
        if (!ids.size) return;
        // The cable stays visible while it falls, but is no longer "live" for the audio engine.
        set({
            edges: get().edges.map((e) =>
                ids.has(e.id) ? { ...e, selectable: false, data: { ...e.data!, dropping: grab.side } } : e,
            ),
        });
        // Only the cables still falling: an undo may have brought them back in the meantime.
        setTimeout(() => set({ edges: get().edges.filter((e) => !(ids.has(e.id) && e.data?.dropping)) }), DROP_MS);
    };

    /** Cables plugged into a socket that just disappeared (a removed row, another mode) come loose on this block's side. */
    const unplugHidden = (nodeId: string) => {
        const node = get().nodes.find((n) => n.id === nodeId);
        if (!node) return;
        const { type, params } = node.data;
        for (const e of get().edges.filter(isLive)) {
            if (e.source === nodeId && !portKind(type, e.sourceHandle ?? "out", "out", params))
                unplug({ nodeId, handleId: e.sourceHandle ?? "out", side: "source" });
            if (e.target === nodeId && !portKind(type, e.targetHandle ?? "in", "in", params))
                unplug({ nodeId, handleId: e.targetHandle ?? "in", side: "target" });
        }
    };

    /** A block falls and fades out; its cables come loose on its side and fall too. */
    const drop = (nodeId: string) => {
        const node = get().nodes.find((n) => n.id === nodeId);
        if (!node || node.data.removing) return;
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
        // Only remove what is still falling: an undo may have brought the block back.
        setTimeout(
            () =>
                set({
                    nodes: get().nodes.filter((n) => !(n.id === nodeId && n.data.removing)),
                    edges: get().edges.filter((e) => !(e.data?.dropping && (e.source === nodeId || e.target === nodeId))),
                }),
            DROP_MS,
        );
    };

    return {
        nodes: restored.nodes,
        edges: restored.edges,
        grab: null,

        onNodesChange(changes) {
            // Dragging blocks or resizing a Comment: one undo step per gesture.
            const moving = changes.some((c) => (c.type === "position" && c.dragging) || (c.type === "dimensions" && c.resizing));
            const ending = changes.some(
                (c) => (c.type === "position" && c.dragging === false) || (c.type === "dimensions" && c.resizing === false),
            );
            if (moving && !gesture) record();
            if (moving) gesture = true;
            if (ending) gesture = false;
            set({ nodes: applyNodeChanges(changes, get().nodes) });
        },

        onEdgesChange(changes) {
            if (changes.some((c) => c.type === "remove")) record("delete");
            set({ edges: applyEdgeChanges(changes, get().edges) });
        },

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
            if (!get().edges.some((e) => isLive(e) && attachedTo(e, grab))) return;
            record();
            unplug(grab);
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
            record();
            set({
                edges: addEdge<CableEdge>({ ...connection, id: newId("cable"), type: "cable", data: { kind } }, get().edges),
            });
        },

        addModule: (type, position) => {
            const nodes = get().nodes;
            // A Comment lands where it is dropped, even over blocks (it goes behind them).
            const at = type === "comment" ? position : freeSpot(nodes, position);
            record();
            // Shared settings (the tempo) follow the blocks already on the mat.
            set({ nodes: alignShared([...nodes, createNode(type, at)]) });
        },

        setParam(nodeId, paramId, value) {
            const node = get().nodes.find((n) => n.id === nodeId);
            if (!node || node.data.params[paramId] === value) return;
            // A slider drag is one undo step; a click (a sequencer step, a choice) is one step each.
            const def = registry[node.data.type]?.params.find((p) => p.id === paramId);
            record(def && !def.hidden && !def.options ? `${nodeId}:${paramId}` : "");
            // A shared setting (the tempo) changes on every block of the same type.
            const targets = def?.shared ? get().nodes.filter((n) => n.data.type === node.data.type) : [node];
            set({ nodes: targets.reduce((nodes, t) => withParams(nodes, t.id, { [paramId]: value }), get().nodes) });
            // Some settings bring others along (a sequencer switched to notes gets an octave of rows).
            const adjust = registry[node.data.type]?.adjust;
            if (adjust) set({ nodes: withParams(get().nodes, nodeId, adjust(get().nodes.find((n) => n.id === nodeId)!.data.params, paramId)) });
            unplugHidden(nodeId);
        },

        setRows(nodeId, rows) {
            const node = get().nodes.find((n) => n.id === nodeId);
            const def = node && registry[node.data.type];
            if (!node || !def?.rows) return;
            const count = Math.round(Math.min(def.rows.max, Math.max(def.rows.min, rows)));
            if (count === node.data.params[def.rows.param]) return;
            // Dragging the grip over several rows is a single undo step.
            record(`${nodeId}:rows`);
            set({ nodes: withParams(get().nodes, nodeId, { [def.rows.param]: count }) });
            unplugHidden(nodeId);
        },

        setText(nodeId, text) {
            record(`${nodeId}:text`);
            set({ nodes: get().nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, text } } : n)) });
        },

        loadExample(id) {
            record();
            // The audio engine computes the diff: old blocks are disposed, new ones created.
            set(examplePatch(id));
        },

        undo: () => restore(past, future),
        redo: () => restore(future, past),

        selectAll() {
            set({ nodes: get().nodes.map((n) => (n.data.removing || n.selected ? n : { ...n, selected: true })) });
        },

        copy() {
            const selected = get().nodes.filter((n) => n.selected && !n.data.removing);
            if (!selected.length) return 0;
            clipboard = selected.map((n) => structuredClone({ ...n, selected: false }));
            pastes = 0;
            return selected.length;
        },

        paste(at) {
            if (!clipboard.length) return;
            const left = Math.min(...clipboard.map((n) => n.position.x));
            const top = Math.min(...clipboard.map((n) => n.position.y));
            // At the pointer, or a little further down each time, so copies don't hide the originals.
            const step = 40 * ++pastes;
            const dx = at ? at.x - left : step;
            const dy = at ? at.y - top : step;
            const copies = clipboard.map((n) => ({
                ...createNode(n.data.type, { x: n.position.x + dx, y: n.position.y + dy }, {
                    params: { ...n.data.params },
                    text: n.data.text,
                    size: n.width && n.height ? { width: n.width, height: n.height } : undefined,
                }),
                selected: true,
            }));
            record();
            // The copies end up selected, alone; shared settings (the tempo) follow the mat.
            const others = get().nodes.map((n) => (n.selected ? { ...n, selected: false } : n));
            set({ nodes: alignShared([...others, ...copies]) });
        },

        clearAll() {
            // Blocks fall one after the other, from left to right.
            const ids = get()
                .nodes.filter((n) => !n.data.removing)
                .sort((a, b) => a.position.x - b.position.x)
                .map((n) => n.id);
            if (!ids.length) return;
            record();
            const gap = CLEAR_TOTAL_MS / ids.length;
            pendingFalls = ids.map((id, i) => ({
                id,
                timer: setTimeout(() => {
                    pendingFalls = pendingFalls.filter((f) => f.id !== id);
                    drop(id);
                }, i * gap),
            }));
        },

        removeNode(nodeId) {
            const node = get().nodes.find((n) => n.id === nodeId);
            if (!node || node.data.removing) return;
            // Deleting a selection removes several blocks at once: a single undo step.
            record("delete");
            drop(nodeId);
        },
    };
});

// Every change to the patch is saved in the browser.
useGraph.subscribe((state, prev) => {
    if (state.nodes !== prev.nodes || state.edges !== prev.edges) savePatch(state.nodes, state.edges);
});
