import { describe, expect, it } from "vitest";
import { nextLevel } from "./level";

describe("level shown on a glow", () => {
    it("is written the first time, then only when it moves enough", () => {
        expect(nextLevel(undefined, 0.333)).toBe(0.33);
        expect(nextLevel(0.33, 0.35)).toBeUndefined();
        expect(nextLevel(0.33, 0.31)).toBeUndefined();
        expect(nextLevel(0.33, 0.38)).toBe(0.38);
        expect(nextLevel(0.33, 0.27)).toBe(0.27);
    });

    it("always goes back to 0 when the sound stops", () => {
        expect(nextLevel(0.03, 0)).toBe(0);
        expect(nextLevel(0, 0)).toBeUndefined();
        expect(nextLevel(0, 0.02)).toBeUndefined();
    });
});
