import { useEffect, useState } from "react";
import { engine } from "../audio/engine";
import { noteName } from "../modules/scale";

/** Dernière note jouée par la Gamme, en grand. */
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
                // La clé relance la petite animation à chaque nouvelle note.
                <span key={midi} className="note-name">
                    {noteName(midi)}
                </span>
            ) : (
                <span className="note-idle">en attente d'un déclenchement</span>
            )}
        </div>
    );
}
