import { useRef } from "react";
import { useGraph } from "../store/graph";

interface Props {
    nodeId: string;
    /** Current number of rows, and its bounds. */
    rows: number;
    min: number;
    max: number;
}

/**
 * Grip on a block's bottom edge: drag it down to add rows, up to remove them.
 * One row is added each time the pointer moves by the height of a row (read from the rows
 * marked `data-row`, so it follows the zoom). Arrow keys do the same from the keyboard.
 */
export function RowResizer({ nodeId, rows, min, max }: Props) {
    const setRows = useGraph((s) => s.setRows);
    const drag = useRef<{ y: number; rows: number; pitch: number } | null>(null);

    /** Distance between two rows on screen, in px. */
    const pitch = (el: HTMLElement) => {
        const items = el.closest(".block")?.querySelectorAll<HTMLElement>("[data-row]") ?? [];
        if (items.length >= 2) return items[1].getBoundingClientRect().top - items[0].getBoundingClientRect().top;
        return items[0]?.getBoundingClientRect().height || 24;
    };

    return (
        <div
            className="row-resizer nodrag"
            role="slider"
            tabIndex={0}
            aria-label="Rows"
            aria-orientation="vertical"
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={rows}
            title="Drag to add or remove rows"
            onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { y: e.clientY, rows, pitch: pitch(e.currentTarget) };
            }}
            onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                setRows(nodeId, d.rows + Math.round((e.clientY - d.y) / d.pitch));
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    setRows(nodeId, rows + (e.key === "ArrowDown" ? 1 : -1));
                }
            }}
        >
            <span className="row-resizer-grip" aria-hidden />
        </div>
    );
}
