import type { ModuleCategory, ModuleDef, PortKind } from "./types";
import { noise } from "./noise";
import { filter } from "./filter";
import { reverb } from "./reverb";
import { output } from "./output";
import { sequencer } from "./sequencer";
import { sine } from "./sine";
import { envelope } from "./envelope";

/** Ajouter un module = l'importer ici. */
const modules: ModuleDef[] = [sequencer, sine, noise, envelope, filter, reverb, output];

export const registry: Record<string, ModuleDef> = Object.fromEntries(modules.map((m) => [m.type, m]));

export const moduleList = modules;

export const categoryColor: Record<ModuleCategory, string> = {
    source: "#ff6b9d",
    effect: "#4ecdc4",
    sequencer: "#ffd166",
    output: "#a78bfa",
};

export const portKind = (type: string, portId: string, side: "in" | "out"): PortKind | undefined => {
    const def = registry[type];
    const ports = side === "in" ? def?.inputs : def?.outputs;
    return ports?.find((p) => p.id === portId)?.kind;
};
