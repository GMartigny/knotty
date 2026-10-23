import { useEffect, type RefObject } from "react";
import { engine } from "./engine";

/** Elements to animate: source module, and the value last written. A single loop updates the --level CSS variable. */
const watchers = new Map<Element, { nodeId: string; shown: string }>();
let frame = 0;

const tick = () => {
    // Levels per module, read once per frame (a module often lights a block and several cables).
    const levels = new Map<string, string>();
    for (const [el, w] of watchers) {
        let level = levels.get(w.nodeId);
        // Hundredths are enough to see; an unchanged value isn't written, so silence costs no restyle.
        if (level === undefined) levels.set(w.nodeId, (level = engine.level(w.nodeId).toFixed(2)));
        if (level === w.shown) continue;
        w.shown = level;
        (el as HTMLElement).style.setProperty("--level", level);
    }
    frame = watchers.size ? requestAnimationFrame(tick) : 0;
};

export function useLevel(nodeId: string, ref: RefObject<Element | null>) {
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        watchers.set(el, { nodeId, shown: "" });
        if (!frame) frame = requestAnimationFrame(tick);
        return () => {
            watchers.delete(el);
        };
    }, [nodeId, ref]);
}
