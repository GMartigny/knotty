import { useEffect, useState } from "react";
import { useGraph } from "../store/graph";

/** Délai pendant lequel le second clic confirme, en ms. */
const ARM_MS = 3000;

/**
 * Grosse croix pour tout effacer. Premier clic : le bouton s'arme et demande confirmation ;
 * second clic dans les 3 s : tous les blocs tombent.
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
            aria-label={armed ? "Confirmer : tout effacer" : "Tout effacer"}
            onClick={() => {
                if (!armed) return setArmed(true);
                setArmed(false);
                clearAll();
            }}
        >
            <span className="clear-x" aria-hidden>
                ×
            </span>
            {armed && <span className="clear-label">Tout effacer ?</span>}
        </button>
    );
}
