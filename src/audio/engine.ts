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
          /** Real-time modulation: signal × depth → audio parameter. */
          scaler?: Tone.Multiply;
          depth?(base: number): number;
          /** Modulation read on demand: instantaneous signal value. */
          meter?: Tone.DCMeter;
      };

/** How long a trigger cable glows after a pulse, in ms. */
const PULSE_MS = 180;

/**
 * Translates the store graph into a Tone.js audio graph.
 * The store is the single source of truth: the engine only applies the differences.
 */
class AudioEngine {
    private modules = new Map<string, LiveModule>();
    private cables = new Map<string, LiveCable>();
    /** Number of trigger cables per input (`nodeId:port`). */
    private triggerInputs = new Map<string, number>();
    /** Last visual pulse per trigger cable. */
    private pulses = new Map<string, number>();
    /** On-demand modulations, per setting (`nodeId:paramId`): several cables add up. */
    private sampled = new Map<string, Set<Tone.DCMeter>>();
    private running = false;

    constructor() {
        // Sequencer clock created right away, while the transport is stopped and the tempo stable.
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
     * Intensity between 0 and 1 for animations:
     * a module's output level, or a trigger cable's glow after a pulse.
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

    /** Recent signal samples of a module, or `undefined` until sound is started. */
    scope(nodeId: string): Float32Array | undefined {
        if (!this.running) return undefined;
        return this.modules.get(nodeId)?.instance.scope?.();
    }

    /** Action played from the UI (e.g. a clicked key); no effect until sound is started. */
    play(nodeId: string, value: number) {
        if (this.running) this.modules.get(nodeId)?.instance.play?.(value);
    }

    /** Frequency played by a module, if known. */
    pitch(nodeId: string): number | undefined {
        return this.modules.get(nodeId)?.instance.pitch?.();
    }

    get sampleRate() {
        return Tone.getContext().sampleRate;
    }

    /** Audio clock, in seconds: the reference for knowing which samples are new. */
    get audioTime() {
        return Tone.getContext().currentTime;
    }

    /** Displayable state of a module (e.g. current sequencer step), -1 if none. */
    position(nodeId: string): number {
        if (!this.running) return -1;
        return this.modules.get(nodeId)?.instance.position?.() ?? -1;
    }

    private sync(allNodes: ModuleNode[], allEdges: CableEdge[]) {
        // A block or cable that is falling is already removed as far as audio is concerned.
        const nodes = allNodes.filter((n) => !n.data.removing);
        const edges = allEdges.filter((e) => !e.data?.dropping);
        const nodeIds = new Set(nodes.map((n) => n.id));
        const edgeIds = new Set(edges.map((e) => e.id));

        // 1. Removed cables (before modules, to disconnect cleanly).
        for (const [id, c] of this.cables) {
            if (edgeIds.has(id)) continue;
            this.unplug(id, c);
        }

        // 2. Removed modules.
        for (const [id, m] of this.modules) {
            if (nodeIds.has(id)) continue;
            m.meter.dispose();
            m.instance.dispose();
            this.modules.delete(id);
        }

        // 3. Added modules or changed parameters.
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
                // Modulation depth follows the slider (e.g. ±100% of the chosen frequency).
                for (const c of this.cables.values()) {
                    if (c.kind === "mod" && c.target === node.id && c.paramId === key && c.scaler && c.depth) {
                        c.scaler.factor.rampTo(c.depth(value) / SOURCE_LEVEL, 0.05);
                    }
                }
            }
            live.params = node.data.params;
        }

        // 4. Added cables.
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
            // The signal is normalized to ±1: a source at its normal level sweeps the full depth.
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
                // already disconnected when a module was disposed
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
            // already disconnected when a module was disposed
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
