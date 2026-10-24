import { Handle, Position } from "@xyflow/react";
import { usePosition } from "../audio/usePosition";
import { DEFAULT_VOICE, MODE, MODEL_EFFECTS, SEQ_STEPS, isStepOn, noteOutput, rowFrequency, rowOutput, rowParam, sequencer, toggleStep } from "../modules/sequencer";
import { midiOf, noteName } from "../modules/notes";
import { useGraph } from "../store/graph";
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
    // The bottom row plays the frequency of the Oscillator feeding the Envelope plugged in as a model.
    const base = useGraph((g) => {
        const feeding = (id: string | undefined, port: string) =>
            g.edges.find((e) => e.target === id && (e.targetHandle ?? "in") === port && !e.data?.dropping)?.source;
        // Up the model chain, through the effects copied with it, to the Envelope, then its Oscillator.
        let id = feeding(nodeId, "model");
        for (let hops = 0; hops < 16; hops++) {
            const type = g.nodes.find((n) => n.id === id)?.data.type;
            if (!type || !MODEL_EFFECTS[type]) break;
            id = feeding(id, MODEL_EFFECTS[type]);
        }
        const oscillator = g.nodes.find((n) => n.id === feeding(id, "in"));
        return oscillator?.data.type === "sine" ? oscillator.data.params.frequency : DEFAULT_VOICE.frequency;
    });
    const rows = rowCount(sequencer, params);

    return (
        <div className={`seq ${notes ? "is-notes" : ""}`} role="grid" aria-label="Sequencer steps">
            {/* Notes mode: the mixed sound first, set apart from the rows' own outputs. */}
            {notes && (
                <div className="seq-mix">
                    <span className="seq-mix-label">All notes</span>
                    <Handle id="out" type="source" position={Position.Right} className="socket socket-audio" title="All notes, mixed" />
                </div>
            )}
            {Array.from({ length: rows }, (_, row) => {
                const pattern = params[rowParam(row)] ?? 0;
                const name = notes ? noteName(midiOf(rowFrequency(base, rows, row))) : String(row + 1);
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
                        <Handle
                            id={notes ? noteOutput(row) : rowOutput(row)}
                            type="source"
                            position={Position.Right}
                            className={`socket ${notes ? "socket-audio" : "socket-trigger"}`}
                            title={notes ? `${name} sound` : `Row ${row + 1} output`}
                        />
                    </div>
                );
            })}
        </div>
    );
}
