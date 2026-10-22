import { compatible, portKind, registry } from "../modules/registry";
import { defaultParams, type ParamValues } from "../modules/types";
import { COMMENT_SIZE, commentFrame } from "../modules/comment";
import type { CableEdge, ModuleNode } from "./graph";

const KEY = "knotty:patch:v1";
const SAVE_DELAY_MS = 300;

/** What gets saved: only durable state, without selection, measurements or animations. */
interface SavedPatch {
    nodes: { id: string; type: string; x: number; y: number; params: ParamValues; text?: string; w?: number; h?: number }[];
    edges: { source: string; sourceHandle: string; target: string; targetHandle: string }[];
}

/**
 * Saved patch, cleaned up for the current app version: unknown block types are ignored,
 * settings are filled with their defaults, cables to missing or incompatible sockets are removed.
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

    const nodes: ModuleNode[] = saved.nodes
        .filter((n) => registry[n.type])
        .map((n) => {
            const defaults = defaultParams(registry[n.type]);
            // Only settings that still exist are kept.
            const params = Object.fromEntries(
                Object.entries(defaults).map(([id, value]) => [id, Number.isFinite(n.params?.[id]) ? n.params[id] : value]),
            );
            const node: ModuleNode = { id: n.id, type: "module", position: { x: n.x, y: n.y }, data: { type: n.type, params } };
            if (n.type !== "comment") return node;
            const size = (v: unknown, fallback: number) => (Number.isFinite(v) && (v as number) >= 80 ? (v as number) : fallback);
            return {
                ...node,
                data: { ...node.data, text: typeof n.text === "string" ? n.text : "" },
                ...commentFrame(size(n.w, COMMENT_SIZE.width), size(n.h, COMMENT_SIZE.height)),
            };
        });

    const byId = new Map(nodes.map((n) => [n.id, n.data]));
    const edges: CableEdge[] = saved.edges.flatMap((e) => {
        const src = byId.get(e.source);
        const dst = byId.get(e.target);
        if (!src || !dst) return [];
        // Sockets on hidden rows don't count: their cables are dropped.
        const out = portKind(src.type, e.sourceHandle, "out", src.params);
        const into = portKind(dst.type, e.targetHandle, "in", dst.params);
        if (!out || !into || !compatible(out, into)) return [];
        return [
            {
                id: `${e.source}:${e.sourceHandle}->${e.target}:${e.targetHandle}`,
                source: e.source,
                sourceHandle: e.sourceHandle,
                target: e.target,
                targetHandle: e.targetHandle,
                type: "cable" as const,
                data: { kind: out },
            },
        ];
    });

    return { nodes, edges };
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
