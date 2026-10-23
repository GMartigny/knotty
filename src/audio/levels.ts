import { useEffect, type RefObject } from "react";
import { engine } from "./engine";
import { nextLevel } from "../lib/level";

/** Elements to animate: source module, and the value last written. A single loop updates the --level CSS variable. */
const watchers = new Map<Element, { nodeId: string; shown?: number }>();
let frame = 0;

const tick = () => {
    // Levels per module, read once per frame (a module often lights a block and several cables).
    const levels = new Map<string, number>();
    for (const [el, w] of watchers) {
        let level = levels.get(w.nodeId);
        if (level === undefined) levels.set(w.nodeId, (level = engine.level(w.nodeId)));
        // Small wobbles of a steady sound aren't written (see `nextLevel`): no restyle for what the eye can't see.
        const next = nextLevel(w.shown, level);
        if (next === undefined) continue;
        w.shown = next;
        (el as HTMLElement).style.setProperty("--level", String(next));
    }
    frame = watchers.size ? requestAnimationFrame(tick) : 0;
};

export function useLevel(nodeId: string, ref: RefObject<Element | null>) {
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        watchers.set(el, { nodeId });
        if (!frame) frame = requestAnimationFrame(tick);
        return () => {
            watchers.delete(el);
        };
    }, [nodeId, ref]);
}
