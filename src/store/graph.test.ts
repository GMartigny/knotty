import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Connection } from "@xyflow/react";
import type { useGraph as UseGraph } from "./graph";
import { createCable, createNode } from "./nodes";

/** A fresh store (and undo history) for every test. */
let useGraph: typeof UseGraph;
const state = () => useGraph.getState();
const ids = () => state().nodes.map((n) => n.id);
const live = () => state().edges.filter((e) => !e.data?.dropping).map((e) => e.id);
const param = (id: string, p: string) => state().nodes.find((n) => n.id === id)!.data.params[p];
const link = (source: string, sourceHandle: string, target: string, targetHandle: string): Connection => ({
    source,
    sourceHandle,
    target,
    targetHandle,
});

/** A small patch: a sequencer triggering an envelope on an oscillator, into a filter. */
const setup = () =>
    useGraph.setState({
        nodes: [
            createNode("sequencer", { x: 0, y: 0 }, { id: "seq" }),
            createNode("sine", { x: 400, y: 0 }, { id: "osc" }),
            createNode("envelope", { x: 700, y: 0 }, { id: "env" }),
            createNode("filter", { x: 1000, y: 0 }, { id: "flt" }),
            createNode("sine", { x: 400, y: 500 }, { id: "lfo" }),
        ],
        edges: [createCable("seq", "row0", "env", "gate", "trigger"), createCable("osc", "out", "env", "in", "audio")],
    });

beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    localStorage.clear();
    vi.resetModules();
    ({ useGraph } = await import("./graph"));
    setup();
});
afterEach(() => vi.useRealTimers());

describe("connections", () => {
    it("accept compatible sockets, including a sound on a setting", () => {
        expect(state().isValidConnection(link("env", "out", "flt", "in"))).toBe(true);
        expect(state().isValidConnection(link("lfo", "out", "flt", "mod:frequency"))).toBe(true);
    });

    it("refuse incompatible sockets, duplicates, self-loops and loops", () => {
        expect(state().isValidConnection(link("osc", "out", "env", "gate"))).toBe(false);
        expect(state().isValidConnection(link("seq", "row0", "flt", "in"))).toBe(false);
        expect(state().isValidConnection(link("osc", "out", "env", "in"))).toBe(false);
        expect(state().isValidConnection(link("osc", "out", "osc", "mod:frequency"))).toBe(false);
        state().onConnect(link("env", "out", "flt", "in"));
        expect(state().isValidConnection(link("flt", "out", "osc", "mod:frequency"))).toBe(false);
    });

    it("refuse sockets on hidden rows", () => {
        expect(state().isValidConnection(link("seq", "row5", "env", "gate"))).toBe(false);
        state().setRows("seq", 6);
        expect(state().isValidConnection(link("seq", "row5", "env", "gate"))).toBe(true);
    });

    it("create typed cables", () => {
        state().onConnect(link("lfo", "out", "flt", "mod:frequency"));
        expect(state().edges.at(-1)).toMatchObject({ type: "cable", data: { kind: "audio" } });
    });
});

describe("unplugging", () => {
    it("drops the cables of a socket pulled into empty space: they fall, then disappear", () => {
        state().startGrab({ nodeId: "env", handleId: "in", side: "target" });
        expect(state().grab).toMatchObject({ kind: "audio", plugged: true });
        state().endGrab(true);
        expect(state().grab).toBeNull();
        expect(live()).toEqual(["seq:row0->env:gate"]);
        expect(state().edges.find((e) => e.id === "osc:out->env:in")?.data?.dropping).toBe("target");
        vi.advanceTimersByTime(800);
        expect(state().edges.map((e) => e.id)).toEqual(["seq:row0->env:gate"]);
    });

    it("keeps them when the pull ends on a socket", () => {
        state().startGrab({ nodeId: "env", handleId: "in", side: "target" });
        state().endGrab(false);
        expect(live()).toHaveLength(2);
    });
});

