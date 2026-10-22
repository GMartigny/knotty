import type * as Tone from "tone";

/**
 * Type de signal d'une prise.
 * `mod` : entrée de modulation d'un réglage ; elle accepte les câbles audio.
 */
export type PortKind = "audio" | "trigger" | "mod";

export interface PortDef {
    id: string;
    kind: PortKind;
    label?: string;
    /** La prise est placée par le corps personnalisé du bloc, pas automatiquement. */
    inline?: boolean;
}

export type TriggerListener = (time: number) => void;

export interface ParamDef {
    id: string;
    label: string;
    min: number;
    max: number;
    default: number;
    step?: number;
    /** Échelle du curseur : logarithmique pour les fréquences. */
    scale?: "lin" | "log";
    unit?: string;
    /** Si défini, le paramètre est un choix : la valeur est l'index de l'option. */
    options?: string[];
    /** Paramètre stocké mais sans curseur (ex. motifs du séquenceur). */
    hidden?: boolean;
    /** `false` : pas de prise de modulation pour ce curseur. */
    modulatable?: false;
}

export type ModuleCategory = "source" | "effect" | "sequencer" | "output";

export type ParamValues = Record<string, number>;

/** Préfixe des prises de modulation : `mod:frequency` module le réglage `frequency`. */
export const MOD_PREFIX = "mod:";
export const modPort = (paramId: string) => `${MOD_PREFIX}${paramId}`;
export const modParamOf = (portId: string) => (portId.startsWith(MOD_PREFIX) ? portId.slice(MOD_PREFIX.length) : undefined);

/** Un curseur a une prise de modulation s'il est visible, continu et non exclu. */
export const isModulatable = (p: ParamDef) => !p.hidden && !p.options && p.modulatable !== false;

/**
 * Cible de modulation en temps réel : le signal entrant, multiplié par `depth(valeur du curseur)`,
 * s'ajoute à ce paramètre audio.
 */
export interface ModTarget {
    param: Tone.InputNode;
    depth(base: number): number;
}

/** Ampleur de modulation par défaut : ±moitié de la plage, ou ±100 % de la valeur sur une échelle log. */
export const defaultDepth = (p: ParamDef) => (base: number) => (p.scale === "log" ? base : (p.max - p.min) / 2);

/**
 * Valeur effective d'un réglage modulé lu ponctuellement (ex. au déclenchement).
 * `m` est le signal de modulation, entre -1 et 1 : ±2 octaves en log, ±moitié de la plage sinon.
 */
export const applyMod = (p: ParamDef, base: number, m: number) => {
    const v = p.scale === "log" ? base * Math.pow(2, 2 * m) : base + (m * (p.max - p.min)) / 2;
    return Math.min(p.max, Math.max(p.min, v));
};

/** Sources de modulation lues ponctuellement, fournies par le moteur. */
export class ModReader {
    private sources = new Map<string, () => number>();
    constructor(private defs: ParamDef[]) {}

    set(paramId: string, read: (() => number) | null) {
        if (read) this.sources.set(paramId, read);
        else this.sources.delete(paramId);
    }

    /** Valeur du réglage, modulée si une source est branchée. */
    value(paramId: string, base: number) {
        const read = this.sources.get(paramId);
        const def = this.defs.find((d) => d.id === paramId);
        if (!read || !def) return base;
        const m = read();
        return Number.isFinite(m) ? applyMod(def, base, m) : base;
    }
}

/** Instance audio vivante d'un module, créée par le moteur. */
export interface ModuleInstance {
    input(portId: string): Tone.InputNode | undefined;
    output(portId: string): Tone.ToneAudioNode | undefined;
    setParam(id: string, value: number): void;
    /** Appelé quand le moteur démarre (ex. lancer une source). */
    start?(): void;
    /** Sortie trigger : s'abonner aux déclenchements. Renvoie la fonction de désabonnement. */
    listen?(portId: string, fn: TriggerListener): () => void;
    /** Entrée trigger : reçoit un déclenchement à l'heure audio `time`. */
    trigger?(portId: string, time: number): void;
    /** Entrée trigger : indique si au moins un câble y est branché. */
    setTriggerConnected?(portId: string, connected: boolean): void;
    /** État affichable (ex. pas courant du séquenceur), lu par l'UI. */
    position?(): number;
    /** Modulation en temps réel d'un réglage, si ce réglage est un paramètre audio. */
    modTarget?(paramId: string): ModTarget | undefined;
    /** Sinon, modulation lue ponctuellement : le moteur fournit une fonction qui renvoie le signal (-1…1). */
    setModSource?(paramId: string, read: (() => number) | null): void;
    dispose(): void;
}

export interface ModuleDef {
    type: string;
    /** Indication affichée dans le bloc tant que rien n'est branché sur cette entrée. */
    idleHint?: { port: string; text: string };
    label: string;
    icon: string;
    category: ModuleCategory;
    inputs: PortDef[];
    outputs: PortDef[];
    params: ParamDef[];
    create(params: ParamValues): ModuleInstance;
}

export const defaultParams = (def: ModuleDef): ParamValues =>
    Object.fromEntries(def.params.map((p) => [p.id, p.default]));
