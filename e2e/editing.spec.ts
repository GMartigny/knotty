import { expect, test, type Page } from "@playwright/test";
import { cableCount, center, clearMat, drag, loadPreset, node, nodeCount, open, peakLevel } from "./helpers";

/** Adds a block by clicking it in the palette; returns its id. */
async function add(page: Page, label: string) {
    const before = await page.locator(".react-flow__node").evaluateAll((ns) => ns.map((n) => (n as HTMLElement).dataset.id));
    await page.locator(".palette-item", { hasText: label }).click();
    await expect(page.locator(".react-flow__node")).toHaveCount(before.length + 1);
    const after = await page.locator(".react-flow__node").evaluateAll((ns) => ns.map((n) => (n as HTMLElement).dataset.id));
    return after.find((id) => !before.includes(id))!;
}

const socket = (id: string, handle: string) => `.react-flow__node[data-id="${id}"] [data-handleid="${handle}"]`;

async function plug(page: Page, from: string, to: string) {
    await drag(page, await center(page, from), await center(page, to));
}

test.beforeEach(async ({ page }) => {
    await open(page);
    await clearMat(page);
});

test("resting on a palette block shows what it does, above the start screen", async ({ page }) => {
    // Fresh page: the start screen still covers the mat.
    await page.goto("/");
    await expect(page.locator(".start")).toBeVisible();
    const item = page.locator(".palette-item", { hasText: "Filter" });
    await item.hover();
    const tip = page.getByRole("tooltip");
    await expect(tip).toBeVisible();
    await expect(tip).toContainText("Keeps the low, the high or the middle frequencies");
    await expect(item).toHaveAttribute("aria-describedby", "palette-tip");
    // Nothing on the mat covers it.
    const box = (await tip.boundingBox())!;
    const onTop = await page.evaluate(([x, y]) => {
        // The tooltip lets the pointer through: make it hittable just to ask what is on top.
        const tip = document.querySelector<HTMLElement>(".palette-tip")!;
        tip.style.pointerEvents = "auto";
        return document.elementFromPoint(x, y)?.closest(".palette-tip") === tip;
    }, [box.x + box.width - 20, box.y + 20]);
    expect(onTop).toBe(true);
    await page.mouse.move(800, 400);
    await expect(tip).toHaveCount(0);
});

test("blocks are added from the palette by click or by drag and drop", async ({ page }) => {
    await add(page, "Noise");
    const item = await center(page, '.palette-item:has-text("Filter")');
    const mat = (await page.locator(".mat").boundingBox())!;
    await drag(page, item, { x: mat.x + mat.width - 200, y: mat.y + mat.height - 200 });
    await expect(page.locator(".block-filter")).toHaveCount(1);
});

test("cables connect compatible sockets only, unplug into the void, and undo/redo", async ({ page }) => {
    const noise = await add(page, "Noise");
    const env = await add(page, "Envelope");
    // Sound into a Trigger input: refused.
    await plug(page, socket(noise, "out"), socket(env, "gate"));
    expect(await cableCount(page)).toBe(0);
    await plug(page, socket(noise, "out"), socket(env, "in"));
    expect(await cableCount(page)).toBe(1);
    // Pulled into empty space: it falls, then disappears.
    const mat = (await page.locator(".mat").boundingBox())!;
    await drag(page, await center(page, socket(env, "in")), { x: mat.x + 40, y: mat.y + mat.height - 40 });
    await expect(page.locator(".react-flow__edge")).toHaveCount(0, { timeout: 2000 });
    // Ctrl+Z brings it back; Ctrl+Shift+Z unplugs it again.
    await page.keyboard.press("Control+z");
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);
    await page.keyboard.press("Control+Shift+z");
    await expect(page.locator(".react-flow__edge")).toHaveCount(0);
    await page.keyboard.press("Control+y");
    await page.keyboard.press("Control+z");
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);
});

test("a removed block falls, and Ctrl+Z brings it back", async ({ page }) => {
    const filter = await add(page, "Filter");
    await node(page, filter).locator(".block-remove").click({ force: true });
    await expect(node(page, filter)).toHaveCount(0, { timeout: 2000 });
    await page.keyboard.press("Control+z");
    await expect(node(page, filter)).toHaveCount(1);
});

