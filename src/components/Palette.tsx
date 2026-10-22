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
        </aside>
    );
}
