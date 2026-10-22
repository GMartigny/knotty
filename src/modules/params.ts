import type { ParamDef } from "./types";

/** Slider position (0…1) of a value: logarithmic for frequencies. */
export const toSlider = (p: ParamDef, v: number) =>
    p.scale === "log" ? Math.log(v / p.min) / Math.log(p.max / p.min) : (v - p.min) / (p.max - p.min);

/** Value of a slider position (0…1), rounded to the setting's step. */
export const fromSlider = (p: ParamDef, t: number) => {
    const raw = p.scale === "log" ? p.min * Math.pow(p.max / p.min, t) : p.min + t * (p.max - p.min);
    const step = p.step ?? (p.scale === "log" ? (raw < 10 ? 0.01 : 1) : 0.01);
    // Rounded to the step, without float noise (0.30000000000000004), and kept within range.
    const decimals = Math.max(0, -Math.floor(Math.log10(step)));
    const value = Number((Math.round(raw / step) * step).toFixed(decimals));
    return Math.min(p.max, Math.max(p.min, value));
};

/** Value as shown next to its slider, with its unit. */
export const formatValue = (p: ParamDef, v: number) => {
    // Durations under a second in milliseconds: "2 ms" rather than "0.00 s".
    if (p.unit === "s" && v < 1) return `${Math.round(v * 1000)} ms`;
    const size = Math.abs(v);
    const n = size >= 1000 ? `${(v / 1000).toFixed(1)}k` : Number.isInteger(v) ? `${v}` : v.toFixed(size < 10 ? 2 : 1);
    return p.unit ? `${n} ${p.unit}` : n;
};
