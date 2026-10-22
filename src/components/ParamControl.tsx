import { useId } from "react";
import { Handle, Position } from "@xyflow/react";
import { isModulatable, modPort, type ParamDef } from "../modules/types";

const toSlider = (p: ParamDef, v: number) =>
    p.scale === "log" ? Math.log(v / p.min) / Math.log(p.max / p.min) : (v - p.min) / (p.max - p.min);

const fromSlider = (p: ParamDef, t: number) => {
    const raw = p.scale === "log" ? p.min * Math.pow(p.max / p.min, t) : p.min + t * (p.max - p.min);
    const step = p.step ?? (p.scale === "log" ? (raw < 10 ? 0.01 : 1) : 0.01);
    return Math.round(raw / step) * step;
};

const format = (p: ParamDef, v: number) => {
    // Durations under a second in milliseconds: "2 ms" rather than "0.00 s".
    if (p.unit === "s" && v < 1) return `${Math.round(v * 1000)} ms`;
    const n = Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : Number.isInteger(v) ? `${v}` : v.toFixed(v < 10 ? 2 : 1);
    return p.unit ? `${n} ${p.unit}` : n;
};

interface Props {
    def: ParamDef;
    value: number;
    onChange(value: number): void;
    /** A cable is plugged into this setting's modulation socket. */
    modulated?: boolean;
    /** Row index on a block with a variable number of rows, used to measure row height. */
    row?: number;
}

export function ParamControl({ def, value, onChange, modulated, row }: Props) {
    const inputId = useId();
    if (def.options) {
        return (
            <div className="param">
                <span className="param-label">{def.label}</span>
                <div className="segmented nodrag" role="radiogroup" aria-label={def.label}>
                    {def.options.map((label, i) => (
                        <button
                            key={label}
                            type="button"
                            role="radio"
                            aria-checked={value === i}
                            className={value === i ? "is-on" : ""}
                            onClick={() => onChange(i)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    const t = toSlider(def, value);
    return (
        <div className={`param has-port ${def.inputPort ? "has-input" : ""} ${modulated ? "is-modulated" : ""}`} data-row={row}>
            <label className="param-label" htmlFor={inputId}>
                {def.label}
                <output>
                    {modulated && <span className="mod-badge" aria-label="modulated">∿ </span>}
                    {format(def, value)}
                </output>
            </label>
            <input
                id={inputId}
                className="slider nodrag"
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={t}
                style={{ "--t": t } as React.CSSProperties}
                onChange={(e) => onChange(fromSlider(def, Number(e.target.value)))}
            />
            {def.inputPort && (
                <Handle
                    id={def.inputPort}
                    type="target"
                    position={Position.Left}
                    className="socket socket-audio"
                    title={`"${def.label}" input`}
                />
            )}
            {isModulatable(def) && (
                <Handle
                    id={modPort(def.id)}
                    type="target"
                    position={Position.Left}
                    className="socket socket-mod"
                    title={`Modulate "${def.label}"`}
                />
            )}
        </div>
    );
}
