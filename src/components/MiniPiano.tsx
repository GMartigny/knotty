import { useEffect, useState } from "react";
import { engine } from "../audio/engine";
import { BLACK, KEY_CODES, NOTE_NAMES } from "../modules/keyboard";

/** Letter shown on each key, following the actual keyboard layout (QWERTY, AZERTY…). */
function useKeyLabels() {
    const [labels, setLabels] = useState(() => KEY_CODES.map((c) => c.replace("Key", "")));
    useEffect(() => {
        const kb = (navigator as Navigator & { keyboard?: { getLayoutMap(): Promise<Map<string, string>> } }).keyboard;
        kb?.getLayoutMap()
            .then((map) => setLabels(KEY_CODES.map((c) => (map.get(c) ?? c.replace("Key", "")).toUpperCase())))
            .catch(() => {});
    }, []);
    return labels;
}

/** Keys held on the keyboard, read on every frame. */
function useHeld(nodeId: string) {
    const [held, setHeld] = useState(0);
    useEffect(() => {
        let frame = 0;
        const tick = () => {
            setHeld(Math.max(0, engine.position(nodeId)));
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [nodeId]);
    return held;
}

/** One-octave mini-piano: each key shows the keyboard letter that plays it, and can be clicked. */
export function MiniPiano({ nodeId }: { nodeId: string }) {
    const labels = useKeyLabels();
    const held = useHeld(nodeId);
    const [clicked, setClicked] = useState(-1);

    const whites = KEY_CODES.map((_, i) => i).filter((i) => !BLACK.has(i));
    const key = (i: number) => (
        <button
            key={i}
            type="button"
            className={`piano-key nodrag ${BLACK.has(i) ? "is-black" : "is-white"} ${held & (1 << i) || clicked === i ? "is-down" : ""}`}
            aria-label={`${NOTE_NAMES[i]} (key ${labels[i]})`}
            onPointerDown={(e) => {
                e.stopPropagation();
                setClicked(i);
                engine.play(nodeId, i);
            }}
            onPointerUp={() => setClicked(-1)}
            onPointerLeave={() => setClicked(-1)}
        >
            <span>{labels[i]}</span>
        </button>
    );

    return (
        <div className="piano" role="group" aria-label="Mini-piano">
            <div className="piano-whites">{whites.map(key)}</div>
            {/* Black keys sit between the white ones: position computed from the previous white key's index. */}
            <div className="piano-blacks">
                {[...BLACK].map((i) => {
                    const before = whites.filter((w) => w < i).length;
                    return (
                        <div key={i} className="piano-black-slot" style={{ "--slot": before } as React.CSSProperties}>
                            {key(i)}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
