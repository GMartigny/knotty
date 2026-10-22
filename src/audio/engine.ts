import * as Tone from "tone";
import { registry } from "../modules/registry";
import type { ModuleInstance, ParamValues } from "../modules/types";
import { useGraph, type CableEdge, type ModuleNode } from "../store/graph";

interface LiveModule {
    instance: ModuleInstance;
    params: ParamValues;
    meter: Tone.Meter;
}

type LiveCable =
    | { kind: "audio"; from: Tone.ToneAudioNode; to: Tone.InputNode }
    | { kind: "trigger"; target: string; port: string; unsubscribe(): void };

/** Durée de la lueur d'un câble trigger après une impulsion, en ms. */
const PULSE_MS = 180;

/**
 * Traduit le graphe du store en graphe audio Tone.js.
 * Le store est la seule source de vérité : le moteur ne fait qu'appliquer les différences.
 */
class AudioEngine {
    private modules = new Map<string, LiveModule>();
    private cables = new Map<string, LiveCable>();
    /** Nombre de câbles trigger par entrée (`nodeId:port`). */
    private triggerInputs = new Map<string, number>();
    /** Dernière impulsion visuelle par câble trigger. */
    private pulses = new Map<string, number>();
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
        Tone.getTransport().start("+0.05");
    }

    /**
     * Intensité entre 0 et 1 pour les animations :
     * niveau de sortie d'un module, ou lueur d'un câble trigger après une impulsion.
     */
    level(key: string): number {
        if (!this.running) return 0;
        const meter = this.modules.get(key)?.meter;
        if (meter) {
            const db = meter.getValue() as number;
            return Number.isFinite(db) ? Math.min(1, Math.max(0, (db + 60) / 60)) : 0;
        }
        const pulse = this.pulses.get(key);
        if (pulse === undefined) return 0;
        return Math.max(0, 1 - (performance.now() - pulse) / PULSE_MS);
    }

    /** État affichable d'un module (ex. pas courant du séquenceur), -1 si aucun. */
    position(nodeId: string): number {
        if (!this.running) return -1;
        return this.modules.get(nodeId)?.instance.position?.() ?? -1;
    }

    private sync(nodes: ModuleNode[], edges: CableEdge[]) {
        const nodeIds = new Set(nodes.map((n) => n.id));
        const edgeIds = new Set(edges.map((e) => e.id));

        // 1. Câbles supprimés (avant les modules, pour déconnecter proprement).
        for (const [id, c] of this.cables) {
            if (edgeIds.has(id)) continue;
            this.unplug(id, c);
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
            if (!this.cables.has(edge.id)) this.plug(edge);
        }
    }

    private plug(edge: CableEdge) {
        const src = this.modules.get(edge.source)?.instance;
        const dst = this.modules.get(edge.target)?.instance;
        if (!src || !dst) return;
        const outPort = edge.sourceHandle ?? "out";
        const inPort = edge.targetHandle ?? "in";

        if (edge.data?.kind === "trigger") {
            if (!src.listen || !dst.trigger) return;
            const unsubscribe = src.listen(outPort, (time) => {
                dst.trigger!(inPort, time);
                Tone.getDraw().schedule(() => this.pulses.set(edge.id, performance.now()), time);
            });
            const key = `${edge.target}:${inPort}`;
            const count = (this.triggerInputs.get(key) ?? 0) + 1;
            this.triggerInputs.set(key, count);
            if (count === 1) dst.setTriggerConnected?.(inPort, true);
            this.cables.set(edge.id, { kind: "trigger", target: edge.target, port: inPort, unsubscribe });
            return;
        }

        const from = src.output(outPort);
        const to = dst.input(inPort);
        if (!from || !to) return;
        from.connect(to);
        this.cables.set(edge.id, { kind: "audio", from, to });
    }

    private unplug(id: string, cable: LiveCable) {
        this.cables.delete(id);
        if (cable.kind === "trigger") {
            cable.unsubscribe();
            this.pulses.delete(id);
            const key = `${cable.target}:${cable.port}`;
            const count = (this.triggerInputs.get(key) ?? 1) - 1;
            if (count > 0) {
                this.triggerInputs.set(key, count);
            } else {
                this.triggerInputs.delete(key);
                this.modules.get(cable.target)?.instance.setTriggerConnected?.(cable.port, false);
            }
            return;
        }
        try {
            cable.from.disconnect(cable.to);
        } catch {
            // déjà déconnecté par la destruction d'un module
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
