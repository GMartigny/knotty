import { useEffect, useRef } from "react";
import { engine } from "../audio/engine";
import { SOURCE_LEVEL } from "../modules/types";

const W = 188;
const H = 54;
const PAD = 5;
/** En dessous de cette fréquence, un cycle ne tient pas dans la mémoire : la courbe défile. */
const SLOW_HZ = 40;
const CYCLES = 3;
const TRAIL = 140;

interface Props {
    nodeId: string;
    /** Fréquence réglée, pour cadrer l'affichage sur quelques cycles. */
    frequency: number;
    /** Forme réglée (index dans SHAPES), pour l'aperçu avant le lancement du son. */
    shape: number;
}

/** Forme idéale à la phase t (0…1), entre -1 et 1. */
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
 * Mini-oscilloscope : l'onde en direct, calée sur le début d'un cycle pour rester immobile.
 * Pour un signal lent, un tracé qui défile. Avant le lancement du son, la forme idéale.
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
        const trail: number[] = [];
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
            // L'oscillateur sort à -12 dB : on le ramène à pleine hauteur.
            const gain = 1 / SOURCE_LEVEL;

            if (!samples) {
                // Son pas encore lancé : forme idéale sur quelques cycles.
                draw(Array.from({ length: 241 }, (_, i) => ideal(form.current, (i / 240) * CYCLES)));
                return;
            }

            if (freq.current < SLOW_HZ) {
                trail.push(samples[samples.length - 1] * gain);
                if (trail.length > TRAIL) trail.shift();
                draw(trail);
                return;
            }
            trail.length = 0;

            // Calage : premier passage par zéro en montant, puis ~3 cycles.
            const perCycle = engine.sampleRate / freq.current;
            const span = Math.min(samples.length - 1, Math.round(perCycle * CYCLES));
            let start = 0;
            for (let i = 1; i < samples.length - span; i++) {
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

    return <canvas ref={canvas} className="mini-scope" style={{ width: W, height: H }} role="img" aria-label="Forme de l'onde" />;
}
