import { usePosition } from "../audio/usePosition";
import { noteName } from "../modules/notes";

/** Last note played by the Scale, shown big. */
export function NoteDisplay({ nodeId }: { nodeId: string }) {
    const midi = usePosition(nodeId);

    return (
        <div className="note-display" aria-live="off">
            {midi >= 0 ? (
                // The key restarts the little animation on each new note.
                <span key={midi} className="note-name">
                    {noteName(midi)}
                </span>
            ) : (
                <span className="note-idle">waiting for a trigger</span>
            )}
        </div>
    );
}
