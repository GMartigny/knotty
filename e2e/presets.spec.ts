import { expect, test } from "@playwright/test";
import { clearMat, open, loadPreset, peakLevel } from "./helpers";

/** Pairs of blocks whose boxes overlap on screen (Comment frames aside). */
const overlaps = () => {
    const boxes = [...document.querySelectorAll(".react-flow__node")]
        .filter((n) => !n.querySelector(".comment"))
        .map((n) => [(n as HTMLElement).dataset.id, n.getBoundingClientRect()] as const);
    const out: string[] = [];
    for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
            const [a, A] = boxes[i];
            const [b, B] = boxes[j];
            if (A.left < B.right && B.left < A.right && A.top < B.bottom && B.top < A.bottom) out.push(`${a} × ${b}`);
        }
    return out;
};

/** Blocks not fully inside the Comment frame they touch, below its header. */
const badlyFramed = () => {
    const nodes = [...document.querySelectorAll(".react-flow__node")] as HTMLElement[];
    const frames = nodes.filter((n) => n.querySelector(".comment")).map((n) => [n.dataset.id, n.getBoundingClientRect()] as const);
    const zoom = parseFloat(getComputedStyle(document.querySelector(".react-flow__viewport")!).transform.split("(")[1]);
    const bad: string[] = [];
    for (const n of nodes.filter((n) => !n.querySelector(".comment"))) {
        const B = n.getBoundingClientRect();
        let framed = false;
        for (const [f, F] of frames) {
            if (!(B.left < F.right && F.left < B.right && B.top < F.bottom && F.top < B.bottom)) continue;
            framed = true;
            const inside = B.left >= F.left && B.right <= F.right && B.top >= F.top + 50 * zoom && B.bottom <= F.bottom;
            if (!inside) bad.push(`${n.dataset.id} / ${f}`);
        }
        if (frames.length && !framed) bad.push(`${n.dataset.id} outside`);
    }
    return bad;
};

/** Cables whose end isn't plugged into the middle of its input socket (more than 6 px off, in flow units: blocks swell a little with their glow). */
const looseCables = () => {
    const viewport = document.querySelector(".react-flow__viewport")!;
    const zoom = new DOMMatrix(getComputedStyle(viewport).transform).a;
    const origin = viewport.getBoundingClientRect();
    const bad: string[] = [];
    for (const edge of document.querySelectorAll(".react-flow__edge")) {
        const id = edge.getAttribute("data-testid")!.replace("rf__edge-", "");
        const target = id.split("->")[1];
        const [node, handle] = [target.slice(0, target.indexOf(":")), target.slice(target.indexOf(":") + 1)];
        const socket = document.querySelector(`.react-flow__node[data-id="${node}"] [data-handleid="${handle}"]`)!.getBoundingClientRect();
        const d = edge.querySelector(".cable-main")!.getAttribute("d")!.match(/-?[\d.]+/g)!.map(Number);
        const dx = d.at(-2)! - ((socket.left + socket.right) / 2 - origin.left) / zoom;
        const dy = d.at(-1)! - ((socket.top + socket.bottom) / 2 - origin.top) / zoom;
        if (Math.hypot(dx, dy) > 6) bad.push(`${id}: ${dx.toFixed(1)}, ${dy.toFixed(1)}`);
    }
    return bad;
};

const PRESETS = [
    { name: "Soft", tracks: ["env", "out"] },
    { name: "Groove", tracks: ["kick-env", "snare-filter", "hat-filter", "bass-filter", "mel-env", "mix", "out"] },
    {
        name: "Metal",
        tracks: ["kick-env", "snare-filter", "hat-filter", "crash-filter", "gtr-cab", "bass-filter", "solo", "harmony", "lead-filter", "out"],
    },
];

for (const { name, tracks } of PRESETS) {
    test(`${name}: neat layout, and every track plays`, async ({ page }) => {
        const errors = await open(page);
        await loadPreset(page, name);
        expect(await page.evaluate(overlaps)).toEqual([]);
        expect(await page.evaluate(badlyFramed)).toEqual([]);
        expect(await page.evaluate(looseCables)).toEqual([]);
        for (const id of tracks) expect(await peakLevel(page, id, 0.3), id).toBeGreaterThanOrEqual(0.3);
        expect(errors).toEqual([]);
    });
}

test("the menu lists the presets, Soft first", async ({ page }) => {
    await open(page);
    await clearMat(page);
    await page.click(".example-button");
    await expect(page.locator(".example-option strong")).toHaveText(["Soft", "Groove", "Metal"]);
});
