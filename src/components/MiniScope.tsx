import { useEffect, useRef } from "react";
import { engine } from "../audio/engine";
import { SOURCE_LEVEL } from "../modules/types";

const W = 188;
const H = 54;
const PAD = 5;
const CYCLES = 3;
/** Cycles minimum à caler dans la mémoire ; en dessous, la courbe défile. */
const MIN_CYCLES = 1.5;
/** Mode défilant : un point toutes les ~4 ms d'audio. */
const TRAIL_STEP_S = 0.004;

interface Props {
    nodeId: string;
    /**
     * Fréquence réglée, pour cadrer l'affichage sur quelques cycles. Absente (ex. Filtre) :
     * la période est estimée sur le signal, et la hauteur de l'onde s'adapte à son niveau.
     */
    frequency?: number;
    /** Forme réglée (index dans SHAPES), pour l'aperçu avant le lancement du son. */
    shape?: number;
}

/** Fenêtre affichée quand le signal n'a pas de période nette (bruit, silence), en secondes. */
const FREE_WINDOW_S = 0.02;

/**
 * Période estimée d'après les passages par zéro en montant, sur la fin du tampon.
 * `undefined` si le signal n'est pas assez régulier (bruit) ou trop faible.
 */
const estimatePeriod = (s: Float32Array): number | undefined => {
    const from = Math.max(1, s.length - 8192);
    const crossings: number[] = [];
    for (let i = from; i < s.length; i++) if (s[i - 1] < 0 && s[i] >= 0) crossings.push(i);
    if (crossings.length < 3) return undefined;
    const gaps = crossings.slice(1).map((c, i) => c - crossings[i]);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const spread = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
    // Écarts trop irréguliers : pas une onde périodique.
    return spread / mean < 0.15 ? mean : undefined;
};

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
 * Pour un signal trop lent pour tenir en mémoire (< ~7 Hz), un tracé qui défile. Avant le lancement du son, la forme idéale.
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
        /** Mode défilant : valeurs horodatées sur l'horloge audio (s). */
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
            // L'oscillateur sort à -12 dB : on le ramène à pleine hauteur.
            const gain = 1 / SOURCE_LEVEL;

            if (!samples) {
                // Son pas encore lancé : forme idéale sur quelques cycles, ou une ligne plate.
                draw(
                    form.current === undefined
                        ? [0, 0]
                        : Array.from({ length: 241 }, (_, i) => ideal(form.current!, (i / 240) * CYCLES)),
                );
                return;
            }

            if (freq.current === undefined) {
                // Signal quelconque (Filtre) : période estimée, hauteur adaptée au niveau.
                const period = estimatePeriod(samples);
                const len = samples.length;
                const span = Math.round(period ? Math.min(period * CYCLES, len - 1 - period) : engine.sampleRate * FREE_WINDOW_S);
                let start = len - span - 1;
                if (period) {
                    for (let i = len - span - 1; i > 0; i--) {
                        if (samples[i - 1] < 0 && samples[i] >= 0) {
                            start = i;
                            break;
                        }
                    }
                }
                const step = Math.max(1, Math.floor(span / 160));
                const raw: number[] = [];
                for (let i = start; i <= start + span; i += step) raw.push(samples[i]);
                const peak = raw.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
                // Silence : ligne plate plutôt que du bruit de fond agrandi.
                draw(peak < 0.003 ? [0, 0] : raw.map((x) => (x / peak) * 0.9));
                return;
            }

            const len = samples.length;
            // Fréquence réellement jouée (une note peut avoir remplacé celle du curseur).
            const hz = engine.pitch(nodeId) ?? freq.current!;
            el.dataset.hz = hz.toFixed(1);
            const perCycle = engine.sampleRate / hz;

            if (perCycle * (MIN_CYCLES + 1) > len) {
                // Signal lent : la mémoire ne contient pas assez de cycles, la courbe défile.
                // Le dernier échantillon correspond à l'horloge audio ; on ajoute un point toutes les
                // ~4 ms d'audio écoulées depuis le dernier point, sans dépendre du rythme des images.
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

            // Calage : dernier passage par zéro en montant qui laisse la place d'afficher ~3 cycles.
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

    return <canvas ref={canvas} className="mini-scope" style={{ width: W, height: H }} role="img" aria-label="Forme de l'onde" />;
}
