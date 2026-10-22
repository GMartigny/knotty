import { useEffect, useRef, useState } from "react";
import { categoryColor, moduleList, registry } from "../modules/registry";

/** Distance (px) au-delà de laquelle un appui devient un glisser plutôt qu'un clic. */
const DRAG_THRESHOLD = 5;

interface Props {
    /** Clic sur un bloc : l'ajouter au centre du tapis. */
    onAdd(type: string): void;
    /** Bloc lâché à ces coordonnées écran ; renvoie `false` si ce n'est pas au-dessus du tapis. */
    onDrop(type: string, clientX: number, clientY: number): boolean;
}

interface Drag {
    type: string;
    x: number;
    y: number;
    moved: boolean;
}

/**
 * Palette des blocs. Le glisser est fait à la main, avec les événements du pointeur :
 * le glisser-déposer natif du navigateur annule parfois un dépôt quand le geste est rapide.
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
        // On ne se réabonne qu'au début et à la fin d'un glisser.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drag === null]);

    const ghost = drag?.moved ? registry[drag.type] : undefined;

    return (
        <aside className="palette" aria-label="Blocs">
            <h1 className="logo">knotty</h1>
            <p className="palette-hint">Glisse un bloc sur le tapis, puis tire un câble d'une prise à l'autre.</p>
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
                                // Au clavier : Entrée ou Espace ajoute le bloc au centre.
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

            {/* Légende des prises : la couleur du cœur dit quel signal passe. */}
            <dl className="legend">
                <div>
                    <dt>
                        <span className="legend-socket socket-audio" aria-hidden />
                        Son
                    </dt>
                    <dd>se branche sur une entrée son ou un réglage</dd>
                </div>
                <div>
                    <dt>
                        <span className="legend-socket socket-trigger" aria-hidden />
                        Déclencheur
                    </dt>
                    <dd>du séquenceur vers les entrées Déclencheur</dd>
                </div>
                <div>
                    <dt>
                        <span className="legend-socket socket-mod" aria-hidden />
                        Réglage
                    </dt>
                    <dd>reçoit un son pour faire bouger le curseur</dd>
                </div>
            </dl>

            {/* Le bloc suit le pointeur pendant le glisser. */}
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
