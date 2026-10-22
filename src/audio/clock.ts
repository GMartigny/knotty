import * as Tone from "tone";

/** Called on each sixteenth note with the audio time and the sixteenth number since the start. */
type SixteenthListener = (time: number, sixteenth: number) => void;

const listeners = new Set<SixteenthListener>();
let started = false;

/**
 * Clock shared by all sequencers: a single "16n" loop on the transport,
 * created when the app starts (transport stopped, tempo stable), which dispatches every sixteenth.
 *
 * Why not one loop per sequencer: when Tone.js creates a loop while the transport
 * is already running, it converts the next position to seconds and back to a position with
 * the current tempo. Right after a tempo change (which applies with a slight delay),
 * the round trip doesn't cancel out and the first step is scheduled several seconds too late,
 * all the more so the longer the transport has been running. Subscribing to this clock schedules nothing.
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

/** Subscribes to sixteenth notes; returns the unsubscribe function. */
export function onSixteenth(fn: SixteenthListener) {
    startClock();
    listeners.add(fn);
    return () => listeners.delete(fn);
}
