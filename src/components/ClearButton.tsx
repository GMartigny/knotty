import { useEffect, useState } from "react";
import { useGraph } from "../store/graph";

/** Window during which the second click confirms, in ms. */
const ARM_MS = 3000;

/**
 * Big cross to clear everything. First click: the button arms itself and asks for confirmation;
 * second click within 3 s: all the blocks fall.
 */
export function ClearButton() {
    const clearAll = useGraph((s) => s.clearAll);
    const empty = useGraph((s) => s.nodes.every((n) => n.data.removing));
    const [armed, setArmed] = useState(false);

    useEffect(() => {
        if (!armed) return;
        const t = setTimeout(() => setArmed(false), ARM_MS);
        return () => clearTimeout(t);
    }, [armed]);

    if (empty) return null;

    return (
        <button
            type="button"
            className={`clear-button ${armed ? "is-armed" : ""}`}
            aria-label={armed ? "Confirm: clear everything" : "Clear everything"}
            onClick={() => {
                if (!armed) return setArmed(true);
                setArmed(false);
                clearAll();
            }}
        >
            <span className="clear-x" aria-hidden>
                ×
            </span>
            {armed && <span className="clear-label">Clear everything?</span>}
        </button>
    );
}
