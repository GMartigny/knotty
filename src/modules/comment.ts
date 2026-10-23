import type { ModuleDef } from "./types";

/** Size of a new Comment; after that, the user resizes it. */
export const COMMENT_SIZE = { width: 380, height: 240 };

/**
 * A Comment is a frame placed behind blocks and cables, at the chosen size.
 * It only moves by its grip, so clicks inside the frame reach the mat and the blocks.
 */
export const commentFrame = (width: number, height: number) => ({ width, height, zIndex: -1, dragHandle: ".comment-grip" });

/**
 * Comment: a resizable frame with some text, placed behind blocks
 * to group and name the parts of a composition. No sound, no sockets.
 */
export const comment: ModuleDef = {
    type: "comment",
    label: "Comment",
    description: "A resizable frame with some text, behind the blocks, to name the parts of a patch.",
    icon: "✎",
    category: "note",
    inputs: [],
    outputs: [],
    params: [],
    create: () => ({
        input: () => undefined,
        output: () => undefined,
        setParam() {},
        dispose() {},
    }),
};
