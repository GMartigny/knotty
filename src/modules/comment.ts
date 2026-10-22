import type { ModuleDef } from "./types";

/** Taille d'un Commentaire neuf ; ensuite, c'est l'utilisateur qui le redimensionne. */
export const COMMENT_SIZE = { width: 380, height: 240 };

/** Un Commentaire est un cadre posé derrière les blocs et les câbles, à la taille choisie. */
export const commentFrame = (width: number, height: number) => ({ width, height, zIndex: -1 });

/**
 * Commentaire : un cadre redimensionnable avec un texte, posé derrière les blocs
 * pour regrouper et nommer les parties d'une composition. Aucun son, aucune prise.
 */
export const comment: ModuleDef = {
    type: "comment",
    label: "Commentaire",
    icon: "✎",
    category: "note",
    inputs: [],
    outputs: [],
    params: [],
    create: () => ({
        input: () => undefined,
        output: () => undefined,
        setParam() {},
        dispose() {},
    }),
};
