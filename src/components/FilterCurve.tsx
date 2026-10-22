import { useMemo } from "react";
import type { ParamValues } from "../modules/types";

const W = 188;
const H = 54;
const PAD = 4;
const F_MIN = 20;
const F_MAX = 20000;
/** Plage verticale affichée, en dB : la résonance peut monter au-dessus de 0. */
const DB_TOP = 24;
const DB_BOTTOM = -36;
const POINTS = 120;
const TYPES: BiquadFilterType[] = ["lowpass", "highpass", "bandpass"];

/** Fréquences de l'axe horizontal, réparties en échelle logarithmique (comme l'oreille). */
const FREQS = Float32Array.from({ length: POINTS }, (_, i) => F_MIN * Math.pow(F_MAX / F_MIN, i / (POINTS - 1)));

/**
 * Un filtre du navigateur, hors de tout son, qui sert uniquement à calculer la courbe :
 * elle est donc exactement celle que le filtre réel applique.
 */
let probe: BiquadFilterNode | null = null;
const getProbe = () => {
    if (!probe) probe = new OfflineAudioContext(1, 1, 44100).createBiquadFilter();
    return probe;
};

const x = (f: number) => PAD + (Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN)) * (W - PAD * 2);
const y = (db: number) => {
    const clamped = Math.max(DB_BOTTOM, Math.min(DB_TOP, db));
    return PAD + ((DB_TOP - clamped) / (DB_TOP - DB_BOTTOM)) * (H - PAD * 2);
};

/** Courbe de réponse du Filtre : quelles fréquences passent, lesquelles sont coupées. */
export function FilterCurve({ params }: { params: ParamValues }) {
    const { mode, frequency, Q } = params;

    const line = useMemo(() => {
        const filter = getProbe();
        filter.type = TYPES[mode] ?? "lowpass";
        filter.frequency.value = frequency;
        filter.Q.value = Q;
        const mag = new Float32Array(POINTS);
        filter.getFrequencyResponse(FREQS, mag, new Float32Array(POINTS));
        return Array.from(FREQS, (f, i) => `${i ? "L" : "M"} ${x(f).toFixed(1)} ${y(20 * Math.log10(mag[i] || 1e-6)).toFixed(1)}`).join(" ");
    }, [mode, frequency, Q]);

    const cut = x(frequency);
    const zero = y(0);

    return (
        <svg className="filter-curve" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Fréquences qui passent dans le filtre">
            {/* Repère 0 dB : au-dessus, la résonance renforce ; en dessous, le filtre coupe. */}
            <line x1={0} x2={W} y1={zero} y2={zero} className="filter-zero" />
            <path d={`${line} L ${W - PAD} ${H} L ${PAD} ${H} Z`} className="env-fill" />
            <path d={line} className="env-line" />
            <line x1={cut} x2={cut} y1={PAD} y2={H - PAD} className="filter-cut" />
        </svg>
    );
}
