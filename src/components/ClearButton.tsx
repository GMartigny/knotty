import { useEffect, useRef, useState } from "react";
import { useGraph } from "../store/graph";

/** How long the button must be held to clear everything, in ms. */
const HOLD_MS = 2000;
/** Strongest shake, reached at the end of the hold, in px (and degrees). */
const MAX_SHAKE = 6;

/**
 * Big cross to clear everything: hold it for 2 s. A ring fills up around it and the button
 * shakes harder and harder; letting go before the end cancels. Works with the pointer,
 * or by holding Space / Enter.
 */
export function ClearButton() {
    const clearAll = useGraph((s) => s.clearAll);
    const empty = useGraph((s) => s.nodes.every((n) => n.data.removing));
    const button = useRef<HTMLButtonElement>(null);
    const hold = useRef<{ start: number; frame: number } | null>(null);
    const [holding, setHolding] = useState(false);

    const reset = () => {
        const el = button.current;
        if (!el) return;
        el.style.setProperty("--p", "0");
        el.style.translate = "";
        el.style.rotate = "";
    };

    const stop = () => {
        if (hold.current) cancelAnimationFrame(hold.current.frame);
        hold.current = null;
        setHolding(false);
        reset();
    };

    const tick = () => {
        const el = button.current;
        const h = hold.current;
        if (!el || !h) return;
        const p = Math.min(1, (performance.now() - h.start) / HOLD_MS);
        el.style.setProperty("--p", String(p));
        // The shake grows with the square of the progress: gentle at first, frantic at the end.
        const amp = p * p * MAX_SHAKE;
        const jitter = () => (Math.random() * 2 - 1) * amp;
        el.style.translate = `${jitter()}px ${jitter()}px`;
        el.style.rotate = `${jitter()}deg`;
        if (p >= 1) {
            stop();
            clearAll();
            return;
        }
        h.frame = requestAnimationFrame(tick);
    };

    const start = () => {
        if (hold.current) return;
        hold.current = { start: performance.now(), frame: requestAnimationFrame(tick) };
        setHolding(true);
    };

    // Stop the animation if the button goes away mid-hold.
    useEffect(
        () => () => {
            if (hold.current) cancelAnimationFrame(hold.current.frame);
        },
        [],
    );

    if (empty) return null;

    return (
        <button
            ref={button}
            type="button"
            className={`clear-button ${holding ? "is-holding" : ""}`}
            aria-label="Clear everything (hold for 2 seconds)"
            onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                start();
            }}
            onPointerUp={stop}
            onPointerCancel={stop}
            onKeyDown={(e) => {
                if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                    e.preventDefault();
                    start();
                }
            }}
            onKeyUp={(e) => (e.key === " " || e.key === "Enter") && stop()}
            onBlur={stop}
        >
            <svg className="clear-ring" viewBox="0 0 100 100" aria-hidden>
                <circle className="clear-ring-track" cx="50" cy="50" r="44" pathLength={1} />
                <circle className="clear-ring-fill" cx="50" cy="50" r="44" pathLength={1} />
            </svg>
            <span className="clear-x" aria-hidden>
                ×
            </span>
            <span className="clear-label" aria-hidden>
                {holding ? "Keep holding…" : "Hold to clear"}
            </span>
        </button>
    );
}
