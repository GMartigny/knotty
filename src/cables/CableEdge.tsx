import { useEffect, useLayoutEffect, useRef } from "react";
import type { EdgeProps } from "@xyflow/react";
import { physics } from "./physics";
import { useLevel } from "../audio/levels";
import { useGraph, type CableEdge as CableEdgeType } from "../store/graph";

const KIND_COLOR: Record<string, string> = {
    audio: "var(--cable-audio)",
    trigger: "var(--cable-trigger)",
};

export function CableEdge({
    id,
    source,
    target,
    sourceHandleId,
    targetHandleId,
    sourceX,
    sourceY,
    targetX,
    targetY,
    selected,
    data,
}: EdgeProps<CableEdgeType>) {
    const group = useRef<SVGGElement>(null);
    const main = useRef<SVGPathElement>(null);
    const shadow = useRef<SVGPathElement>(null);
    const hit = useRef<SVGPathElement>(null);

    // Positions come in through props; the physics writes directly to the DOM.
    useLayoutEffect(() => {
        const paths = [shadow.current, main.current, hit.current].filter(Boolean) as SVGPathElement[];
        const d = physics.upsert(id, { x: sourceX, y: sourceY }, { x: targetX, y: targetY }, paths);
        for (const p of paths) p.setAttribute("d", d);
    }, [id, sourceX, sourceY, targetX, targetY]);

    useEffect(() => () => physics.remove(id), [id]);

    // Unplugged: the end on the pulled socket's side comes loose and falls.
    // Plugged back in by an undo during the fall: both ends hang on again.
    const dropping = data?.dropping;
    useEffect(() => {
        if (dropping) physics.release(id, dropping === "source" ? "a" : "b");
        else physics.reattach(id);
    }, [id, dropping]);

    // While pulling from an already plugged socket, its cables fade: dropping in empty space unplugs them.
    const grabbed = useGraph((s) => {
        const g = s.grab;
        if (!g) return false;
        return g.side === "source"
            ? g.nodeId === source && g.handleId === (sourceHandleId ?? "out")
            : g.nodeId === target && g.handleId === (targetHandleId ?? "in");
    });

    // An audio cable lights up with the level of the module feeding it,
    // a trigger cable with each pulse it carries.
    useLevel(data?.kind === "trigger" ? id : source, group);

    const color = KIND_COLOR[data?.kind ?? "audio"];
    const state = dropping ? "is-dropping" : grabbed ? "is-grabbed" : selected ? "is-selected" : "";

    return (
        <g ref={group} className={`cable ${state}`} style={{ "--cable-color": color } as React.CSSProperties}>
            <path ref={shadow} className="cable-shadow" fill="none" />
            <path ref={main} className="cable-main" fill="none" />
            <path ref={hit} className="react-flow__edge-interaction" fill="none" strokeOpacity={0} strokeWidth={20} />
        </g>
    );
}
