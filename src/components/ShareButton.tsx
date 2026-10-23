import { useEffect, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useGraph } from "../store/graph";
import { readPatch, toCompact } from "../store/persist";
import { packPatch, packedFromHash, shareUrl, unpackPatch } from "../store/share";

/** How long the "Link copied" bubble stays, in ms. */
const BUBBLE_MS = 2500;

/**
 * Opens the patch held in the page's link (`#patch=…`), on load and when a link is pasted into
 * the address bar. It replaces the mat as one undo step (Ctrl+Z brings the previous patch back),
 * and the fragment is removed so a reload doesn't load it again over later changes.
 */
export function useOpenSharedLink() {
    const replacePatch = useGraph((s) => s.replacePatch);
    const { fitView } = useReactFlow();
    useEffect(() => {
        const open = async () => {
            const packed = packedFromHash(location.hash);
            if (!packed) return;
            history.replaceState(null, "", location.pathname + location.search);
            try {
                const patch = readPatch(await unpackPatch(packed));
                if (!patch) return;
                replacePatch(patch);
                // Refit the view once the blocks are measured.
                requestAnimationFrame(() => requestAnimationFrame(() => fitView({ padding: 0.1, duration: 400 })));
            } catch {
                // A truncated or broken link: the current patch stays.
            }
        };
        open();
        window.addEventListener("hashchange", open);
        return () => window.removeEventListener("hashchange", open);
    }, [replacePatch, fitView]);
}

/** Copies a link holding the whole patch, to share it or keep it. */
export function ShareButton() {
    const empty = useGraph((s) => s.nodes.every((n) => n.data.removing));
    // The link, once made: copied ("copied"), or to copy by hand if the clipboard refused ("manual").
    const [shared, setShared] = useState<{ url: string; copied: boolean } | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    useEffect(() => () => clearTimeout(timer.current), []);

    if (empty) return null;

    const share = async () => {
        const { nodes, edges } = useGraph.getState();
        const url = shareUrl(await packPatch(toCompact(nodes, edges)));
        let copied = true;
        try {
            await navigator.clipboard.writeText(url);
        } catch {
            copied = false;
        }
        setShared({ url, copied });
        clearTimeout(timer.current);
        if (copied) timer.current = setTimeout(() => setShared(null), BUBBLE_MS);
    };

    return (
        <div className="share">
            <button type="button" className="share-button" aria-label="Copy a link to this patch" title="Copy a link to this patch" onClick={share}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L11.6 6" />
                    <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.6-1.6" />
                </svg>
            </button>
            {shared && (
                <div className="share-bubble" role="status">
                    {shared.copied ? (
                        "Link copied: it opens this patch"
                    ) : (
                        <>
                            <span>Copy this link:</span>
                            <input readOnly value={shared.url} autoFocus onFocus={(e) => e.currentTarget.select()} onBlur={() => setShared(null)} />
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
