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
- **`src/cables/`** : câbles en corde Verlet. Le nombre de points dépend de la longueur (un tous les ~16 px, entre 8 et 40, pour que les extrémités restent souples). Une seule boucle `requestAnimationFrame` anime tous les câbles et s'arrête quand tout est immobile ; les chemins SVG sont écrits directement dans le DOM, sans re-render React.
- **`src/audio/levels.ts`** : niveau de sortie de chaque bloc, exposé en variable CSS `--level` pour les lueurs.

Les câbles sont typés `audio` ou `trigger` ; les connexions incompatibles et les boucles sont refusées.

Un câble trigger ne transporte pas de son : le moteur abonne l'entrée (`trigger`) à la sortie (`listen`) et transmet l'heure audio de chaque impulsion. Le Bruit sonne en continu tant que rien n'est branché sur son entrée « Déclencheur », puis seulement à chaque coup dès qu'un câble y arrive.

## Feuille de route

1. ~~Bruit → Filtre → Réverb → Sortie, câbles Verlet~~
2. ~~Séquenceur (4 lignes × 16 pas, une sortie trigger par ligne) et câbles trigger~~
3. ~~Bloc Sinus déclenchable~~, débrancher un câble en tirant depuis sa prise
4. ~~Enveloppe ADSR~~, Delay, Distorsion
5. Impulsions lumineuses le long des câbles
6. Sauvegarde locale, partage par URL