test("the clear button must be held for 2 seconds", async ({ page }) => {
    await loadPreset(page, "Soft");
    const count = await nodeCount(page);
    const c = await center(page, ".clear-button");
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.waitForTimeout(1000);
    await page.mouse.up();
    await page.waitForTimeout(500);
    expect(await nodeCount(page)).toBe(count);
    await expect(page.locator(".clear-button")).toHaveCSS("--p", "0");
    await clearMat(page);
    await expect(page.locator(".empty-mat")).toBeVisible();
    // Undo brings the whole patch back.
    await page.keyboard.press("Control+z");
    await expect(page.locator(".react-flow__node")).toHaveCount(count);
});

test("the sequencer and mixer grow and shrink by their bottom edge", async ({ page }) => {
    const seq = await add(page, "Sequencer");
    const rows = node(page, seq).locator("[data-row]");
    await expect(rows).toHaveCount(4);
    const [a, b] = await rows.evaluateAll((r) => r.slice(0, 2).map((e) => e.getBoundingClientRect().top));
    await node(page, seq).hover();
    const grip = await center(page, `.react-flow__node[data-id="${seq}"] .row-resizer`);
    await drag(page, grip, { x: grip.x, y: grip.y + (b - a) * 3 });
    await expect(rows).toHaveCount(7);
    // From the keyboard too.
    await node(page, seq).locator(".row-resizer").focus();
    await page.keyboard.press("ArrowUp");
    await expect(rows).toHaveCount(6);
    const mixer = await add(page, "Mixer");
    await node(page, mixer).locator(".row-resizer").focus();
    await page.keyboard.press("ArrowDown");
    await expect(node(page, mixer).locator("[data-row]")).toHaveCount(5);
});

test("a new sequencer joins the tempo of the others", async ({ page }) => {
    await loadPreset(page, "Groove");
    const seq = await add(page, "Sequencer");
    await expect(node(page, seq).locator(".param output").first()).toHaveText("116 bpm");
});

test("comments: text, frame that lets clicks through, grip to move", async ({ page }) => {
    const comment = await add(page, "Comment");
    const text = node(page, comment).locator(".comment-text");
    await text.click();
    await page.keyboard.type("Drums");
    await expect(text).toHaveValue("Drums");
    // Ctrl+Z in the text belongs to the text, not to the patch.
    await page.keyboard.press("Control+z");
    expect(await nodeCount(page)).toBe(1);
    await page.keyboard.press("Escape");

    const frame = node(page, comment);
    const before = await frame.evaluate((n) => (n as HTMLElement).style.transform);
    const viewport = () => page.locator(".react-flow__viewport").evaluate((v) => (v as HTMLElement).style.transform);
    const view = await viewport();
    const box = (await frame.boundingBox())!;
    await drag(page, { x: box.x + box.width - 20, y: box.y + box.height - 20 }, { x: box.x + box.width - 120, y: box.y + box.height - 80 });
    expect(await frame.evaluate((n) => (n as HTMLElement).style.transform)).toBe(before);
    expect(await viewport()).not.toBe(view);

    const grip = await center(page, `.react-flow__node[data-id="${comment}"] .comment-grip`);
    await drag(page, grip, { x: grip.x + 80, y: grip.y + 60 });
    expect(await frame.evaluate((n) => (n as HTMLElement).style.transform)).not.toBe(before);
});

