import { describe, expect, it } from "vitest";
import { alignShared, createCable, createNode, newId } from "./nodes";
import { COMMENT_SIZE } from "../modules/comment";

describe("node factory", () => {
    it("fills in default settings, keeping the given ones", () => {
        const n = createNode("filter", { x: 10, y: 20 }, { id: "f", params: { Q: 9 } });
        expect(n).toMatchObject({ id: "f", type: "module", position: { x: 10, y: 20 } });
        expect(n.data.params).toEqual({ mode: 0, frequency: 900, Q: 9 });
    });

    it("makes Comments resizable frames behind the blocks, moved by their grip", () => {
        const c = createNode("comment", { x: 0, y: 0 });
        expect(c).toMatchObject({ width: COMMENT_SIZE.width, height: COMMENT_SIZE.height, zIndex: -1, dragHandle: ".comment-grip" });
        expect(c.data.text).toBe("");
        expect(createNode("comment", { x: 0, y: 0 }, { text: "Hi", size: { width: 500, height: 300 } })).toMatchObject({
            width: 500,
            height: 300,
            data: { text: "Hi" },
        });
    });

    it("gives unique ids", () => {
        expect(newId("x")).not.toBe(newId("x"));
        expect(createNode("noise", { x: 0, y: 0 }).id).toMatch(/^noise-/);
    });

    it("names preset cables after their ends", () => {
        expect(createCable("a", "out", "b", "in", "audio")).toMatchObject({ id: "a:out->b:in", type: "cable", data: { kind: "audio" } });
    });

    it("aligns shared settings (the tempo) on the first block of the type", () => {
        const nodes = alignShared([
            createNode("sequencer", { x: 0, y: 0 }, { params: { bpm: 90 } }),
            createNode("filter", { x: 0, y: 0 }),
            createNode("sequencer", { x: 0, y: 0 }, { params: { bpm: 140 } }),
        ]);
        expect(nodes[2].data.params.bpm).toBe(90);
        expect(nodes[1].data.params.frequency).toBe(900);
    });
});
