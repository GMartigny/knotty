# knotty

Synthé modulaire ludique dans le navigateur : on pose des blocs sur un tapis et on les relie avec des câbles qui pendent et rebondissent.

**En ligne : [knotty-synth.vercel.app](https://knotty-synth.vercel.app)** (ordinateur, avec souris)

## Comment ça marche

- **Ajouter un bloc** : glisse-le depuis la palette sur le tapis (ou clique dessus).
- **Brancher** : tire un câble d'une prise à une autre. Pendant le tirage, seules les prises compatibles s'allument.
- **Débrancher** : tire depuis une prise déjà branchée et lâche dans le vide ; le câble tombe.
- **Couleur des prises** : orange = son, jaune = déclencheur (séquenceur, clavier), anneau bleu ciel = réglage qu'un son peut faire bouger.
- **Faire du son** : les sources (Oscillateur, Bruit) sonnent en continu ; une Enveloppe déclenchée par le Séquenceur ou le Clavier les découpe en notes. Tout finit dans la Sortie.
- **Moduler** : branche un Oscillateur lent sur la prise d'un réglage (fréquence d'un filtre, d'un autre oscillateur…) pour le faire bouger tout seul.
- **S'y retrouver** : le bloc Commentaire est un cadre redimensionnable avec un texte, pour nommer les parties d'une composition.
- **Modèles** : la grosse croix en haut à droite vide le tapis, puis « Charger un modèle » propose Doux, Groove et Métal.
- Ton patch est enregistré automatiquement dans le navigateur.

## Lancer en local

```bash
npm install
npm run dev
```