test("a die drives a scale: random notes, always in the scale", async ({ page }) => {
    const seq = await add(page, "Sequencer");
    const dice = await add(page, "Random");
    const scale = await add(page, "Scale");
    await plug(page, socket(seq, "row0"), socket(dice, "gate"));
    await plug(page, socket(dice, "out"), socket(scale, "in"));
    await plug(page, socket(seq, "row0"), socket(scale, "gate"));
    expect(await cableCount(page)).toBe(3);
    const faces = new Set<string>();
    const notes = new Set<string>();
    for (let i = 0; i < 80; i++) {
        faces.add((await node(page, dice).locator(".dice-face").getAttribute("aria-label"))!);
        notes.add(await node(page, scale).locator(".note-display").innerText());
        await page.waitForTimeout(40);
    }
    expect(faces.size).toBeGreaterThan(2);
    // C minor pentatonic by default: C, D♯, F, G, A♯.
    notes.delete("waiting for a trigger");
    expect(notes.size).toBeGreaterThan(1);
    for (const n of notes) expect(n).toMatch(/^(C|D♯|F|G|A♯)\d$/);
});

test("the keyboard plays notes into an oscillator", async ({ page }) => {
    const keys = await add(page, "Keyboard");
    const osc = await add(page, "Oscillator");
    await plug(page, socket(keys, "out"), socket(osc, "note"));
    await page.locator(".mat").click({ position: { x: 5, y: 5 } });
    await page.keyboard.down("KeyA");
    await page.keyboard.up("KeyA");
    // Octave 4 by default: KeyA is C4.
    await expect(node(page, osc).locator(".mini-scope")).toHaveAttribute("data-hz", "261.6");
});

test("Transpose moves the keyboard's notes: C4 + 7 semitones = G4", async ({ page }) => {
    const keys = await add(page, "Keyboard");
    const shift = await add(page, "Transpose");
    const osc = await add(page, "Oscillator");
    await plug(page, socket(keys, "out"), `${socket(shift, "notes")}.target`);
    await plug(page, `${socket(shift, "notes")}.source`, socket(osc, "note"));
    // −24…+24 semitones on the slider: +7 is at 31/48.
    await node(page, shift).locator("input.slider").fill("0.646");
    await expect(node(page, shift).locator(".param output")).toHaveText("7 st");
    await page.locator(".mat").click({ position: { x: 5, y: 5 } });
    await page.keyboard.down("KeyA");
    await page.keyboard.up("KeyA");
    await expect(node(page, shift).locator(".note-display")).toHaveText("C4 → G4");
    await expect(node(page, osc).locator(".mini-scope")).toHaveAttribute("data-hz", "392.0");
});

test("Transpose also moves any sound: a noise goes through it to the output", async ({ page }) => {
    const noise = await add(page, "Noise");
    const shift = await add(page, "Transpose");
    const out = await add(page, "Output");
    await plug(page, socket(noise, "out"), `${socket(shift, "in")}.target`);
    await plug(page, `${socket(shift, "out")}.source`, socket(out, "in"));
    await node(page, shift).locator("input.slider").fill("0.75");
    await expect(node(page, shift).locator(".param output")).toHaveText("12 st");
    expect(await peakLevel(page, shift, 0.3)).toBeGreaterThanOrEqual(0.3);
});

test("the sequencer in notes mode plays the notes itself, sounding like the Envelope and Oscillator it copies", async ({ page }) => {
    const seq = await add(page, "Sequencer");
    const osc = await add(page, "Oscillator");
    const env = await add(page, "Envelope");
    const lfo = await add(page, "Oscillator");
    const out = await add(page, "Output");
    const block = node(page, seq);
    await block.getByRole("radio", { name: "Notes" }).click({ force: true });
    // An octave of rows, sound outputs instead of trigger outputs. With nothing plugged in: C4 to C5.
    await expect(block.locator("[data-row]")).toHaveCount(13);
    await expect(block.locator(".seq-row-label").last()).toHaveText("C4");
    await expect(block.locator('[data-handleid="row0"]')).toHaveCount(0);
    await expect(block.locator('[data-handleid="note0"]')).toHaveCount(1);
    // Only an Envelope is taken as a model; the Oscillator feeding it (220 Hz, A3) sets the bottom note.
    await plug(page, socket(osc, "out"), socket(seq, "model"));
    expect(await cableCount(page)).toBe(0);
    await plug(page, socket(osc, "out"), socket(env, "in"));
    await plug(page, socket(env, "out"), socket(seq, "model"));
    await expect(block.locator(".seq-row-label").last()).toHaveText("A3");
    await expect(block.locator(".seq-row-label").first()).toHaveText("A4");
    // A vibrato on the Oscillator: the sequencer's notes follow its frequency live.
    await plug(page, socket(lfo, "out"), socket(osc, "mod:frequency"));
    await plug(page, socket(seq, "out"), socket(out, "in"));
    expect(await cableCount(page)).toBe(4);
    await expect.poll(() => peakLevel(page, seq, 0.3), { timeout: 5000 }).toBeGreaterThanOrEqual(0.3);
});

