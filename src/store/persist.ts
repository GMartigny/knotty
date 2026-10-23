import { acceptsBlock, compatible, portKind, registry } from "../modules/registry";
import type { ParamValues } from "../modules/types";
import { COMMENT_SIZE } from "../modules/comment";
import type { CableEdge, ModuleNode } from "./graph";
import { alignShared, createCable, createNode } from "./nodes";

const KEY = "knotty:patch:v1";
const SAVE_DELAY_MS = 300;

/** What gets saved: only durable state, without selection, measurements or animations. */
interface SavedPatch {
    nodes: { id: string; type: string; x: number; y: number; params: ParamValues; text?: string; w?: number; h?: number }[];
    edges: { source: string; sourceHandle: string; target: string; targetHandle: string }[];
}

/**
 * Saved patch, cleaned up for the current app version: unknown block types are ignored,
 * settings are kept within their range and filled with their defaults, shared settings (the tempo)
 * are aligned, cables to missing or incompatible sockets and duplicate cables are removed.
 * `null` if nothing is saved or it is unreadable.
 */
export function loadPatch(): { nodes: ModuleNode[]; edges: CableEdge[] } | null {
    let saved: SavedPatch;
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        saved = JSON.parse(raw);
        if (!Array.isArray(saved?.nodes) || !Array.isArray(saved?.edges)) return null;
    } catch {
        return null;
    }

    migrate(saved);
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

/**
 * Blocks that no longer exist, turned into their replacement:
 * a Volume (removed) becomes a one-channel Mixer at the same level, its input on channel 1.
 */
function migrate(saved: SavedPatch) {
    const volumes = new Set<string>();
    for (const n of saved.nodes) {
        if (n.type !== "volume") continue;
        volumes.add(n.id);
        const db = Number.isFinite(n.params?.volume) ? n.params.volume : 0;
        const level = n.params?.mute === 1 ? 0 : Math.round(Math.pow(10, db / 20) * 100);
        n.type = "mixer";
        n.params = { channels: 1, level1: Math.min(100, Math.max(0, level)) };
    }
    for (const e of saved.edges) if (volumes.has(e.target) && e.targetHandle === "in") e.targetHandle = "in1";
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Saves the patch shortly after the last change (dragging a block writes only once). */
export function savePatch(nodes: ModuleNode[], edges: CableEdge[]) {
    clearTimeout(timer);
    timer = setTimeout(() => {
        const live = nodes.filter((n) => !n.data.removing);
        const ids = new Set(live.map((n) => n.id));
        const patch: SavedPatch = {
            nodes: live.map((n) => ({
                id: n.id,
                type: n.data.type,
                x: Math.round(n.position.x),
                y: Math.round(n.position.y),
                params: n.data.params,
                ...(n.data.type === "comment" && {
                    text: n.data.text ?? "",
                    w: Math.round(n.width ?? n.measured?.width ?? COMMENT_SIZE.width),
                    h: Math.round(n.height ?? n.measured?.height ?? COMMENT_SIZE.height),
                }),
            })),
            edges: edges
                .filter((e) => !e.data?.dropping && ids.has(e.source) && ids.has(e.target))
                .map((e) => ({
                    source: e.source,
                    sourceHandle: e.sourceHandle ?? "out",
                    target: e.target,
                    targetHandle: e.targetHandle ?? "in",
                })),
        };
        try {
            localStorage.setItem(KEY, JSON.stringify(patch));
        } catch {
            // Storage unavailable (private browsing, quota): the app keeps going without saving.
        }
    }, SAVE_DELAY_MS);
}
