import { useEffect, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useGraph } from "../store/graph";
import { EXAMPLES } from "../store/example";

/** Empty mat: an invitation to drop a block, or to load a preset from the list. */
export function EmptyMat() {
    // Only once all blocks have finished falling.
    const empty = useGraph((s) => s.nodes.length === 0);
    const loadExample = useGraph((s) => s.loadExample);
    const { fitView } = useReactFlow();
    const [open, setOpen] = useState(false);
    const menu = useRef<HTMLDivElement>(null);

    // Close the menu on an outside click or with Escape.
    useEffect(() => {
        if (!open) return;
        const close = (e: PointerEvent) => {
            if (!menu.current?.contains(e.target as Node)) setOpen(false);
        };
        const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
        window.addEventListener("pointerdown", close);
        window.addEventListener("keydown", esc);
        return () => {
            window.removeEventListener("pointerdown", close);
            window.removeEventListener("keydown", esc);
        };
    }, [open]);

    if (!empty) return null;

    const load = (id: string) => {
        setOpen(false);
        loadExample(id);
        // Refit the view once the blocks are measured.
        requestAnimationFrame(() => requestAnimationFrame(() => fitView({ padding: 0.1, duration: 400 })));
    };

    return (
        <div className="empty-mat">
            <p>The mat is empty. Drag a block from the palette to get started.</p>
            <div className="example-picker" ref={menu}>
                <button
                    type="button"
                    className="example-button"
                    aria-haspopup="menu"
                    aria-expanded={open}
                    onClick={() => setOpen((o) => !o)}
                >
                    Load a preset
                    <span className={`example-caret ${open ? "is-open" : ""}`} aria-hidden>
                        ▾
                    </span>
                </button>
                {open && (
                    <ul className="example-menu" role="menu">
                        {EXAMPLES.map((ex) => (
                            <li key={ex.id} role="none">
                                <button type="button" role="menuitem" className="example-option" onClick={() => load(ex.id)}>
                                    <strong>{ex.label}</strong>
                                    <span>{ex.description}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
