import { usePosition } from "../audio/usePosition";
import { noteName } from "../modules/notes";
import { unpackNotes } from "../modules/transpose";

/** The last note in and the note it became, e.g. "C4 → G4". */
export function TransposeDisplay({ nodeId }: { nodeId: string }) {
    const packed = usePosition(nodeId);
    const notes = packed >= 0 ? unpackNotes(packed) : undefined;
    return (
        <div className="note-display" aria-live="off">
            {notes ? (
                <span key={packed} className="note-name transpose-notes">
                    {noteName(notes.in)} <span aria-hidden>→</span> {noteName(notes.out)}
                </span>
            ) : (
                <span className="note-idle">notes or sound</span>
            )}
        </div>
    );
}
