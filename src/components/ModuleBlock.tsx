import { memo, useRef } from "react";
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
import { CommentBlock } from "./CommentBlock";
import { isActive, modPort, rowCount, type PortDef } from "../modules/types";
import { RowResizer } from "./RowResizer";

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
    const compact = !def.params.some((p) => !p.hidden) && def.type !== "sequencer";

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
                    {def.type === "envelope" && <EnvelopeShape params={data.params} />}
                    {def.type === "keyboard" && <MiniPiano nodeId={id} />}
                    {def.type === "scale" && <NoteDisplay nodeId={id} />}
                    {def.type === "filter" && <FilterCurve params={data.params} />}
                    {def.type === "sine" && <MiniScope nodeId={id} frequency={data.params.frequency} shape={data.params.shape ?? 0} />}
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

            {def.rows && <RowResizer nodeId={id} def={{ ...def, rows: def.rows }} rows={rowCount(def, data.params)} />}
            {compact && <EdgeSockets ports={def.inputs} side="in" />}
            <EdgeSockets ports={def.outputs} side="out" />
        </div>
    );
}
