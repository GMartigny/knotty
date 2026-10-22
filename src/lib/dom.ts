/** Is the user typing in a text field? Then keyboard shortcuts and notes are left to the field. */
export const isTextField = (target: EventTarget | null) =>
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && target.type !== "range") ||
    (target instanceof HTMLElement && target.isContentEditable);
