import { NodeResizer, type NodeProps } from "@xyflow/react";
import { useGraph, type ModuleNode } from "../store/graph";

/**
 * Commentaire : cadre redimensionnable avec un texte, posé derrière les blocs.
 * Sert à nommer et regrouper les parties d'une composition (« Batterie », « Solo »…).
 */
export function CommentBlock({ id, data, selected }: NodeProps<ModuleNode>) {
    const setText = useGraph((s) => s.setText);
    const removeNode = useGraph((s) => s.removeNode);

    return (
        <div className={["comment", selected && "is-selected", data.removing && "is-removing"].filter(Boolean).join(" ")}>
            {/* Poignées dans les coins et sur les bords, visibles au survol. */}
            <NodeResizer minWidth={160} minHeight={90} handleClassName="comment-handle" lineClassName="comment-line" />
            <header className="comment-head">
                <span className="comment-icon" aria-hidden>
                    ✎
                </span>
                <textarea
                    className="comment-text nodrag nowheel"
                    value={data.text ?? ""}
                    placeholder="Écris une note…"
                    aria-label="Texte du commentaire"
                    rows={1}
                    spellCheck={false}
                    onChange={(e) => setText(id, e.target.value)}
                    // Échap rend la main au tapis (et aux raccourcis comme Suppr).
                    onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
                />
                <button className="block-remove nodrag" type="button" aria-label="Retirer le commentaire" onClick={() => removeNode(id)}>
                    ×
                </button>
            </header>
        </div>
    );
}
