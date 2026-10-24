import { useId } from "react";
import { Handle, Position } from "@xyflow/react";
import { isModulatable, modPort, type ParamDef } from "../modules/types";
import { formatValue, fromSlider, toSlider } from "../modules/params";

interface Props {
    def: ParamDef;
    value: number;
    onChange(value: number): void;
    /** A cable is plugged into this setting's modulation socket. */
    modulated?: boolean;
    /** Row index on a block with a variable number of rows, used to measure row height. */
    row?: number;
    /** With `def.mute`: whether the setting is silenced, and the switch's action. */
    muted?: boolean;
    onMute?(muted: boolean): void;
}

export function ParamControl({ def, value, onChange, modulated, row, muted, onMute }: Props) {
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
        <div
            className={`param has-port ${def.inputPort ? "has-input" : ""} ${modulated ? "is-modulated" : ""} ${def.bare ? "is-bare" : ""} ${onMute ? "has-mute" : ""} ${muted ? "is-muted" : ""}`}
            data-row={row}
        >
            {def.bare ? (
                <output className="param-value" htmlFor={inputId}>
                    {formatValue(def, value)}
                </output>
            ) : (
                <label className="param-label" htmlFor={inputId}>
                    {def.label}
                    <output>
                        {modulated && <span className="mod-badge" aria-label="modulated">∿ </span>}
                        {formatValue(def, value)}
                    </output>
                </label>
            )}
            <input
                id={inputId}
                aria-label={def.bare ? def.label : undefined}
                className="slider nodrag"
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={t}
                style={{ "--t": t } as React.CSSProperties}
                onChange={(e) => onChange(fromSlider(def, Number(e.target.value)))}
            />
            {onMute && (
                <button
                    type="button"
                    role="switch"
                    aria-checked={!muted}
                    aria-label={`${def.label} sound`}
                    title={muted ? "Unmute" : "Mute"}
                    className="toggle toggle-mini nodrag"
                    onClick={() => onMute(!muted)}
                >
                    <span className="toggle-knob" aria-hidden />
                </button>
            )}
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
