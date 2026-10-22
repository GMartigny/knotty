import { isModulatable, modParamOf, type ModuleCategory, type ModuleDef, type PortKind } from "./types";
import { noise } from "./noise";
import { filter } from "./filter";
import { reverb } from "./reverb";
import { output } from "./output";
import { sequencer } from "./sequencer";
import { sine } from "./sine";
import { envelope } from "./envelope";
import { volume } from "./volume";
import { mixer } from "./mixer";
import { keyboard } from "./keyboard";
import { echo } from "./echo";
import { distortion } from "./distortion";
import { scale } from "./scale";
import { comment } from "./comment";

/** Adding a module = importing it here. */
const modules: ModuleDef[] = [sequencer, keyboard, scale, sine, noise, envelope, mixer, volume, filter, echo, distortion, reverb, output, comment];

export const registry: Record<string, ModuleDef> = Object.fromEntries(modules.map((m) => [m.type, m]));

export const moduleList = modules;

export const categoryColor: Record<ModuleCategory, string> = {
    source: "#ff6b9d",
    effect: "#4ecdc4",
    sequencer: "#ffd166",
    output: "#a78bfa",
    note: "#fff6e5",
};

export const portKind = (type: string, portId: string, side: "in" | "out"): PortKind | undefined => {
    const def = registry[type];
    if (!def) return undefined;
    if (side === "in") {
        const paramId = modParamOf(portId);
        if (paramId) {
            const p = def.params.find((d) => d.id === paramId);
            return p && isModulatable(p) ? "mod" : undefined;
        }
    }
    const ports = side === "in" ? def.inputs : def.outputs;
    return ports.find((p) => p.id === portId)?.kind;
};

/** Can an output plug into an input? Audio also works as a modulation signal. */
export const compatible = (out: PortKind, into: PortKind) => out === into || (out === "audio" && into === "mod");