describe("blocks", () => {
    it("are added next to the others, never on top of them", () => {
        state().addModule("noise", { x: 400, y: 0 });
        const added = state().nodes.at(-1)!;
        expect(added.data.type).toBe("noise");
        expect(added.position).not.toEqual({ x: 400, y: 0 });
    });

    it("can be dropped inside a Comment frame, and Comments land where dropped", () => {
        state().addModule("comment", { x: 400, y: 0 });
        expect(state().nodes.at(-1)!.position).toEqual({ x: 400, y: 0 });
        state().addModule("noise", { x: 2000, y: 2000 });
        expect(state().nodes.at(-1)!.position).toEqual({ x: 2000, y: 2000 });
    });

    it("fall when removed, taking their cables with them", () => {
        state().removeNode("env");
        expect(state().nodes.find((n) => n.id === "env")?.data.removing).toBe(true);
        expect(live()).toEqual([]);
        vi.advanceTimersByTime(800);
        expect(ids()).not.toContain("env");
        expect(state().edges).toEqual([]);
    });

    it("all fall within a second when clearing everything", () => {
        state().clearAll();
        vi.advanceTimersByTime(1000);
        expect(state().nodes.every((n) => n.data.removing)).toBe(true);
        vi.advanceTimersByTime(800);
        expect(state().nodes).toEqual([]);
    });

    it("keep a Comment's text", () => {
        state().addModule("comment", { x: 0, y: 900 });
        const id = state().nodes.at(-1)!.id;
        state().setText(id, "Drums");
        expect(state().nodes.at(-1)!.data.text).toBe("Drums");
    });
});

describe("settings", () => {
    it("change one block", () => {
        state().setParam("flt", "Q", 9);
        expect(param("flt", "Q")).toBe(9);
    });

    it("share the tempo between sequencers, including new ones", () => {
        state().setParam("seq", "bpm", 140);
        state().addModule("sequencer", { x: 0, y: 2000 });
        const added = state().nodes.at(-1)!.id;
        expect(param(added, "bpm")).toBe(140);
        state().setParam(added, "bpm", 90);
        expect(param("seq", "bpm")).toBe(90);
    });

    it("change the number of rows within bounds, unplugging removed rows", () => {
        state().setRows("seq", 99);
        expect(param("seq", "rows")).toBe(16);
        state().setRows("seq", 0);
        expect(param("seq", "rows")).toBe(1);
        expect(live()).toContain("seq:row0->env:gate");
        state().setRows("seq", 3);
        state().onConnect(link("seq", "row2", "env", "gate"));
        state().setRows("seq", 2);
        expect(live()).toEqual(["seq:row0->env:gate", "osc:out->env:in"]);
    });

    it("ignore blocks without rows", () => {
        state().setRows("flt", 3);
        expect(state().nodes.find((n) => n.id === "flt")!.data.params.rows).toBeUndefined();
    });
});

describe("undo / redo", () => {
    it("undoes and redoes a connection", () => {
        state().onConnect(link("env", "out", "flt", "in"));
        expect(live()).toHaveLength(3);
        state().undo();
        expect(live()).toHaveLength(2);
        state().redo();
        expect(live()).toHaveLength(3);
    });

    it("brings back cables unplugged by mistake, even mid-fall", () => {
        state().startGrab({ nodeId: "env", handleId: "in", side: "target" });
        state().endGrab(true);
        vi.advanceTimersByTime(200);
        state().undo();
        vi.advanceTimersByTime(800);
        expect(live()).toEqual(["seq:row0->env:gate", "osc:out->env:in"]);
    });

    it("brings back a removed block and its cables, even mid-fall", () => {
        state().removeNode("env");
        vi.advanceTimersByTime(200);
        state().undo();
        vi.advanceTimersByTime(800);
        expect(ids()).toContain("env");
        expect(state().nodes.find((n) => n.id === "env")!.data.removing).toBeUndefined();
        expect(live()).toHaveLength(2);
    });

    it("cancels a clear-everything cascade, and redoes it as an empty mat", () => {
        state().clearAll();
        vi.advanceTimersByTime(300);
        state().undo();
        vi.advanceTimersByTime(2000);
        expect(ids()).toEqual(["seq", "osc", "env", "flt", "lfo"]);
        state().redo();
        expect(state().nodes).toEqual([]);
    });

    it("merges a slider drag into one step, but not two separate drags", () => {
        for (const q of [5, 6, 7, 8]) {
            state().setParam("flt", "Q", q);
            vi.advanceTimersByTime(50);
        }
        vi.advanceTimersByTime(2000);
        state().setParam("flt", "Q", 12);
        state().undo();
        expect(param("flt", "Q")).toBe(8);
        state().undo();
        expect(param("flt", "Q")).toBe(4);
    });

    it("keeps each click (sequencer steps, choices) as its own step", () => {
        state().setParam("seq", "row1", 1);
        state().setParam("seq", "row1", 3);
        state().undo();
        expect(param("seq", "row1")).toBe(1);
    });

    it("merges a block drag into one step", () => {
        const move = (x: number, dragging: boolean) =>
            state().onNodesChange([{ type: "position", id: "flt", position: { x, y: 0 }, dragging }]);
        move(1010, true);
        move(1050, true);
        move(1100, false);
        state().undo();
        expect(state().nodes.find((n) => n.id === "flt")!.position.x).toBe(1000);
    });

    it("ignores changes that leave the patch as it is, and selection", () => {
        state().setParam("flt", "Q", 4);
        state().onNodesChange([{ type: "select", id: "flt", selected: true }]);
        state().undo();
        expect(ids()).toEqual(["seq", "osc", "env", "flt", "lfo"]);
    });

    it("forgets what could be redone after a new change", () => {
        state().setParam("flt", "Q", 9);
        state().undo();
        state().setParam("flt", "mode", 1);
        state().redo();
        expect(param("flt", "Q")).toBe(4);
    });

    it("undoes loading a preset", () => {
        state().loadExample("soft");
        expect(ids()).toEqual(["seq", "osc", "env", "filter", "reverb", "out"]);
        state().undo();
        expect(ids()).toEqual(["seq", "osc", "env", "flt", "lfo"]);
    });

    it("does nothing with an empty history", () => {
        state().undo();
        state().redo();
        expect(ids()).toHaveLength(5);
    });
});

