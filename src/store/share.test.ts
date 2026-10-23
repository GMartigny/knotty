// @vitest-environment node
import { describe, expect, it } from "vitest";
import { packPatch, packedFromHash, shareUrl, unpackPatch } from "./share";
import { toCompact } from "./persist";
import { EXAMPLES, examplePatch } from "./example";

describe("sharing a patch in a link", () => {
    it("packs and unpacks every preset, in a link of reasonable length", async () => {
        for (const ex of EXAMPLES) {
            const { nodes, edges } = examplePatch(ex.id);
            const compact = toCompact(nodes, edges);
            const packed = await packPatch(compact);
            expect(packed).toMatch(/^[\w-]+$/);
            expect(packed.length, ex.id).toBeLessThan(4000);
            expect(await unpackPatch(packed)).toEqual(compact);
        }
    });

    it("finds the packed patch in the link", () => {
        const url = shareUrl("abc", "https://knotty.app/");
        expect(url).toBe("https://knotty.app/#patch=abc");
        expect(packedFromHash(new URL(url).hash)).toBe("abc");
        expect(packedFromHash("#patch=")).toBeNull();
        expect(packedFromHash("#other")).toBeNull();
    });

    it("throws on a broken link", async () => {
        await expect(unpackPatch("not-a-patch")).rejects.toThrow();
    });
});
