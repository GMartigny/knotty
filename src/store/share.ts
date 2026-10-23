import type { CompactPatch } from "./persist";

/** The link's fragment: `#patch=<compressed patch>`. A fragment never reaches the server. */
const PREFIX = "#patch=";

/** Bytes → base64url (no `+`, `/` or `=`, so the link needs no escaping). */
function toBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
    const out = new Blob([bytes]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(out).arrayBuffer());
}

/** A patch packed for a link: compact JSON, deflated, in base64url. */
export async function packPatch(patch: CompactPatch): Promise<string> {
    const json = new TextEncoder().encode(JSON.stringify(patch));
    return toBase64Url(await pipe(json, new CompressionStream("deflate-raw")));
}

/** The patch packed in a link (see `packPatch`), not cleaned up yet; throws if it is unreadable. */
export async function unpackPatch(packed: string): Promise<unknown> {
    const json = await pipe(fromBase64Url(packed), new DecompressionStream("deflate-raw"));
    return JSON.parse(new TextDecoder().decode(json));
}

/** The link that opens this patch. */
export const shareUrl = (packed: string, base = `${location.origin}${location.pathname}`) => `${base}${PREFIX}${packed}`;

/** The packed patch in a URL fragment, if it holds one. */
export const packedFromHash = (hash: string) => (hash.startsWith(PREFIX) && hash.length > PREFIX.length ? hash.slice(PREFIX.length) : null);
