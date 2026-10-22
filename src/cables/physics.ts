import { Rope, type Vec } from "./rope";

interface Entry {
    rope: Rope;
    paths: SVGPathElement[];
}

const STEP = 1 / 120;
const entries = new Map<string, Entry>();
let frame = 0;
let last = 0;
let accumulator = 0;

/** A single loop for all cables; it stops when everything is still. */
const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    accumulator += dt;
    let awake = false;
    while (accumulator >= STEP) {
        for (const { rope } of entries.values()) rope.step(STEP);
        accumulator -= STEP;
    }
    for (const { rope, paths } of entries.values()) {
        const d = rope.toPath();
        for (const p of paths) p.setAttribute("d", d);
        awake ||= rope.isAwake;
    }
    frame = awake ? requestAnimationFrame(tick) : 0;
};

const wake = () => {
    if (frame) return;
    last = performance.now();
    accumulator = 0;
    frame = requestAnimationFrame(tick);
};

export const physics = {
    /** Registers (or updates) a cable and the SVG elements to redraw. */
    upsert(id: string, a: Vec, b: Vec, paths: SVGPathElement[]) {
        const entry = entries.get(id);
        if (entry) {
            entry.paths = paths;
            entry.rope.setAnchors(a, b);
            if (entry.rope.isAwake) wake();
            return entry.rope.toPath();
        }
        const rope = new Rope(a, b);
        entries.set(id, { rope, paths });
        wake();
        return rope.toPath();
    },
    /** Unplugs one end of the cable: it falls freely. */
    release(id: string, end: "a" | "b") {
        entries.get(id)?.rope.release(end);
        wake();
    },
    /** Plugs both ends back in. */
    reattach(id: string) {
        entries.get(id)?.rope.reattach();
        wake();
    },
    remove(id: string) {
        entries.delete(id);
    },
};
