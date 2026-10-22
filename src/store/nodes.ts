import type { XYPosition } from "@xyflow/react";
import { registry } from "../modules/registry";
import { defaultParams, type ParamValues, type PortKind } from "../modules/types";
import { COMMENT_SIZE, commentFrame } from "../modules/comment";
import type { CableEdge, ModuleNode } from "./graph";

let counter = 0;
/** Unique id for a new block or cable. */
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

interface NodeOptions {
    id?: string;
    /** Settings that differ from the defaults. */
    params?: ParamValues;
    /** Comment only: its text and size. */
    text?: string;
    size?: { width: number; height: number };
}

/** A block ready for the mat: default settings filled in, and a Comment's frame. */
export function createNode(type: string, position: XYPosition, { id = newId(type), params = {}, text, size }: NodeOptions = {}): ModuleNode {
    const node: ModuleNode = { id, type: "module", position, data: { type, params: { ...defaultParams(registry[type]), ...params } } };
    if (type !== "comment") return node;
    const { width, height } = size ?? COMMENT_SIZE;
    return { ...node, data: { ...node.data, text: text ?? "" }, ...commentFrame(width, height) };
}

/**
 * Settings shared by every block of a type (see `ParamDef.shared`, e.g. the sequencers' tempo):
 * all blocks take the value of the first one.
 */
export function alignShared(nodes: ModuleNode[]): ModuleNode[] {
    const first = new Map<string, number>();
    return nodes.map((n) => {
        let params = n.data.params;
        for (const p of registry[n.data.type]?.params ?? []) {
            if (!p.shared) continue;
            const key = `${n.data.type}:${p.id}`;
            if (!first.has(key)) first.set(key, params[p.id]);
            else if (params[p.id] !== first.get(key)) params = { ...params, [p.id]: first.get(key)! };
        }
        return params === n.data.params ? n : { ...n, data: { ...n.data, params } };
    });
}

/** A cable between two sockets, identified by its ends (presets and saved patches). */
export const createCable = (source: string, sourceHandle: string, target: string, targetHandle: string, kind: PortKind): CableEdge => ({
    id: `${source}:${sourceHandle}->${target}:${targetHandle}`,
    source,
    sourceHandle,
    target,
    targetHandle,
    type: "cable",
    data: { kind },
});
