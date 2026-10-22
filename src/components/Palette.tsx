import { useEffect, useRef, useState } from "react";
import { categoryColor, moduleList, registry } from "../modules/registry";

/** Distance (px) beyond which a press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 5;

interface Props {
    /** Click on a block: add it at the center of the mat. */
    onAdd(type: string): void;
    /** Block dropped at these screen coordinates; returns `false` if not over the mat. */
    onDrop(type: string, clientX: number, clientY: number): boolean;
}

interface Drag {
    type: string;
    x: number;
    y: number;
    moved: boolean;
}

/**
 * Block palette. Dragging is done by hand with pointer events:
 * the browser's native drag and drop sometimes cancels a drop when the gesture is fast.
 */
export function Palette({ onAdd, onDrop }: Props) {
    const [drag, setDrag] = useState<Drag | null>(null);
    const start = useRef<{ x: number; y: number } | null>(null);
    const dragRef = useRef<Drag | null>(null);
    dragRef.current = drag;

    useEffect(() => {
        if (!drag) return;
        const move = (e: PointerEvent) => {
            const s = start.current;
            const moved = dragRef.current!.moved || (!!s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > DRAG_THRESHOLD);
            setDrag({ ...dragRef.current!, x: e.clientX, y: e.clientY, moved });
        };
        const up = (e: PointerEvent) => {
            const d = dragRef.current!;
            if (d.moved) onDrop(d.type, e.clientX, e.clientY);
            else onAdd(d.type);
            setDrag(null);
            start.current = null;
        };
        const cancel = () => {
            setDrag(null);
            start.current = null;
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", cancel);
        return () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", cancel);
        };
        // Only resubscribe at the start and end of a drag.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drag === null]);

    const ghost = drag?.moved ? registry[drag.type] : undefined;

    return (
        <aside className="palette" aria-label="Blocks">
            <h1 className="logo">knotty</h1>
            <p className="palette-hint">Drag a block onto the mat, then pull a cable from one socket to another.</p>
            <ul>
                {moduleList.map((m) => (
                    <li key={m.type}>
                        <button
                            type="button"
                            className={`palette-item ${drag?.moved && drag.type === m.type ? "is-dragging" : ""}`}
                            style={{ "--accent": categoryColor[m.category] } as React.CSSProperties}
                            onPointerDown={(e) => {
                                if (e.button !== 0) return;
                                e.preventDefault();
                                start.current = { x: e.clientX, y: e.clientY };
                                setDrag({ type: m.type, x: e.clientX, y: e.clientY, moved: false });
                            }}
                            onKeyDown={(e) => {
                                // With the keyboard: Enter or Space adds the block at the center.
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    onAdd(m.type);
                                }
                            }}
                        >
                            <span className="palette-icon" aria-hidden>
                                {m.icon}
                            </span>
                            {m.label}
                        </button>
                    </li>
                ))}
            </ul>

            {/* Socket legend: the core color tells which signal flows. */}
            <dl className="legend">
                <div>
                    <dt>
                        <span className="legend-socket socket-audio" aria-hidden />
                        Sound
                    </dt>
                    <dd>plugs into a sound input or a setting</dd>
                </div>
                <div>
                    <dt>
                        <span className="legend-socket socket-trigger" aria-hidden />
                        Trigger
                    </dt>
                    <dd>from the sequencer to Trigger inputs</dd>
                </div>
                <div>
                    <dt>
                        <span className="legend-socket socket-mod" aria-hidden />
                        Setting
                    </dt>
                    <dd>takes a sound to move the slider</dd>
                </div>
            </dl>

            {/* The block follows the pointer while dragging. */}
            {ghost && drag && (
                <div
                    className="drag-ghost"
                    style={{ left: drag.x, top: drag.y, "--accent": categoryColor[ghost.category] } as React.CSSProperties}
                    aria-hidden
                >
                    <span className="palette-icon">{ghost.icon}</span>
                    {ghost.label}
                </div>
            )}
        </aside>
    );
}
