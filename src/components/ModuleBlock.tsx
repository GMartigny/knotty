import { memo, useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { categoryColor, registry } from "../modules/registry";
import { useGraph, type ModuleNode } from "../store/graph";
import { useLevel } from "../audio/levels";
import { ParamControl } from "./ParamControl";

const portOffset = (index: number, count: number) => `${((index + 1) / (count + 1)) * 100}%`;

export const ModuleBlock = memo(function ModuleBlock({ id, data, selected }: NodeProps<ModuleNode>) {
    const def = registry[data.type];
    const setParam = useGraph((s) => s.setParam);
    const removeNode = useGraph((s) => s.removeNode);
    const ref = useRef<HTMLDivElement>(null);
    useLevel(id, ref);

    if (!def) return null;

    return (
        <div
            ref={ref}
            className={`block ${selected ? "is-selected" : ""}`}
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
                {def.params.map((p) => (
                    <ParamControl key={p.id} def={p} value={data.params[p.id]} onChange={(v) => setParam(id, p.id, v)} />
                ))}
            </div>

            {def.inputs.map((port, i) => (
                <Handle
                    key={port.id}
                    id={port.id}
                    type="target"
                    position={Position.Left}
                    className={`socket socket-${port.kind}`}
                    style={{ top: portOffset(i, def.inputs.length) }}
                />
            ))}
            {def.outputs.map((port, i) => (
                <Handle
                    key={port.id}
                    id={port.id}
                    type="source"
                    position={Position.Right}
                    className={`socket socket-${port.kind}`}
                    style={{ top: portOffset(i, def.outputs.length) }}
                />
            ))}
        </div>
    );
});
