import type * as Tone from "tone";

/** Type de signal transporté par un câble. */
export type PortKind = "audio" | "trigger";

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
    /** Le réglage n'a d'effet que si un câble est branché sur cette entrée (ex. "gate"). */
    activeWith?: string;
}

export type ModuleCategory = "source" | "effect" | "sequencer" | "output";

export type ParamValues = Record<string, number>;

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
    dispose(): void;
}

export interface ModuleDef {
    type: string;
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
