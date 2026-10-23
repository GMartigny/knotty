import { acceptsBlock, compatible, portKind, registry } from "../modules/registry";
import { defaultParams, type ParamValues } from "../modules/types";
import { COMMENT_SIZE } from "../modules/comment";
import type { CableEdge, ModuleNode } from "./graph";
import { alignShared, createCable, createNode, newId } from "./nodes";

const KEY = "knotty:patch:v2";
const SAVE_DELAY_MS = 300;

export type Patch = { nodes: ModuleNode[]; edges: CableEdge[] };

/** A patch once expanded from its compact form, before clean-up. */
interface SavedPatch {
    nodes: { id: string; type: string; x: number; y: number; params: ParamValues; text?: string; w?: number; h?: number }[];
    edges: { source: string; sourceHandle: string; target: string; targetHandle: string }[];
}

/** A block, compact: type, position, settings that differ from the defaults, and a Comment's text and size. */
type CompactNode = [type: string, x: number, y: number, params?: ParamValues | null, text?: string | null, w?: number, h?: number];

/**
 * A patch, compact (saved in the browser and shared in links): block ids are dropped (cables point to
 * blocks by their index), and so are settings left at their default.
 */
export interface CompactPatch {
    v: 2;
    n: CompactNode[];
    e: [from: number, sourceHandle: string, to: number, targetHandle: string][];
}

/** The patch in its compact form, without falling blocks or cables. */
export function toCompact(nodes: ModuleNode[], edges: CableEdge[]): CompactPatch {
    const live = nodes.filter((n) => !n.data.removing);
    const index = new Map(live.map((n, i) => [n.id, i]));
    return {
        v: 2,
        n: live.map((n) => {
            const { type } = n.data;
            const defaults = registry[type] ? defaultParams(registry[type]) : {};
            const changed = Object.entries(n.data.params).filter(([id, v]) => v !== defaults[id]);
            const node: CompactNode = [type, Math.round(n.position.x), Math.round(n.position.y), changed.length ? Object.fromEntries(changed) : null];
            if (type === "comment")
                node.push(
                    n.data.text ?? "",
                    Math.round(n.width ?? n.measured?.width ?? COMMENT_SIZE.width),
                    Math.round(n.height ?? n.measured?.height ?? COMMENT_SIZE.height),
                );
            // Nothing after the settings: no need for an empty slot.
            while (node.length > 3 && node[node.length - 1] == null) node.pop();
            return node;
        }),
        e: edges
            .filter((e) => !e.data?.dropping && index.has(e.source) && index.has(e.target))
            .map((e) => [index.get(e.source)!, e.sourceHandle ?? "out", index.get(e.target)!, e.targetHandle ?? "in"]),
    };
}

/** A compact patch, expanded with new block ids; `null` if it isn't one. */
function expand(data: unknown): SavedPatch | null {
    const d = data as Partial<CompactPatch> | null;
    if (d?.v !== 2 || !Array.isArray(d.n) || !Array.isArray(d.e) || !d.n.every(Array.isArray)) return null;
    const ids = d.n.map((n) => newId(String(n[0])));
    return {
        nodes: d.n.map(([type, x, y, params, text, w, h], i) => ({
            id: ids[i],
            type: String(type),
            x: Number(x) || 0,
            y: Number(y) || 0,
            params: params ?? {},
            ...(text != null && { text, w, h }),
        })),
        edges: d.e
            .filter((e) => Array.isArray(e) && ids[e[0]] && ids[e[2]])
            .map(([from, sourceHandle, to, targetHandle]) => ({ source: ids[from], sourceHandle, target: ids[to], targetHandle })),
    };
}

/**
 * A saved or shared patch, cleaned up for the current app version: unknown block types are ignored,
 * settings are kept within their range and filled with their defaults, shared settings (the tempo)
 * are aligned, cables to missing or incompatible sockets and duplicate cables are removed.
 * `null` if it isn't a patch.
 */
export function readPatch(data: unknown): Patch | null {
    const saved = expand(data);
    if (!saved) return null;

    const nodes = alignShared(
        saved.nodes
            .filter((n) => registry[n.type])
            .map((n) => {
                // Only settings that still exist are kept, within their range.
                const params: ParamValues = {};
                for (const p of registry[n.type].params) {
                    const v = n.params?.[p.id];
                    if (Number.isFinite(v)) params[p.id] = Math.min(p.max, Math.max(p.min, v));
                }
                const size = (v: unknown, fallback: number) => (Number.isFinite(v) && (v as number) >= 80 ? (v as number) : fallback);
                return createNode(n.type, { x: n.x, y: n.y }, {
                    id: n.id,
                    params,
                    text: typeof n.text === "string" ? n.text : "",
                    size: { width: size(n.w, COMMENT_SIZE.width), height: size(n.h, COMMENT_SIZE.height) },
                });
            }),
    );

    const byId = new Map(nodes.map((n) => [n.id, n.data]));
    const edges = new Map<string, CableEdge>();
    for (const e of saved.edges) {
        const src = byId.get(e.source);
        const dst = byId.get(e.target);
        if (!src || !dst) continue;
        // Sockets on hidden rows don't count: their cables are dropped.
        const out = portKind(src.type, e.sourceHandle, "out", src.params);
        const into = portKind(dst.type, e.targetHandle, "in", dst.params);
        if (!out || !into || !compatible(out, into) || !acceptsBlock(dst.type, e.targetHandle, src.type)) continue;
        const cable = createCable(e.source, e.sourceHandle, e.target, e.targetHandle, out);
        edges.set(cable.id, cable);
    }

    return { nodes, edges: [...edges.values()] };
}

/** The patch saved in the browser (see `readPatch`), or `null` if nothing readable is saved. */
export function loadPatch(): Patch | null {
    try {
        const raw = localStorage.getItem(KEY);
        return raw ? readPatch(JSON.parse(raw)) : null;
    } catch {
        return null;
    }
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Saves the patch, compact, shortly after the last change (dragging a block writes only once). */
export function savePatch(nodes: ModuleNode[], edges: CableEdge[]) {
    clearTimeout(timer);
    timer = setTimeout(() => {
        try {
            localStorage.setItem(KEY, JSON.stringify(toCompact(nodes, edges)));
        } catch {
            // Storage unavailable (private browsing, quota): the app keeps going without saving.
        }
    }, SAVE_DELAY_MS);
}
