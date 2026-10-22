import { NodeResizer, type NodeProps } from "@xyflow/react";
import { useGraph, type ModuleNode } from "../store/graph";

/**
 * Comment: a resizable frame with some text, placed behind the blocks.
 * Used to name and group the parts of a composition ("Drums", "Solo"…).
 */
export function CommentBlock({ id, data, selected }: NodeProps<ModuleNode>) {
    const setText = useGraph((s) => s.setText);
    const removeNode = useGraph((s) => s.removeNode);

    return (
        <div className={["comment", selected && "is-selected", data.removing && "is-removing"].filter(Boolean).join(" ")}>
            {/* Handles on the corners and edges, visible on hover. */}
            <NodeResizer minWidth={160} minHeight={90} handleClassName="comment-handle" lineClassName="comment-line" />
            <header className="comment-head">
                <span className="comment-icon" aria-hidden>
                    ✎
                </span>
                <textarea
                    className="comment-text nodrag nowheel"
                    value={data.text ?? ""}
                    placeholder="Write a note…"
                    aria-label="Comment text"
                    rows={1}
                    spellCheck={false}
                    onChange={(e) => setText(id, e.target.value)}
                    // Escape hands control back to the mat (and to shortcuts like Delete).
                    onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
                />
                <button className="block-remove nodrag" type="button" aria-label="Remove comment" onClick={() => removeNode(id)}>
                    ×
                </button>
            </header>
        </div>
    );
}
