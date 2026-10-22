import { useEffect, useRef } from "react";
import { engine } from "../audio/engine";
import { SOURCE_LEVEL } from "../modules/types";
import { DISPLAY } from "./display";

const { width: W, height: H } = DISPLAY;
const PAD = 5;
const CYCLES = 3;
/** Minimum cycles to fit in memory; below that, the curve scrolls. */
const MIN_CYCLES = 1.5;
/** Scrolling mode: one point every ~4 ms of audio. */
const TRAIL_STEP_S = 0.004;

interface Props {
    nodeId: string;
    /** Set frequency, to frame the display on a few cycles. */
    frequency: number;
    /** Set shape (index in SHAPES), for the preview before sound starts. */
    shape: number;
}

/** Ideal shape at phase t (0…1), between -1 and 1. */
const ideal = (shape: number, t: number) => {
    const p = t - Math.floor(t);
    switch (shape) {
        case 1:
            return p < 0.5 ? 1 : -1;
        case 2:
            return p < 0.25 ? p * 4 : p < 0.75 ? 2 - p * 4 : p * 4 - 4;
        case 3:
            return p < 0.5 ? p * 2 : p * 2 - 2;
        default:
            return Math.sin(p * Math.PI * 2);
    }
};

/**
 * Mini-oscilloscope: the live wave, locked to the start of a cycle so it stays still.
 * For a signal too slow to fit in memory (< ~7 Hz), a scrolling trace. Before sound starts, the ideal shape.
 */
export function MiniScope({ nodeId, frequency, shape }: Props) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const freq = useRef(frequency);
    freq.current = frequency;
    const form = useRef(shape);
    form.current = shape;

    useEffect(() => {
        const el = canvas.current;
        const ctx = el?.getContext("2d");
        if (!el || !ctx) return;
        const dpr = window.devicePixelRatio || 1;
        el.width = W * dpr;
        el.height = H * dpr;
        ctx.scale(dpr, dpr);
        const ink = getComputedStyle(el).getPropertyValue("--ink").trim() || "#1a1b3a";
        /** Scrolling mode: values timestamped on the audio clock (s). */
        const trail: { t: number; v: number }[] = [];
        let frame = 0;

        const y = (v: number) => H / 2 - v * (H / 2 - PAD);

        const draw = (points: number[]) => {
            ctx.clearRect(0, 0, W, H);
            ctx.strokeStyle = ink;
            ctx.globalAlpha = 0.18;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, H / 2);
            ctx.lineTo(W, H / 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.lineWidth = 2.5;
            ctx.lineJoin = "round";
            ctx.beginPath();
            points.forEach((v, i) => {
                const x = PAD + (i / Math.max(1, points.length - 1)) * (W - PAD * 2);
                if (i === 0) ctx.moveTo(x, y(v));
                else ctx.lineTo(x, y(v));
            });
            ctx.stroke();
        };

        const tick = () => {
            frame = requestAnimationFrame(tick);
            const samples = engine.scope(nodeId);
            // The oscillator outputs at -12 dB: scale it back to full height.
            const gain = 1 / SOURCE_LEVEL;

            if (!samples) {
                // Sound not started yet: ideal shape over a few cycles.
                draw(Array.from({ length: 241 }, (_, i) => ideal(form.current, (i / 240) * CYCLES)));
                return;
            }

            const len = samples.length;
            // Frequency actually playing (a note may have replaced the slider's).
            const hz = engine.pitch(nodeId) ?? freq.current;
            el.dataset.hz = hz.toFixed(1);
            const perCycle = engine.sampleRate / hz;

            if (perCycle * (MIN_CYCLES + 1) > len) {
                // Slow signal: memory doesn't hold enough cycles, so the curve scrolls.
                // The last sample matches the audio clock; add a point for every
                // ~4 ms of audio elapsed since the last point, independently of the frame rate.
                const sr = engine.sampleRate;
                const now = engine.audioTime;
                const lastT = trail.length ? trail[trail.length - 1].t : now - (len - 1) / sr;
                for (let t = lastT + TRAIL_STEP_S; t <= now; t += TRAIL_STEP_S) {
                    const back = Math.round((now - t) * sr);
                    if (back < len) trail.push({ t, v: samples[len - 1 - back] * gain });
                }
                const windowS = Math.min(8, Math.max(1, 2 / hz));
                while (trail.length && trail[0].t < now - windowS) trail.shift();
                const step = Math.max(1, Math.floor(trail.length / 240));
                draw(trail.filter((_, i) => i % step === 0).map((p) => p.v));
                return;
            }
            trail.length = 0;

            // Locking: last rising zero crossing that leaves room to show ~3 cycles.
            const span = Math.min(Math.round(perCycle * CYCLES), len - 1 - Math.ceil(perCycle));
            let start = 0;
            for (let i = len - span - 1; i > 0; i--) {
                if (samples[i - 1] < 0 && samples[i] >= 0) {
                    start = i;
                    break;
                }
            }
            const step = Math.max(1, Math.floor(span / 160));
            const points: number[] = [];
            for (let i = start; i <= start + span; i += step) points.push(samples[i] * gain);
            draw(points);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [nodeId]);

    return <canvas ref={canvas} className="mini-scope" style={{ width: W, height: H }} role="img" aria-label="Waveform" />;
}
