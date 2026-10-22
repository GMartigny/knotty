import * as Tone from "tone";
import { startClock } from "./clock";
import { registry } from "../modules/registry";
import { modParamOf, SOURCE_LEVEL, type ModuleInstance, type ParamValues } from "../modules/types";
import { useGraph, type CableEdge, type ModuleNode } from "../store/graph";

interface LiveModule {
    instance: ModuleInstance;
    params: ParamValues;
    meter: Tone.Meter;
}

type LiveCable =
    | { kind: "audio"; from: Tone.ToneAudioNode; to: Tone.InputNode }
    | { kind: "trigger"; target: string; port: string; unsubscribe(): void }
    | {
          kind: "mod";
          from: Tone.ToneAudioNode;
          target: string;
          paramId: string;
          /** Modulation en temps réel : signal × profondeur → paramètre audio. */
          scaler?: Tone.Multiply;
          depth?(base: number): number;
          /** Modulation lue ponctuellement : valeur instantanée du signal. */
          meter?: Tone.DCMeter;
      };

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
    /** Modulations lues ponctuellement, par réglage (`nodeId:paramId`) : plusieurs câbles s'additionnent. */
    private sampled = new Map<string, Set<Tone.DCMeter>>();
    private running = false;

    constructor() {
        // Horloge des séquenceurs créée tout de suite, transport arrêté et tempo stable.
        startClock();
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

    /** Échantillons récents du signal d'un module, ou `undefined` tant que le son n'est pas lancé. */
    scope(nodeId: string): Float32Array | undefined {
        if (!this.running) return undefined;
        return this.modules.get(nodeId)?.instance.scope?.();
    }

    /** Action jouée depuis l'interface (ex. une touche cliquée) ; sans effet tant que le son n'est pas lancé. */
    play(nodeId: string, value: number) {
        if (this.running) this.modules.get(nodeId)?.instance.play?.(value);
    }

    /** Fréquence jouée par un module, si elle est connue. */
    pitch(nodeId: string): number | undefined {
        return this.modules.get(nodeId)?.instance.pitch?.();
    }

    get sampleRate() {
        return Tone.getContext().sampleRate;
    }

    /** Horloge audio, en secondes : la référence pour savoir quels échantillons sont nouveaux. */
    get audioTime() {
        return Tone.getContext().currentTime;
    }

    /** État affichable d'un module (ex. pas courant du séquenceur), -1 si aucun. */
    position(nodeId: string): number {
        if (!this.running) return -1;
        return this.modules.get(nodeId)?.instance.position?.() ?? -1;
    }

    private sync(allNodes: ModuleNode[], allEdges: CableEdge[]) {
        // Un bloc ou un câble en train de tomber est déjà retiré pour l'audio.
        const nodes = allNodes.filter((n) => !n.data.removing);
        const edges = allEdges.filter((e) => !e.data?.dropping);
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
                if (live.params[key] === value) continue;
                live.instance.setParam(key, value);
                // La profondeur de modulation suit le curseur (ex. ±100 % de la fréquence choisie).
                for (const c of this.cables.values()) {
                    if (c.kind === "mod" && c.target === node.id && c.paramId === key && c.scaler && c.depth) {
                        c.scaler.factor.rampTo(c.depth(value) / SOURCE_LEVEL, 0.05);
                    }
                }
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
            const unsubscribe = src.listen(outPort, (time, note) => {
                dst.trigger!(inPort, time, note);
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
        if (!from) return;

        const paramId = modParamOf(inPort);
        if (paramId) {
            this.plugMod(edge, from, dst, paramId);
            return;
        }

        const to = dst.input(inPort);
        if (!to) return;
        from.connect(to);
        this.cables.set(edge.id, { kind: "audio", from, to });
    }

    private plugMod(edge: CableEdge, from: Tone.ToneAudioNode, dst: ModuleInstance, paramId: string) {
        const base = this.modules.get(edge.target)?.params[paramId] ?? 0;
        const target = dst.modTarget?.(paramId);
        if (target) {
            // Le signal est ramené à ±1 : une source à son niveau normal parcourt toute la profondeur.
            const scaler = new Tone.Multiply(target.depth(base) / SOURCE_LEVEL);
            from.connect(scaler);
            scaler.connect(target.param);
            this.cables.set(edge.id, { kind: "mod", from, target: edge.target, paramId, scaler, depth: target.depth });
            return;
        }
        if (!dst.setModSource) return;
        const meter = new Tone.DCMeter();
        from.connect(meter);
        const key = `${edge.target}:${paramId}`;
        const meters = this.sampled.get(key) ?? new Set();
        meters.add(meter);
        this.sampled.set(key, meters);
        this.updateSampled(edge.target, paramId);
        this.cables.set(edge.id, { kind: "mod", from, target: edge.target, paramId, meter });
    }

    private updateSampled(nodeId: string, paramId: string) {
        const meters = this.sampled.get(`${nodeId}:${paramId}`);
        const instance = this.modules.get(nodeId)?.instance;
        if (!meters?.size) {
            this.sampled.delete(`${nodeId}:${paramId}`);
            instance?.setModSource?.(paramId, null);
            return;
        }
        instance?.setModSource?.(paramId, () => {
            let sum = 0;
            for (const m of meters) sum += (m.getValue() as number) / SOURCE_LEVEL;
            return Math.max(-1, Math.min(1, sum));
        });
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
        if (cable.kind === "mod") {
            const sink = cable.scaler ?? cable.meter;
            try {
                if (sink) cable.from.disconnect(sink);
            } catch {
                // déjà déconnecté par la destruction d'un module
            }
            cable.scaler?.dispose();
            if (cable.meter) {
                this.sampled.get(`${cable.target}:${cable.paramId}`)?.delete(cable.meter);
                cable.meter.dispose();
                this.updateSampled(cable.target, cable.paramId);
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
