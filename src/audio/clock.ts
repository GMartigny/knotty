import * as Tone from "tone";

/** Appelé à chaque double-croche avec l'heure audio et le numéro de double-croche depuis le début. */
export type SixteenthListener = (time: number, sixteenth: number) => void;

const listeners = new Set<SixteenthListener>();
let started = false;

/**
 * Horloge commune à tous les séquenceurs : une seule boucle « 16n » sur le transport,
 * créée au démarrage de l'app (transport arrêté, tempo stable), qui distribue chaque double-croche.
 *
 * Pourquoi pas une boucle par séquenceur : quand Tone.js crée une boucle alors que le transport
 * tourne déjà, il convertit la prochaine position en secondes puis de nouveau en position avec
 * le tempo du moment. Juste après un changement de tempo (qui s'applique avec un léger décalage),
 * l'aller-retour ne se compense pas et le premier pas est planifié plusieurs secondes trop tard,
 * d'autant plus que le transport tourne depuis longtemps. S'abonner à cette horloge-ci ne planifie rien.
 */
export function startClock() {
    if (started) return;
    started = true;
    const transport = Tone.getTransport();
    const sixteenth = Tone.Time("16n").toTicks();
    transport.scheduleRepeat(
        (time) => {
            const n = Math.round(transport.getTicksAtTime(time) / sixteenth);
            for (const fn of listeners) fn(time, n);
        },
        "16n",
        0,
    );
}

/** S'abonne aux doubles-croches ; renvoie la fonction de désabonnement. */
export function onSixteenth(fn: SixteenthListener) {
    startClock();
    listeners.add(fn);
    return () => listeners.delete(fn);
}
