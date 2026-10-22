import { useEffect, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { engine } from "../audio/engine";
import { SEQ_ROWS, SEQ_STEPS, isStepOn, rowOutput, rowParam, toggleStep } from "../modules/sequencer";
import type { ParamValues } from "../modules/types";

const BEAT = 4;

/** Pas courant du séquenceur, relu à chaque frame tant que le bloc est affiché. */
function usePlayhead(nodeId: string) {
    const [step, setStep] = useState(-1);
    useEffect(() => {
        let frame = 0;
        const tick = () => {
            setStep(engine.position(nodeId));
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [nodeId]);
    return step;
}

interface Props {
    nodeId: string;
    params: ParamValues;
    onChange(paramId: string, value: number): void;
}

export function SequencerGrid({ nodeId, params, onChange }: Props) {
    const playhead = usePlayhead(nodeId);

    return (
        <div className="seq" role="grid" aria-label="Pas du séquenceur">
            {Array.from({ length: SEQ_ROWS }, (_, row) => {
                const pattern = params[rowParam(row)] ?? 0;
                return (
                    <div className="seq-row" role="row" key={row}>
                        <span className="seq-row-label" aria-hidden>
                            {row + 1}
                        </span>
                        <div className="seq-steps">
                            {/* Un groupe par temps (4 pas), pour lire la mesure d'un coup d'œil. */}
                            {Array.from({ length: SEQ_STEPS / BEAT }, (_, beat) => (
                                <div className="seq-beat" key={beat}>
                                    {Array.from({ length: BEAT }, (_, i) => {
                                        const step = beat * BEAT + i;
                                        const on = isStepOn(pattern, step);
                                        return (
                                            <button
                                                key={step}
                                                type="button"
                                                role="gridcell"
                                                aria-pressed={on}
                                                aria-label={`Ligne ${row + 1}, pas ${step + 1}`}
                                                className={`seq-step nodrag ${on ? "is-on" : ""} ${step === playhead ? "is-playing" : ""}`}
                                                onClick={() => onChange(rowParam(row), toggleStep(pattern, step))}
                                            />
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                        <Handle
                            id={rowOutput(row)}
                            type="source"
                            position={Position.Right}
                            className="socket socket-trigger"
                            title={`Sortie ligne ${row + 1}`}
                        />
                    </div>
                );
            })}
        </div>
    );
}
