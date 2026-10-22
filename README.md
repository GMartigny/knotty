# knotty

Synthé modulaire ludique dans le navigateur : on pose des blocs sur un tapis et on les relie avec des câbles qui pendent et rebondissent.

## Démarrer

```bash
npm install
npm run dev
```

## Architecture

- **`src/store/graph.ts`** : le graphe (blocs, câbles, réglages) dans un store Zustand. C'est la seule source de vérité.
- **`src/audio/engine.ts`** : s'abonne au store et applique les différences au graphe Tone.js (création, `connect`, `disconnect`, `dispose`).
- **`src/modules/`** : un fichier par type de bloc (ports, réglages, création des nœuds Tone). Ajouter un bloc = un fichier + une ligne dans `registry.ts`.
- **`src/cables/`** : câbles en corde Verlet. Le nombre de points dépend de la longueur (un tous les ~30 px, entre 6 et 24). Une seule boucle `requestAnimationFrame` anime tous les câbles et s'arrête quand tout est immobile ; les chemins SVG sont écrits directement dans le DOM, sans re-render React.
- **`src/audio/levels.ts`** : niveau de sortie de chaque bloc, exposé en variable CSS `--level` pour les lueurs.

Les câbles sont typés `audio` ou `trigger` ; les connexions incompatibles et les boucles sont refusées.

## Feuille de route

1. ~~Bruit → Filtre → Réverb → Sortie, câbles Verlet~~
2. Oscillateur, Delay, Distorsion
3. Séquenceur et câbles trigger
4. Impulsions lumineuses le long des câbles
5. Sauvegarde locale, partage par URL
