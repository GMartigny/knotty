import { useEffect, useState } from "react";
import { engine } from "./engine";

/**
 * A block's displayable state (`engine.position`: current step, last note, held keys…),
 * read on every frame while the block is shown. -1 until sound is started.
 */
export function usePosition(nodeId: string) {
    const [value, setValue] = useState(-1);
    useEffect(() => {
        let frame = 0;
        const tick = () => {
            setValue(engine.position(nodeId));
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [nodeId]);
    return value;
}
