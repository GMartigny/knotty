import * as Tone from "tone";
import { registry } from "../modules/registry";
import type { ModuleInstance, ParamValues } from "../modules/types";
import { useGraph, type CableEdge, type ModuleNode } from "../store/graph";

interface LiveModule {
    instance: ModuleInstance;
    params: ParamValues;
    meter: Tone.Meter;
}

interface LiveCable {
    from: Tone.ToneAudioNode;
    to: Tone.InputNode;
}

/**
 * Traduit le graphe du store en graphe audio Tone.js.
 * Le store est la seule source de vérité : le moteur ne fait qu'appliquer les différences.
 */
class AudioEngine {
    private modules = new Map<string, LiveModule>();
    private cables = new Map<string, LiveCable>();
    private running = false;

    constructor() {
        const { nodes, edges } = useGraph.getState();
        this.sync(nodes, edges);
        useGraph.subscribe((state, prev) => {
            if (state.nodes !== prev.nodes || state.edges !== prev.edges) this.sync(state.nodes, state.edges);
        });
    }

    get isRunning() {
        return this.running;
    }

    async start() {
        await Tone.start();
        this.running = true;
        for (const m of this.modules.values()) m.instance.start?.();
    }

    /** Niveau de sortie d'un module entre 0 et 1, pour les animations. */
    level(nodeId: string): number {
        const meter = this.modules.get(nodeId)?.meter;
        if (!meter || !this.running) return 0;
        const db = meter.getValue() as number;
        return Number.isFinite(db) ? Math.min(1, Math.max(0, (db + 60) / 60)) : 0;
    }

    private sync(nodes: ModuleNode[], edges: CableEdge[]) {
        const nodeIds = new Set(nodes.map((n) => n.id));
        const edgeIds = new Set(edges.map((e) => e.id));

        // 1. Câbles supprimés (avant les modules, pour déconnecter proprement).
        for (const [id, c] of this.cables) {
            if (edgeIds.has(id)) continue;
            try {
                c.from.disconnect(c.to);
            } catch {
                // déjà déconnecté par la destruction d'un module
            }
            this.cables.delete(id);
        }

        // 2. Modules supprimés.
        for (const [id, m] of this.modules) {
            if (nodeIds.has(id)) continue;
            m.meter.dispose();
            m.instance.dispose();
            this.modules.delete(id);
        }

        // 3. Modules ajoutés ou paramètres modifiés.
        for (const node of nodes) {
            const live = this.modules.get(node.id);
            if (!live) {
                this.add(node);
                continue;
            }
            if (live.params === node.data.params) continue;
            for (const [key, value] of Object.entries(node.data.params)) {
                if (live.params[key] !== value) live.instance.setParam(key, value);
            }
            live.params = node.data.params;
        }

        // 4. Câbles ajoutés.
        for (const edge of edges) {
            if (this.cables.has(edge.id)) continue;
            const from = this.modules.get(edge.source)?.instance.output(edge.sourceHandle ?? "out");
            const to = this.modules.get(edge.target)?.instance.input(edge.targetHandle ?? "in");
            if (!from || !to) continue;
            from.connect(to);
            this.cables.set(edge.id, { from, to });
        }
    }

    private add(node: ModuleNode) {
        const def = registry[node.data.type];
        if (!def) return;
        const instance = def.create(node.data.params);
        const meter = new Tone.Meter({ smoothing: 0.85 });
        const tap = instance.output("out") ?? instance.input("in");
        if (tap) (tap as Tone.ToneAudioNode).connect(meter);
        this.modules.set(node.id, { instance, params: node.data.params, meter });
        if (this.running) instance.start?.();
    }
}

export const engine = new AudioEngine();
