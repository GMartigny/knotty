import { describe, expect, it } from "vitest";
import { Rope } from "./rope";

/** Runs the simulation until the rope sleeps (or gives up). */
const settle = (rope: Rope, maxSteps = 5000) => {
    let n = 0;
    while (rope.isAwake && n++ < maxSteps) rope.step(1 / 120);
    return n;
};

const lowest = (rope: Rope) => Math.max(...rope.points.map((p) => p.y));

describe("rope", () => {
    it("has more points when it is longer, within bounds", () => {
        expect(new Rope({ x: 0, y: 0 }, { x: 10, y: 0 }).points.length).toBe(8);
        expect(new Rope({ x: 0, y: 0 }, { x: 320, y: 0 }).points.length).toBe(21);
        expect(new Rope({ x: 0, y: 0 }, { x: 5000, y: 0 }).points.length).toBe(40);
    });

    it("sags under gravity, keeps its ends on the sockets, then falls asleep", () => {
        const rope = new Rope({ x: 0, y: 0 }, { x: 300, y: 0 });
        const steps = settle(rope);
        expect(steps).toBeLessThan(5000);
        expect(rope.isAwake).toBe(false);
        expect(lowest(rope)).toBeGreaterThan(30);
        expect(rope.points[0]).toEqual({ x: 0, y: 0 });
        expect(rope.points.at(-1)).toEqual({ x: 300, y: 0 });
    });

    it("wakes up and follows when a socket moves, adapting its resolution", () => {
        const rope = new Rope({ x: 0, y: 0 }, { x: 100, y: 0 });
        settle(rope);
        rope.setAnchors({ x: 0, y: 0 }, { x: 600, y: 0 });
        expect(rope.isAwake).toBe(true);
        expect(rope.points.length).toBeGreaterThan(8);
        settle(rope);
        expect(rope.points.at(-1)).toEqual({ x: 600, y: 0 });
    });

    it("lets an unplugged end fall, and hangs it back on when reattached", () => {
        const rope = new Rope({ x: 0, y: 0 }, { x: 300, y: 0 });
        settle(rope);
        rope.release("b");
        for (let i = 0; i < 120; i++) rope.step(1 / 120);
        expect(rope.points.at(-1)!.y).toBeGreaterThan(50);
        rope.reattach();
        settle(rope);
        expect(rope.points.at(-1)).toEqual({ x: 300, y: 0 });
    });

    it("draws a smooth SVG path from socket to socket", () => {
        const rope = new Rope({ x: 0, y: 0 }, { x: 300, y: 0 });
        const d = rope.toPath();
        expect(d.startsWith("M 0.0 0.0")).toBe(true);
        expect(d.endsWith("300.0 0.0")).toBe(true);
        expect(d.match(/C /g)?.length).toBe(rope.points.length - 1);
    });
});
