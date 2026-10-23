import { expect, type Page } from "@playwright/test";

/** Opens the app, collecting page errors, and starts the sound. */
export async function open(page: Page) {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await page.click(".start-button");
    return errors;
}

export async function center(page: Page, selector: string) {
    const box = (await page.locator(selector).first().boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drags with the mouse from one point to another, in small steps. */
export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();
}

/** Holds the big cross until everything has fallen. */
export async function clearMat(page: Page) {
    if (!(await page.locator(".clear-button").count())) return;
    const c = await center(page, ".clear-button");
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.waitForTimeout(2200);
    await page.mouse.up();
    await expect(page.locator(".react-flow__node")).toHaveCount(0, { timeout: 3000 });
}

export async function loadPreset(page: Page, name: string) {
    await clearMat(page);
    await page.click(".example-button");
    await page.getByRole("menuitem", { name }).click();
    await page.waitForTimeout(1200);
}

export const nodeCount = (page: Page) => page.locator(".react-flow__node").count();
export const cableCount = (page: Page) => page.locator(".react-flow__edge").count();
export const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);

/** Highest glow (output level, 0…1) of a block over a short while, or as soon as it reaches `enough`. */
export async function peakLevel(page: Page, id: string, enough = 1, ms = 2500) {
    let peak = 0;
    for (let t = 0; t < ms && peak < enough; t += 50) {
        const level = await node(page, id)
            .locator(".block")
            .evaluate((b) => parseFloat(getComputedStyle(b).getPropertyValue("--level")) || 0);
        peak = Math.max(peak, level);
        await page.waitForTimeout(50);
    }
    return peak;
}
