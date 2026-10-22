import { compatible, portKind, registry } from "../modules/registry";
import { defaultParams, type ParamValues } from "../modules/types";
import type { CableEdge, ModuleNode } from "./graph";

const KEY = "knotty:patch:v1";
const SAVE_DELAY_MS = 300;

/** Ce qui est enregistré : uniquement l'état durable, sans sélection, mesures ni animations. */
interface SavedPatch {
    nodes: { id: string; type: string; x: number; y: number; params: ParamValues }[];
    edges: { source: string; sourceHandle: string; target: string; targetHandle: string }[];
}

/**
 * Patch enregistré, nettoyé pour la version actuelle de l'app : types de blocs inconnus ignorés,
 * réglages complétés par leurs valeurs par défaut, câbles vers des prises disparues ou incompatibles retirés.
 * `null` s'il n'y a rien d'enregistré ou si c'est illisible.
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
            // Seuls les réglages qui existent encore sont repris.
            const params = Object.fromEntries(
                Object.entries(defaults).map(([id, value]) => [id, Number.isFinite(n.params?.[id]) ? n.params[id] : value]),
            );
            return { id: n.id, type: "module", position: { x: n.x, y: n.y }, data: { type: n.type, params } };
        });

    const typeOf = new Map(nodes.map((n) => [n.id, n.data.type]));
    const edges: CableEdge[] = saved.edges.flatMap((e) => {
        const srcType = typeOf.get(e.source);
        const dstType = typeOf.get(e.target);
        if (!srcType || !dstType) return [];
        const out = portKind(srcType, e.sourceHandle, "out");
        const into = portKind(dstType, e.targetHandle, "in");
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

/** Enregistre le patch peu après la dernière modification (un glissement de bloc n'écrit qu'une fois). */
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
            // Stockage indisponible (navigation privée, quota) : l'app continue sans sauvegarde.
        }
    }, SAVE_DELAY_MS);
}
