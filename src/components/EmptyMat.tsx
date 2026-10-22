import { useEffect, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useGraph } from "../store/graph";
import { EXAMPLES } from "../store/example";

/** Tapis vide : invitation à poser un bloc, ou à charger un modèle dans la liste. */
export function EmptyMat() {
    // Seulement une fois que tous les blocs ont fini de tomber.
    const empty = useGraph((s) => s.nodes.length === 0);
    const loadExample = useGraph((s) => s.loadExample);
    const { fitView } = useReactFlow();
    const [open, setOpen] = useState(false);
    const menu = useRef<HTMLDivElement>(null);

    // Fermer le menu au clic à l'extérieur ou avec Échap.
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
        // Recadrer une fois les blocs mesurés.
        requestAnimationFrame(() => requestAnimationFrame(() => fitView({ padding: 0.1, duration: 400 })));
    };

    return (
        <div className="empty-mat">
            <p>Le tapis est vide. Glisse un bloc depuis la palette pour commencer.</p>
            <div className="example-picker" ref={menu}>
                <button
                    type="button"
                    className="example-button"
                    aria-haspopup="menu"
                    aria-expanded={open}
                    onClick={() => setOpen((o) => !o)}
                >
                    Charger un modèle
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
