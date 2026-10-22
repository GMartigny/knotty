import type { ParamDef } from "../modules/types";

const toSlider = (p: ParamDef, v: number) =>
    p.scale === "log" ? Math.log(v / p.min) / Math.log(p.max / p.min) : (v - p.min) / (p.max - p.min);

const fromSlider = (p: ParamDef, t: number) => {
    const raw = p.scale === "log" ? p.min * Math.pow(p.max / p.min, t) : p.min + t * (p.max - p.min);
    const step = p.step ?? (p.scale === "log" ? 1 : 0.01);
    return Math.round(raw / step) * step;
};

const format = (p: ParamDef, v: number) => {
    const n = Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : Number.isInteger(v) ? `${v}` : v.toFixed(v < 10 ? 2 : 1);
    return p.unit ? `${n} ${p.unit}` : n;
};

interface Props {
    def: ParamDef;
    value: number;
    onChange(value: number): void;
    /** Le réglage reste modifiable mais n'a pas d'effet tant que son entrée n'est pas branchée. */
    inactive?: boolean;
}

export function ParamControl({ def, value, onChange, inactive }: Props) {
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
        <label
            className={`param ${inactive ? "is-inactive" : ""}`}
            title={inactive ? "S'entend quand un câble est branché sur le Déclencheur" : undefined}
        >
            <span className="param-label">
                {def.label}
                <output>{format(def, value)}</output>
            </span>
            <input
                className="slider nodrag"
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={t}
                style={{ "--t": t } as React.CSSProperties}
                onChange={(e) => onChange(fromSlider(def, Number(e.target.value)))}
            />
        </label>
    );
}
