import type { ParamValues } from "../modules/types";
import { DISPLAY } from "./display";

const { width: W, height: H } = DISPLAY;
const PAD = 4;

/** Drawing of the ADSR curve: each phase gets a width proportional to its duration. */
export function EnvelopeShape({ params }: { params: ParamValues }) {
    const { attack, decay, sustain, hold, release } = params;
    // Square root: short phases stay visible next to long ones.
    const spans = [attack, decay, hold, release].map((s) => Math.sqrt(s));
    const total = spans.reduce((a, b) => a + b, 0) || 1;
    const scale = (W - PAD * 2) / total;
    const top = PAD;
    const bottom = H - PAD;
    const sustainY = bottom - (bottom - top) * sustain;

    let x = PAD;
    const pts: [number, number][] = [[x, bottom]];
    x += spans[0] * scale;
    pts.push([x, top]);
    x += spans[1] * scale;
    pts.push([x, sustainY]);
    x += spans[2] * scale;
    pts.push([x, sustainY]);
    x += spans[3] * scale;
    pts.push([x, bottom]);

    const line = pts.map(([px, py], i) => `${i ? "L" : "M"} ${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");

    return (
        <svg className="env-shape" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Envelope shape">
            <path d={`${line} Z`} className="env-fill" />
            <path d={line} className="env-line" />
        </svg>
    );
}
