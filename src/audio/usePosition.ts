import { useEffect, useState } from "react";
import { engine } from "./engine";

/** Blocks showing their state, each with its setter. A single loop reads them all on each frame. */
const readers = new Map<string, Set<(value: number) => void>>();
let frame = 0;

const tick = () => {
    for (const [nodeId, setters] of readers) {
        const value = engine.position(nodeId);
        // React skips the render when the value hasn't changed.
        for (const set of setters) set(value);
    }
    frame = readers.size ? requestAnimationFrame(tick) : 0;
};

/**
 * A block's displayable state (`engine.position`: current step, last note, held keys…),
 * read on every frame while the block is shown. -1 until sound is started.
 */
export function usePosition(nodeId: string) {
    const [value, setValue] = useState(-1);
    useEffect(() => {
        let setters = readers.get(nodeId);
        if (!setters) readers.set(nodeId, (setters = new Set()));
        setters.add(setValue);
        if (!frame) frame = requestAnimationFrame(tick);
        return () => {
            setters.delete(setValue);
            if (!setters.size) readers.delete(nodeId);
        };
    }, [nodeId]);
    return value;
}
