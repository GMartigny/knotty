import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPatch, readPatch, savePatch, toCompact } from "./persist";
import { EXAMPLES, examplePatch } from "./example";
import { createCable, createNode } from "./nodes";

const KEY = "knotty:patch:v2";
const store = (value: unknown) => localStorage.setItem(KEY, typeof value === "string" ? value : JSON.stringify(value));

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe("loading a saved patch", () => {
    it("returns null when there is nothing, or nothing readable", () => {
        expect(loadPatch()).toBeNull();
        store("{oops");
        expect(loadPatch()).toBeNull();
        store({ v: 2, n: "no", e: [] });
        expect(loadPatch()).toBeNull();
        store({ v: 2, n: [3], e: [] });
        expect(loadPatch()).toBeNull();
    });

    it("cleans it up for the current version", () => {
        store({
            v: 2,
            n: [
                ["sequencer", 0, 0, { bpm: 999, rows: 40, row0: 5, ghost: 3 }],
                ["sequencer", 0, 400, { bpm: 90 }],
                ["envelope", 500, 0, { attack: "fast" }],
                ["theremin", 0, 0],
                ["comment", 0, 0, null, "Drums", 20, 300],
            ],
            e: [
                [0, "row0", 2, "gate"],
                [0, "row0", 2, "gate"],
                [0, "row0", 3, "in"],
                [0, "row0", 2, "in"],
                [0, "row0", 9, "gate"],
            ],
        });
        const { nodes, edges } = loadPatch()!;
        // Unknown block type dropped.
        expect(nodes.map((n) => n.data.type)).toEqual(["sequencer", "sequencer", "envelope", "comment"]);
        const [s1, s2, e1, c] = nodes;
        // Clamped to the range, unknown settings dropped, defaults filled in.
        expect(s1.data.params).toMatchObject({ bpm: 200, rows: 16, row0: 5 });
        expect(s1.data.params.ghost).toBeUndefined();
        expect(e1.data.params.attack).toBe(0.01);
        // The tempo is shared.
        expect(s2.data.params.bpm).toBe(200);
        // A Comment keeps its text; a size too small falls back to the default.
        expect(c).toMatchObject({ data: { text: "Drums" }, width: 380, height: 300 });
        // Duplicate, dangling and incompatible cables dropped.
        expect(edges.map((e) => e.id)).toEqual([`${s1.id}:row0->${e1.id}:gate`]);
    });

    it("drops cables on rows that are hidden", () => {
        store({ v: 2, n: [["sequencer", 0, 0, { rows: 2 }], ["envelope", 0, 0]], e: [[0, "row3", 1, "gate"]] });
        expect(loadPatch()!.edges).toEqual([]);
    });
});

describe("saving", () => {
        it("writes once, shortly after the last change, compact, without falling blocks or cables", () => {
        vi.useFakeTimers();
        const seq = createNode("sequencer", { x: 1.4, y: 2.6 }, { id: "s", params: { bpm: 90 } });
        const env = createNode("envelope", { x: 0, y: 0 }, { id: "e" });
        const falling = { ...createNode("noise", { x: 0, y: 0 }, { id: "n" }), data: { type: "noise", params: {}, removing: true } };
        const note = createNode("comment", { x: 0, y: 0 }, { id: "c", text: "Hi" });
        const cable = createCable("s", "row0", "e", "gate", "trigger");
        const dropping = { ...createCable("n", "out", "e", "in", "audio"), data: { kind: "audio" as const, dropping: "source" as const } };

        savePatch([seq], []);
        savePatch([seq, env, falling, note], [cable, dropping]);
        expect(localStorage.getItem(KEY)).toBeNull();
        vi.advanceTimersByTime(400);

        // Only the settings changed from their defaults; cables point to blocks by index.
        expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({
            v: 2,
            n: [
                ["sequencer", 1, 3, { bpm: 90 }],
                ["envelope", 0, 0],
                ["comment", 0, 0, null, "Hi", 380, 240],
            ],
            e: [[0, "row0", 1, "gate"]],
        });

        // And it loads back the same.
        const loaded = loadPatch()!;
        expect(loaded.nodes.map((n) => n.data.type)).toEqual(["sequencer", "envelope", "comment"]);
        expect(loaded.nodes[0].data.params).toEqual(seq.data.params);
        expect(loaded.nodes[2]).toMatchObject({ data: { text: "Hi" }, width: 380, height: 240 });
        const [s, e] = loaded.nodes.map((n) => n.id);
        expect(loaded.edges.map((x) => x.id)).toEqual([`${s}:row0->${e}:gate`]);
    });

    it("keeps every preset whole, in a fraction of the older format", () => {
        for (const ex of EXAMPLES) {
            const { nodes, edges } = examplePatch(ex.id);
            const compact = toCompact(nodes, edges);
            const back = readPatch(JSON.parse(JSON.stringify(compact)))!;
            expect(back.nodes.map((n) => n.data), ex.id).toEqual(nodes.map((n) => n.data));
            expect(back.nodes.map((n) => n.position)).toEqual(nodes.map((n) => n.position));
            expect(back.edges.length).toBe(edges.length);
            // Twice as small at least.
            const verbose = { nodes: nodes.map((n) => ({ id: n.id, type: n.data.type, ...n.position, params: n.data.params })), edges };
            expect(JSON.stringify(compact).length * 2).toBeLessThan(JSON.stringify(verbose).length);
        }
    });

    it("ignores what isn't a patch", () => {
        expect(readPatch(null)).toBeNull();
        expect(readPatch({ nodes: [], edges: [] })).toBeNull();
    });
});
