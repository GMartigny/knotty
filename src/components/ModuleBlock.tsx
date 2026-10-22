import { memo, useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { categoryColor, registry } from "../modules/registry";
import { useGraph, type ModuleNode } from "../store/graph";
import { useLevel } from "../audio/levels";
import { ParamControl } from "./ParamControl";
import { SequencerGrid } from "./SequencerGrid";
import { EnvelopeShape } from "./EnvelopeShape";
import type { PortDef } from "../modules/types";

const portOffset = (index: number, count: number) => `${((index + 1) / (count + 1)) * 100}%`;

function Sockets({ ports, side }: { ports: PortDef[]; side: "in" | "out" }) {
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

export const ModuleBlock = memo(function ModuleBlock({ id, data, selected }: NodeProps<ModuleNode>) {
    const def = registry[data.type];
    const setParam = useGraph((s) => s.setParam);
    const removeNode = useGraph((s) => s.removeNode);
    const ref = useRef<HTMLDivElement>(null);
    useLevel(id, ref);
    // Entrées de ce bloc qui ont au moins un câble branché, sous forme de chaîne stable ("gate,in").
    const pluggedInputs = useGraph((s) =>
        s.edges
            .filter((e) => e.target === id && !e.data?.dropping)
            .map((e) => e.targetHandle ?? "in")
            .sort()
            .join(","),
    );

    if (!def) return null;

    return (
        <div
            ref={ref}
            className={`block block-${def.type} ${selected ? "is-selected" : ""}`}
            style={{ "--accent": categoryColor[def.category] } as React.CSSProperties}
        >
            <header className="block-head">
                <span className="block-icon" aria-hidden>
                    {def.icon}
                </span>
                <span className="block-name">{def.label}</span>
                <button className="block-remove nodrag" type="button" aria-label={`Retirer ${def.label}`} onClick={() => removeNode(id)}>
                    ×
                </button>
            </header>

            <div className="block-body">
                {def.type === "envelope" && <EnvelopeShape params={data.params} />}
                {def.params
                    .filter((p) => !p.hidden)
                    .map((p) => (
                        <ParamControl
                            key={p.id}
                            def={p}
                            value={data.params[p.id]}
                            inactive={!!p.activeWith && !pluggedInputs.split(",").includes(p.activeWith)}
                            onChange={(v) => setParam(id, p.id, v)}
                        />
                    ))}
                {def.type === "sequencer" && (
                    <SequencerGrid nodeId={id} params={data.params} onChange={(param, v) => setParam(id, param, v)} />
                )}
            </div>

            <Sockets ports={def.inputs} side="in" />
            <Sockets ports={def.outputs} side="out" />
        </div>
    );
});
