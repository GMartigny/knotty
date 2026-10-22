import { useEffect, useLayoutEffect, useRef } from "react";
import type { EdgeProps } from "@xyflow/react";
import { physics } from "./physics";
import { useLevel } from "../audio/levels";
import type { CableEdge as CableEdgeType } from "../store/graph";

const KIND_COLOR = {
    audio: "var(--cable-audio)",
    trigger: "var(--cable-trigger)",
};

export function CableEdge({ id, source, sourceX, sourceY, targetX, targetY, selected, data }: EdgeProps<CableEdgeType>) {
    const group = useRef<SVGGElement>(null);
    const main = useRef<SVGPathElement>(null);
    const shadow = useRef<SVGPathElement>(null);
    const hit = useRef<SVGPathElement>(null);

    // Les positions arrivent par props ; la physique, elle, écrit directement dans le DOM.
    useLayoutEffect(() => {
        const paths = [shadow.current, main.current, hit.current].filter(Boolean) as SVGPathElement[];
        const d = physics.upsert(id, { x: sourceX, y: sourceY }, { x: targetX, y: targetY }, paths);
        for (const p of paths) p.setAttribute("d", d);
    }, [id, sourceX, sourceY, targetX, targetY]);

    useEffect(() => () => physics.remove(id), [id]);

    // Un câble audio s'illumine selon le niveau du module qui l'alimente,
    // un câble trigger à chaque impulsion qu'il transporte.
    useLevel(data?.kind === "trigger" ? id : source, group);

    const color = KIND_COLOR[data?.kind ?? "audio"];

    return (
        <g ref={group} className={`cable ${selected ? "is-selected" : ""}`} style={{ "--cable-color": color } as React.CSSProperties}>
            <path ref={shadow} className="cable-shadow" fill="none" />
            <path ref={main} className="cable-main" fill="none" />
            <path ref={hit} className="react-flow__edge-interaction" fill="none" strokeOpacity={0} strokeWidth={20} />
        </g>
    );
}
