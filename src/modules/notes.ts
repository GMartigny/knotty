/** Note names in an octave, from C. */
export const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

/** Name of a MIDI note, e.g. 67 → "G4". */
export const noteName = (midi: number) => `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

/** Frequency of a MIDI note, in Hz (A4 = 69 = 440 Hz). */
export const frequencyOf = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** MIDI number of the C that starts `octave` (C4 = 60). */
export const midiC = (octave: number) => 12 * (octave + 1);
