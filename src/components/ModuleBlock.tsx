import { memo, useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { categoryColor, registry } from "../modules/registry";
import { useGraph, type ModuleNode } from "../store/graph";
import { useLevel } from "../audio/levels";
import { ParamControl } from "./ParamControl";
import { SequencerGrid } from "./SequencerGrid";
import { EnvelopeShape } from "./EnvelopeShape";
import { modPort, type PortDef } from "../modules/types";

const portOffset = (index: number, count: number) => `${((index + 1) / (count + 1)) * 100}%`;

/** Prises placées automatiquement sur le bord du bloc (sorties, ou entrées d'un bloc compact). */
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

/** Entrées principales en tête du bloc, chacune sur sa ligne avec son nom. */
function InputRows({ ports }: { ports: PortDef[] }) {
    const rows = ports.filter((p) => !p.inline);
    if (!rows.length) return null;
    return (
        <div className="port-rows">
            {rows.map((port) => (
                <div className="port-row" key={port.id}>
                    <span className={`port-dot port-dot-${port.kind}`} aria-hidden />
                    {port.label ?? "Entrée"}
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
    const plugged = new Set(pluggedInputs.split(","));

    if (!def) return null;
    // Un bloc sans réglage (ex. Sortie) se réduit à son en-tête.
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
                <button className="block-remove nodrag" type="button" aria-label={`Retirer ${def.label}`} onClick={() => removeNode(id)}>
                    ×
                </button>
            </header>

            {!compact && (
                <div className="block-body">
                    <InputRows ports={def.inputs} />
                    {def.type === "envelope" && <EnvelopeShape params={data.params} />}
                    {def.params
                        .filter((p) => !p.hidden)
                        .map((p) => (
                            <ParamControl
                                key={p.id}
                                def={p}
                                value={data.params[p.id]}
                                inactive={!!p.activeWith && !plugged.has(p.activeWith)}
                                modulated={plugged.has(modPort(p.id))}
                                onChange={(v) => setParam(id, p.id, v)}
                            />
                        ))}
                    {def.type === "sequencer" && (
                        <SequencerGrid nodeId={id} params={data.params} onChange={(param, v) => setParam(id, param, v)} />
                    )}
                </div>
            )}

            {compact && <EdgeSockets ports={def.inputs} side="in" />}
            <EdgeSockets ports={def.outputs} side="out" />
        </div>
    );
});
