import { memo, useRef, type ReactNode } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { categoryColor, registry } from "../modules/registry";
import { useGraph, type ModuleNode } from "../store/graph";
import { useLevel } from "../audio/levels";
import { ParamControl } from "./ParamControl";
import { SequencerGrid } from "./SequencerGrid";
import { EnvelopeShape } from "./EnvelopeShape";
import { MiniScope } from "./MiniScope";
import { FilterCurve } from "./FilterCurve";
import { MiniPiano } from "./MiniPiano";
import { NoteDisplay } from "./NoteDisplay";
import { DiceFace } from "./DiceFace";
import { CommentBlock } from "./CommentBlock";
import { isActive, modPort, rowCount, type ParamValues, type PortDef } from "../modules/types";
import { RowResizer } from "./RowResizer";

/** What some blocks show above their settings: a wave, a curve, a die… */
const DISPLAYS: Record<string, (id: string, params: ParamValues) => ReactNode> = {
    envelope: (_, params) => <EnvelopeShape params={params} />,
    keyboard: (id) => <MiniPiano nodeId={id} />,
    scale: (id) => <NoteDisplay nodeId={id} />,
    random: (id, params) => <DiceFace nodeId={id} count={params.values ?? 6} />,
    filter: (_, params) => <FilterCurve params={params} />,
    sine: (id, params) => <MiniScope nodeId={id} frequency={params.frequency} shape={params.shape ?? 0} />,
};

const portOffset = (index: number, count: number) => `${((index + 1) / (count + 1)) * 100}%`;

/** Sockets placed automatically on the block's edge (outputs, or inputs of a compact block). */
function EdgeSockets({ ports, side }: { ports: PortDef[]; side: "in" | "out" }) {
    const placed = ports.filter((p) => !p.inline);
    return placed.map((port, i) => (
        <Handle
            key={port.id}
            id={port.id}
            type={side === "in" ? "target" : "source"}
            position={side === "in" ? Position.Left : Position.Right}
            className={`socket socket-${port.kind}`}
            style={{ top: portOffset(i, placed.length) }}
            title={port.label}
        />
    ));
}

/** Main inputs at the top of the block, each on its own row with its name. */
function InputRows({ ports }: { ports: PortDef[] }) {
    const rows = ports.filter((p) => !p.inline);
    if (!rows.length) return null;
    return (
        <div className="port-rows">
            {rows.map((port) => (
                <div className="port-row" key={port.id}>
                    <span className={`port-dot port-dot-${port.kind}`} aria-hidden />
                    {port.label ?? "Input"}
                    <Handle
                        id={port.id}
                        type="target"
                        position={Position.Left}
                        className={`socket socket-${port.kind}`}
                        title={port.label}
                    />
                </div>
            ))}
        </div>
    );
}

/** A node on the mat: a sound block, or a Comment (text frame). */
export const ModuleBlock = memo(function ModuleBlock(props: NodeProps<ModuleNode>) {
    return props.data.type === "comment" ? <CommentBlock {...props} /> : <SoundBlock {...props} />;
});

function SoundBlock({ id, data, selected }: NodeProps<ModuleNode>) {
    const def = registry[data.type];
    const setParam = useGraph((s) => s.setParam);
    const removeNode = useGraph((s) => s.removeNode);
    const ref = useRef<HTMLDivElement>(null);
    useLevel(id, ref);
    // Inputs of this block with at least one plugged cable, as a stable string ("gate,in").
    const pluggedInputs = useGraph((s) =>
        s.edges
            .filter((e) => e.target === id && !e.data?.dropping)
            .map((e) => e.targetHandle ?? "in")
            .sort()
            .join(","),
    );
    const plugged = new Set(pluggedInputs.split(","));

    if (!def) return null;
    // A block without settings (e.g. Output) shrinks to its header.
    const compact = !def.params.some((p) => !p.hidden);

    return (
        <div
            ref={ref}
            className={[
                "block",
                `block-${def.type}`,
                compact && "is-compact",
                selected && "is-selected",
                data.removing && "is-removing",
                def.type === "output" && data.params.on === 0 && "is-off",
            ]
                .filter(Boolean)
                .join(" ")}
            style={{ "--accent": categoryColor[def.category] } as React.CSSProperties}
        >
            <header className="block-head">
                <span className="block-icon" aria-hidden>
                    {def.icon}
                </span>
                <span className="block-name">{def.label}</span>
                {def.type === "output" && (
                    <button
                        type="button"
                        role="switch"
                        aria-checked={data.params.on !== 0}
                        aria-label="Output sound"
                        title={data.params.on !== 0 ? "Mute" : "Unmute"}
                        className="toggle nodrag"
                        onClick={() => setParam(id, "on", data.params.on !== 0 ? 0 : 1)}
                    >
                        <span className="toggle-knob" aria-hidden />
                    </button>
                )}
                <button className="block-remove nodrag" type="button" aria-label={`Remove ${def.label}`} onClick={() => removeNode(id)}>
                    ×
                </button>
            </header>

            {!compact && (
                <div className="block-body">
                    <InputRows ports={def.inputs} />
                    {def.idleHint && !plugged.has(def.idleHint.port) && <p className="idle-hint">{def.idleHint.text}</p>}
                    {DISPLAYS[def.type]?.(id, data.params)}
                    {def.params
                        .filter((p) => !p.hidden && isActive(def, data.params, p))
                        .map((p) => (
                            <ParamControl
                                key={p.id}
                                def={p}
                                row={p.row}
                                value={data.params[p.id]}
                                modulated={plugged.has(modPort(p.id))}
                                onChange={(v) => setParam(id, p.id, v)}
                            />
                        ))}
                    {def.type === "sequencer" && (
                        <SequencerGrid nodeId={id} params={data.params} onChange={(param, v) => setParam(id, param, v)} />
                    )}
                </div>
            )}

            {def.rows && <RowResizer nodeId={id} min={def.rows.min} max={def.rows.max} rows={rowCount(def, data.params)} />}
            {compact && <EdgeSockets ports={def.inputs} side="in" />}
            <EdgeSockets ports={def.outputs} side="out" />
        </div>
    );
}
