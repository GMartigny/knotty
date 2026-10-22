import { describe, expect, it } from "vitest";
import { EXAMPLES, examplePatch } from "./example";
import { compatible, portKind, registry } from "../modules/registry";

describe.each(EXAMPLES.map((e) => [e.label, e.id] as const))("preset %s", (_, id) => {
    const { nodes, edges } = examplePatch(id);
    const byId = new Map(nodes.map((n) => [n.id, n]));

    it("uses known blocks with unique ids", () => {
        expect(byId.size).toBe(nodes.length);
        for (const n of nodes) expect(registry[n.data.type], n.data.type).toBeDefined();
    });

    it("keeps every setting within its range", () => {
        for (const n of nodes)
            for (const p of registry[n.data.type].params) {
                const v = n.data.params[p.id];
                expect(v, `${n.id}.${p.id}`).toBeGreaterThanOrEqual(p.min);
                expect(v, `${n.id}.${p.id}`).toBeLessThanOrEqual(p.max);
            }
    });

    it("only has valid cables, between visible sockets", () => {
        const seen = new Set<string>();
        for (const e of edges) {
            const src = byId.get(e.source);
            const dst = byId.get(e.target);
            expect(src && dst, e.id).toBeTruthy();
            const out = portKind(src!.data.type, e.sourceHandle!, "out", src!.data.params);
            const into = portKind(dst!.data.type, e.targetHandle!, "in", dst!.data.params);
            expect(out && into && compatible(out, into), e.id).toBe(true);
            expect(e.data?.kind, e.id).toBe(out);
            expect(seen.has(e.id), e.id).toBe(false);
            seen.add(e.id);
        }
    });

    it("plays: a cable reaches the Output, and every sound block is plugged in", () => {
        expect(edges.some((e) => byId.get(e.target)?.data.type === "output")).toBe(true);
        for (const n of nodes) {
            if (n.data.type === "comment") continue;
            const plugged = edges.some((e) => e.source === n.id || e.target === n.id);
            expect(plugged, n.id).toBe(true);
        }
    });

    it("has a single tempo", () => {
        const tempos = new Set(nodes.filter((n) => n.data.type === "sequencer").map((n) => n.data.params.bpm));
        expect(tempos.size).toBeLessThanOrEqual(1);
    });
});

describe("presets", () => {
    it("fall back to the first one for an unknown id", () => {
        expect(examplePatch("nope").nodes.map((n) => n.id)).toEqual(examplePatch(EXAMPLES[0].id).nodes.map((n) => n.id));
    });
});
