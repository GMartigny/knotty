import { useReactFlow } from "@xyflow/react";
import { useGraph } from "../store/graph";

/** Tapis vide : invitation à poser un bloc, ou à recharger l'exemple. */
export function EmptyMat() {
    // Seulement une fois que tous les blocs ont fini de tomber.
    const empty = useGraph((s) => s.nodes.length === 0);
    const loadExample = useGraph((s) => s.loadExample);
    const { fitView } = useReactFlow();
    if (!empty) return null;
    return (
        <div className="empty-mat">
            <p>Le tapis est vide. Glisse un bloc depuis la palette pour commencer.</p>
            <button
                type="button"
                className="example-button"
                onClick={() => {
                    loadExample();
                    // Recadrer une fois les blocs mesurés.
                    requestAnimationFrame(() => requestAnimationFrame(() => fitView({ padding: 0.15, duration: 400 })));
                }}
            >
                Charger l'exemple
            </button>
        </div>
    );
}