describe("copy / paste", () => {
    const select = (...which: string[]) =>
        state().onNodesChange(state().nodes.map((n) => ({ type: "select" as const, id: n.id, selected: which.includes(n.id) })));
    const copies = () => state().nodes.filter((n) => !["seq", "osc", "env", "flt", "lfo"].includes(n.id));

    it("copies the selected blocks with their settings, but not their cables", () => {
        state().setParam("osc", "frequency", 330);
        select("osc", "env");
        expect(state().copy()).toBe(2);
        state().paste();
        expect(copies().map((n) => n.data.type)).toEqual(["sine", "envelope"]);
        expect(copies()[0].data.params.frequency).toBe(330);
        expect(state().edges).toHaveLength(2);
        expect(copies().every((n) => !state().edges.some((e) => e.source === n.id || e.target === n.id))).toBe(true);
    });

    it("gives the copies new ids, selects them alone, and offsets each paste", () => {
        select("flt");
        state().copy();
        state().paste();
        state().paste();
        const [a, b] = copies();
        expect(a.id).not.toBe(b.id);
        expect(a.position).toEqual({ x: 1040, y: 40 });
        expect(b.position).toEqual({ x: 1080, y: 80 });
        expect(state().nodes.filter((n) => n.selected).map((n) => n.id)).toEqual([b.id]);
    });

    it("pastes at the pointer, keeping the blocks' layout", () => {
        select("osc", "env");
        state().copy();
        state().paste({ x: 0, y: 2000 });
        expect(copies().map((n) => n.position)).toEqual([
            { x: 0, y: 2000 },
            { x: 300, y: 2000 },
        ]);
    });

    it("keeps the copy as it was when copied", () => {
        select("flt");
        state().copy();
        state().setParam("flt", "Q", 15);
        state().paste();
        expect(copies()[0].data.params.Q).toBe(4);
    });

    it("copies a Comment's text and size", () => {
        state().addModule("comment", { x: 0, y: 900 });
        const id = state().nodes.at(-1)!.id;
        state().setText(id, "Drums");
        select(id);
        state().copy();
        state().paste();
        expect(state().nodes.at(-1)).toMatchObject({ data: { type: "comment", text: "Drums" }, width: 380, height: 240 });
    });

    it("keeps the tempo shared", () => {
        select("seq");
        state().copy();
        state().setParam("seq", "bpm", 150);
        state().paste();
        expect(state().nodes.at(-1)!.data.params.bpm).toBe(150);
    });

    it("undoes a paste in one step", () => {
        select("osc", "env");
        state().copy();
        state().paste();
        state().undo();
        expect(ids()).toEqual(["seq", "osc", "env", "flt", "lfo"]);
    });

    it("does nothing without a selection or a copy", () => {
        select();
        expect(state().copy()).toBe(0);
        state().paste();
        expect(ids()).toHaveLength(5);
    });
});
