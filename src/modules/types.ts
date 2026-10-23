import type * as Tone from "tone";

/**
 * Signal type of a socket.
 * `mod`: modulation input of a setting; it accepts audio cables.
 */
export type PortKind = "audio" | "trigger" | "mod";

export interface PortDef {
    id: string;
    kind: PortKind;
    label?: string;
    /** The socket is placed by the block's custom body, not automatically. */
    inline?: boolean;
    /** Row this socket belongs to, on a block with a variable number of rows (see `ModuleDef.rows`). */
    row?: number;
}

/** Trigger at audio time `time`, optionally with a note (frequency in Hz). */
/**
 * How a trigger is played. Without a gate, it's a hit of a set length (a sequencer step);
 * "on" and "off" are a key pressed then released, and the note lasts as long as the key is held.
 */
export type Gate = "on" | "off";
export type TriggerListener = (time: number, note?: number, gate?: Gate) => void;

export interface ParamDef {
    id: string;
    label: string;
    min: number;
    max: number;
    default: number;
    step?: number;
    /** Slider scale: logarithmic for frequencies. */
    scale?: "lin" | "log";
    unit?: string;
    /** If set, the parameter is a choice: the value is the option index. */
    options?: string[];
    /** Stored parameter without a slider (e.g. sequencer patterns). */
    hidden?: boolean;
    /** `false`: no modulation socket for this slider. */
    modulatable?: false;
    /** Audio input shown on this slider's row (e.g. a Mixer channel). */
    inputPort?: string;
    /** Row this setting belongs to, on a block with a variable number of rows (see `ModuleDef.rows`). */
    row?: number;
    /** Show only the slider and its value, without the label (still read by screen readers). */
    bare?: boolean;
    /** The same value on every block of this type (e.g. the sequencers' tempo, which is global). */
    shared?: boolean;
}

export type ModuleCategory = "source" | "effect" | "sequencer" | "output" | "note";

export type ParamValues = Record<string, number>;

/** Output level of sources (−12 dB). Modulation from a source at this level sweeps the whole range. */
export const SOURCE_DB = -12;
export const SOURCE_LEVEL = Math.pow(10, SOURCE_DB / 20);

/** Prefix of modulation sockets: `mod:frequency` modulates the `frequency` setting. */
const MOD_PREFIX = "mod:";
export const modPort = (paramId: string) => `${MOD_PREFIX}${paramId}`;
export const modParamOf = (portId: string) => (portId.startsWith(MOD_PREFIX) ? portId.slice(MOD_PREFIX.length) : undefined);

/** A slider has a modulation socket if it is visible, continuous and not excluded. */
export const isModulatable = (p: ParamDef) => !p.hidden && !p.options && p.modulatable !== false;

/**
 * Real-time modulation target: the incoming signal, multiplied by `depth(slider value)`,
 * is added to this audio parameter.
 */
export interface ModTarget {
    param: Tone.InputNode;
    depth(base: number): number;
}

/** Default modulation depth: ±half the range, or ±100% of the value on a log scale. */
export const defaultDepth = (p: ParamDef) => (base: number) => (p.scale === "log" ? base : (p.max - p.min) / 2);

/**
 * Effective value of a modulated setting read at a given moment (e.g. on trigger).
 * `m` is the modulation signal, between -1 and 1: ±2 octaves on a log scale, ±half the range otherwise.
 */
const applyMod = (p: ParamDef, base: number, m: number) => {
    const v = p.scale === "log" ? base * Math.pow(2, 2 * m) : base + (m * (p.max - p.min)) / 2;
    return Math.min(p.max, Math.max(p.min, v));
};

/** Modulation sources read on demand, provided by the engine. */
export class ModReader {
    private sources = new Map<string, () => number>();
    constructor(private defs: ParamDef[]) {}

    set(paramId: string, read: (() => number) | null) {
        if (read) this.sources.set(paramId, read);
        else this.sources.delete(paramId);
    }

    /** Setting value, modulated if a source is plugged in. */
    value(paramId: string, base: number) {
        const read = this.sources.get(paramId);
        const def = this.defs.find((d) => d.id === paramId);
        if (!read || !def) return base;
        const m = read();
        return Number.isFinite(m) ? applyMod(def, base, m) : base;
    }
}

/** Live audio instance of a module, created by the engine. */
export interface ModuleInstance {
    input(portId: string): Tone.InputNode | undefined;
    output(portId: string): Tone.ToneAudioNode | undefined;
    setParam(id: string, value: number): void;
    /** Called when the engine starts (e.g. to start a source). */
    start?(): void;
    /** Trigger output: subscribe to triggers. Returns the unsubscribe function. */
    listen?(portId: string, fn: TriggerListener): () => void;
    /** Trigger input: receives a trigger at audio time `time`, with the played note and the gate if any. */
    trigger?(portId: string, time: number, note?: number, gate?: Gate): void;
    /** Trigger input: tells whether at least one cable is plugged in. */
    setTriggerConnected?(portId: string, connected: boolean): void;
    /** Displayable state (e.g. current sequencer step), read by the UI. */
    position?(): number;
    /** Latest signal samples, for the waveform display. */
    scope?(): Float32Array;
    /** Frequency currently playing (it may come from a note rather than the slider). */
    pitch?(): number;
    /** Action played from the UI: a mini-piano key pressed (`down`) or released. */
    play?(value: number, down: boolean): void;
    /** Real-time modulation of a setting, if that setting is an audio parameter. */
    modTarget?(paramId: string): ModTarget | undefined;
    /** Otherwise, modulation read on demand: the engine provides a function returning the signal (-1…1). */
    setModSource?(paramId: string, read: (() => number) | null): void;
    dispose(): void;
}

export interface ModuleDef {
    type: string;
    /** Hint shown in the block while nothing is plugged into this input. */
    idleHint?: { port: string; text: string };
    label: string;
    icon: string;
    category: ModuleCategory;
    inputs: PortDef[];
    outputs: PortDef[];
    params: ParamDef[];
    /**
     * Variable number of rows, set by dragging the block's bottom edge and stored in the `param` setting.
     * Sockets and settings tagged with a `row` beyond that count are hidden and can't be plugged.
     */
    rows?: { param: string; min: number; max: number };
    create(params: ParamValues): ModuleInstance;
}

/** Number of rows shown by a block (or `Infinity` if it has a fixed layout). */
export const rowCount = (def: ModuleDef, params: ParamValues) =>
    def.rows ? (params[def.rows.param] ?? def.params.find((p) => p.id === def.rows!.param)?.default ?? def.rows.max) : Infinity;

/** Is this socket or setting part of a visible row? */
export const isActive = (def: ModuleDef, params: ParamValues, item: { row?: number }) =>
    item.row === undefined || item.row < rowCount(def, params);

export const defaultParams = (def: ModuleDef): ParamValues =>
    Object.fromEntries(def.params.map((p) => [p.id, p.default]));
