import { useEffect, type RefObject } from "react";
import { engine } from "./engine";

/** Éléments à animer, par module source. Une seule boucle met à jour la variable CSS --level. */
const watchers = new Map<Element, string>();
let frame = 0;

const tick = () => {
    for (const [el, nodeId] of watchers) {
        (el as HTMLElement).style.setProperty("--level", engine.level(nodeId).toFixed(3));
    }
    frame = watchers.size ? requestAnimationFrame(tick) : 0;
};

export function useLevel(nodeId: string, ref: RefObject<Element | null>) {
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        watchers.set(el, nodeId);
        if (!frame) frame = requestAnimationFrame(tick);
        return () => {
            watchers.delete(el);
        };
    }, [nodeId, ref]);
}