test("a key held on the keyboard holds the note, released it fades", async ({ page }) => {
    const keys = await add(page, "Keyboard");
    const osc = await add(page, "Oscillator");
    const env = await add(page, "Envelope");
    await plug(page, socket(keys, "out"), socket(env, "gate"));
    await plug(page, socket(osc, "out"), socket(env, "in"));
    const level = () =>
        node(page, env)
            .locator(".block")
            .evaluate((b) => parseFloat(getComputedStyle(b).getPropertyValue("--level")) || 0);
    await page.locator(".mat").click({ position: { x: 5, y: 5 } });
    await page.keyboard.down("KeyA");
    // Well past attack + decay + hold: a one-shot note would be over by now.
    await page.waitForTimeout(1500);
    expect(await level()).toBeGreaterThan(0.4);
    await page.keyboard.up("KeyA");
    await expect.poll(level, { timeout: 3000 }).toBeLessThan(0.2);
});

test("an oscillator sounds at the frequency of its slider", async ({ page }) => {
    const osc = await add(page, "Oscillator");
    // 220 Hz by default: about 220 rising zero crossings per second in the wave it plays.
    const measured = () => node(page, osc).locator(".mini-scope").evaluate((c) => Number((c as HTMLElement).dataset.measuredHz));
    await expect.poll(measured, { timeout: 3000 }).toBeGreaterThan(205);
    expect(await measured()).toBeLessThan(235);
});

test("the patch is saved and restored on reload", async ({ page }) => {
    await add(page, "Noise");
    await add(page, "Output");
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.locator(".react-flow__node")).toHaveCount(2);
});

test("a link holds the whole patch: copied by the share button, opened over the mat, undoable", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await loadPreset(page, "Groove");
    const blocks = await nodeCount(page);
    const cables = await cableCount(page);
    await page.click(".share-button");
    await expect(page.locator(".share-bubble")).toContainText("Link copied");
    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(url).toMatch(/#patch=[\w-]+$/);

    await clearMat(page);
    // Pasted in the address bar: the patch comes back, and the link's fragment goes away.
    await page.goto(url);
    await expect(page.locator(".react-flow__node")).toHaveCount(blocks);
    await expect(page.locator(".react-flow__edge")).toHaveCount(cables);
    expect(new URL(page.url()).hash).toBe("");
    // Ctrl+Z: back to the mat as it was before opening the link.
    await page.keyboard.press("Control+z");
    await expect(page.locator(".react-flow__node")).toHaveCount(0);
});

test("Ctrl+A / Ctrl+C / Ctrl+V select, copy and paste blocks, without their cables, at the pointer", async ({ page }) => {
    const noise = await add(page, "Noise");
    const out = await add(page, "Output");
    await plug(page, socket(noise, "out"), socket(out, "in"));
    expect(await cableCount(page)).toBe(1);
    // Select both blocks (Ctrl+A), copy, then paste elsewhere.
    await page.keyboard.press("Control+a");
    await expect(page.locator(".react-flow__node.selected")).toHaveCount(2);
    await page.keyboard.press("Control+c");
    const mat = (await page.locator(".mat").boundingBox())!;
    await page.mouse.move(mat.x + 120, mat.y + mat.height - 160);
    await page.keyboard.press("Control+v");
    await expect(page.locator(".react-flow__node")).toHaveCount(4);
    expect(await cableCount(page)).toBe(1);
    await expect(page.locator(".block-noise")).toHaveCount(2);
    // One undo removes the pasted blocks.
    await page.keyboard.press("Control+z");
    await expect(page.locator(".react-flow__node")).toHaveCount(2);
});
