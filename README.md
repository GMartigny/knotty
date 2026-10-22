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
- **`src/store/persist.ts`** : le patch (blocs, positions, réglages, câbles) est enregistré dans le `localStorage` 300 ms après chaque modification et restauré à l'ouverture. Au chargement, il est nettoyé pour la version actuelle : blocs inconnus ignorés, réglages complétés par leurs valeurs par défaut, câbles vers des prises disparues retirés.
- **`src/audio/levels.ts`** : niveau de sortie de chaque bloc, exposé en variable CSS `--level` pour les lueurs.

Les câbles sont typés `audio` ou `trigger` ; les connexions incompatibles et les boucles sont refusées. Le cœur de chaque prise donne sa couleur (orange = son, jaune = déclencheur) et, pendant un tirage, seules les prises compatibles s'allument.

**Modulation** : chaque curseur continu a sa prise (anneau bleu ciel), qui accepte un câble son. Le signal s'ajoute à la position du curseur : ±moitié de la plage, ou ±100 % de la valeur sur une échelle log, pour une source à son niveau normal (−12 dB, `SOURCE_LEVEL`). Un Oscillateur branché sur la Fréquence d'un autre donne du vibrato (lent) ou de la FM (rapide). Les paramètres audio (fréquences, résonance, mix, volume) sont modulés en temps réel (`modTarget`, via `DrivenParam` dans `src/modules/mod.ts`, car Tone.js remet un paramètre à zéro dès qu'on y branche un signal) ; les durées de l'Enveloppe sont lues à chaque déclenchement (`setModSource`). Le tempo et la durée de la réverb n'ont pas de prise.

Un câble trigger ne transporte pas de son : le moteur abonne l'entrée (`trigger`) à la sortie (`listen`) et transmet l'heure audio de chaque impulsion, et éventuellement une note (fréquence). Le Clavier (touches de l'ordinateur par position physique, ou mini-piano cliquable) envoie des notes : branché sur l'entrée « Note » d'un Oscillateur, il en fixe la hauteur ; sur le Déclencheur d'une Enveloppe, il la déclenche. Comme dans un vrai modulaire, les sources (Oscillateur, Bruit) sonnent en continu ; c'est l'Enveloppe, déclenchée par le Séquenceur, qui les découpe en notes. Sans Déclencheur branché, l'Enveloppe laisse passer le son tel quel.

## Feuille de route

1. ~~Bruit → Filtre → Réverb → Sortie, câbles Verlet~~
2. ~~Séquenceur (4 lignes × 16 pas, une sortie trigger par ligne) et câbles trigger~~
3. ~~Oscillateur (sinus, carré, triangle, scie) avec mini-oscilloscope~~, débrancher un câble en tirant depuis sa prise
4. ~~Enveloppe ADSR, Volume, Mixeur 4 voies, prises de modulation sur les curseurs~~
5. Impulsions lumineuses le long des câbles
6. ~~Sauvegarde locale, modèles « Groove » et « Doux »~~, partage par URL
7. ~~Clavier (ordinateur et mini-piano)~~
8. ~~Écho calé sur le tempo, Distorsion, Gamme (signal → notes justes), mini-onde du Filtre~~
