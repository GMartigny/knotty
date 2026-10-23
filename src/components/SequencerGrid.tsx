import { Handle, Position } from "@xyflow/react";
import { usePosition } from "../audio/usePosition";
import { MODE, SEQ_STEPS, isStepOn, rowNote, rowOutput, rowParam, sequencer, toggleStep } from "../modules/sequencer";
import { noteName } from "../modules/notes";
import { rowCount, type ParamValues } from "../modules/types";

const BEAT = 4;

interface Props {
    nodeId: string;
    params: ParamValues;
    onChange(paramId: string, value: number): void;
}

export function SequencerGrid({ nodeId, params, onChange }: Props) {
    // Current step, read every frame.
    const playhead = usePosition(nodeId);
    // Notes mode: a piano roll, each row named after its note, sharps darker like black keys.
    const notes = params.mode === MODE.notes;

    return (
        <div className={`seq ${notes ? "is-notes" : ""}`} role="grid" aria-label="Sequencer steps">
            {Array.from({ length: rowCount(sequencer, params) }, (_, row) => {
                const pattern = params[rowParam(row)] ?? 0;
                const name = notes ? noteName(rowNote(params, row)) : String(row + 1);
                return (
                    <div className={`seq-row ${notes && name.includes("♯") ? "is-sharp" : ""}`} role="row" key={row} data-row={row}>
                        <span className="seq-row-label" aria-hidden>
                            {name}
                        </span>
                        <div className="seq-steps">
                            {/* One group per beat (4 steps), to read the bar at a glance. */}
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
                                                aria-label={`${notes ? name : `Row ${row + 1}`}, step ${step + 1}`}
                                                className={`seq-step nodrag ${on ? "is-on" : ""} ${step === playhead ? "is-playing" : ""}`}
                                                onClick={() => onChange(rowParam(row), toggleStep(pattern, step))}
                                            />
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                        {!notes && (
                            <Handle
                                id={rowOutput(row)}
                                type="source"
                                position={Position.Right}
                                className="socket socket-trigger"
                                title={`Row ${row + 1} output`}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
