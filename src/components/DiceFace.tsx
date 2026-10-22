import { useEffect, useState } from "react";
import { engine } from "../audio/engine";

/** Pip positions (on a 3 × 3 grid, 0–8) for faces 1 to 6. */
const PIPS = [[4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];

/**
 * The Random block's die: it rolls on each trigger and shows the face that came up
 * (pips up to 6 values, a number beyond), plus a strip with one notch per possible value.
 */
export function DiceFace({ nodeId, count }: { nodeId: string; count: number }) {
    const [state, setState] = useState(-1);
    useEffect(() => {
        let frame = 0;
        const tick = () => {
            setState(engine.position(nodeId));
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [nodeId]);

    const rolled = state >= 0;
    const roll = Math.floor(state / 100);
    const face = rolled ? state % 100 : -1;

    return (
        <div className="dice" aria-live="off">
            {/* The key restarts the roll animation on every trigger, even when the same face comes up. */}
            <div key={roll} className={`dice-face ${rolled ? "is-rolled" : ""}`} role="img" aria-label={rolled ? `Value ${face + 1} of ${count}` : "Not rolled yet"}>
                {rolled && count <= 6 ? (
                    <span className="dice-pips">
                        {Array.from({ length: 9 }, (_, i) => (
                            <span key={i} className={PIPS[face]?.includes(i) ? "pip" : undefined} />
                        ))}
                    </span>
                ) : (
                    <span className="dice-number">{rolled ? face + 1 : "?"}</span>
                )}
            </div>
            <div className="dice-scale" aria-hidden>
                {Array.from({ length: count }, (_, i) => (
                    <span
                        key={i}
                        className={i === face ? "is-on" : undefined}
                        // A staircase: each notch is as tall as the level it sends.
                        style={{ height: `${20 + (80 * i) / Math.max(1, count - 1)}%` }}
                    />
                ))}
            </div>
        </div>
    );
}
