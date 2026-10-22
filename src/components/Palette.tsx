import { categoryColor, moduleList } from "../modules/registry";

export const DRAG_TYPE = "application/x-knotty-module";

interface Props {
    onAdd(type: string): void;
}

export function Palette({ onAdd }: Props) {
    return (
        <aside className="palette" aria-label="Blocs">
            <h1 className="logo">knotty</h1>
            <p className="palette-hint">Glisse un bloc sur le tapis, puis tire un câble d'une prise à l'autre.</p>
            <ul>
                {moduleList.map((m) => (
                    <li key={m.type}>
                        <button
                            type="button"
                            className="palette-item"
                            draggable
                            style={{ "--accent": categoryColor[m.category] } as React.CSSProperties}
                            onDragStart={(e) => {
                                e.dataTransfer.setData(DRAG_TYPE, m.type);
                                e.dataTransfer.effectAllowed = "copy";
                            }}
                            onClick={() => onAdd(m.type)}
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
        </aside>
    );
}
