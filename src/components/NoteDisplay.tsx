import { useEffect, useState } from "react";
import { engine } from "../audio/engine";
import { noteName } from "../modules/scale";

/** Last note played by the Scale, shown big. */
export function NoteDisplay({ nodeId }: { nodeId: string }) {
    const [midi, setMidi] = useState(-1);
    useEffect(() => {
        let frame = 0;
        const tick = () => {
            setMidi(engine.position(nodeId));
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [nodeId]);

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
