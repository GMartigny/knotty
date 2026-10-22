# knotty — notes pour les agents

Vite + React 19 + TypeScript, React Flow (`@xyflow/react`), Tone.js, Zustand. Interface, commentaires de code et messages de commit en français.

## Architecture

- **`src/store/graph.ts`** : le graphe (blocs, câbles, réglages) dans un store Zustand. C'est la seule source de vérité.
- **`src/audio/engine.ts`** : s'abonne au store et applique les différences au graphe Tone.js (création, `connect`, `disconnect`, `dispose`). Un bloc `removing` ou un câble `dropping` (en train de tomber) est déjà considéré comme retiré.
- **`src/audio/clock.ts`** : horloge commune à la double croche (`onSixteenth`), partagée par les séquenceurs et l'Écho, pour qu'ils restent calés et démarrent sans délai.
- **`src/modules/`** : un fichier par type de bloc (`ModuleDef` : ports, réglages, création des nœuds Tone). Ajouter un bloc = un fichier + une ligne dans `registry.ts`.
- **`src/cables/`** : câbles en corde Verlet. Le nombre de points dépend de la longueur (un tous les ~16 px, entre 8 et 40, pour que les extrémités restent souples). Une seule boucle `requestAnimationFrame` anime tous les câbles et s'arrête quand tout est immobile ; les chemins SVG sont écrits directement dans le DOM, sans re-render React.
- **`src/store/persist.ts`** : le patch (blocs, positions, réglages, câbles, texte et taille des Commentaires) est enregistré dans le `localStorage` 300 ms après chaque modification et restauré à l'ouverture. Au chargement, il est nettoyé pour la version actuelle : blocs inconnus ignorés, réglages complétés par leurs valeurs par défaut, câbles vers des prises disparues retirés.
- **`src/store/example.ts`** : les modèles (Doux, Groove, Métal). Les blocs d'un modèle ne doivent pas se chevaucher.
- **`src/audio/levels.ts`** : niveau de sortie de chaque bloc, exposé en variable CSS `--level` pour les lueurs.

## Câbles et signaux

Les prises sont typées `audio`, `trigger` ou `mod` ; les connexions incompatibles et les boucles sont refusées. Un son peut aussi se brancher sur une prise `mod`.

Un câble trigger ne transporte pas de son : le moteur abonne l'entrée (`trigger`) à la sortie (`listen`) et transmet l'heure audio de chaque impulsion, et éventuellement une note (fréquence). Comme dans un vrai modulaire, les sources (Oscillateur, Bruit) sonnent en continu au niveau `SOURCE_DB` (−12 dB) ; c'est l'Enveloppe qui les découpe en notes. Sans Déclencheur branché, l'Enveloppe laisse passer le son tel quel.

**Modulation** : chaque curseur continu a sa prise `mod:<réglage>`. Le signal s'ajoute à la position du curseur : ±moitié de la plage, ou ±100 % de la valeur sur une échelle log, pour une source à son niveau normal (`SOURCE_LEVEL`). Les paramètres audio sont modulés en temps réel (`modTarget`, via `DrivenParam` dans `src/modules/mod.ts`, car Tone.js remet un paramètre à zéro dès qu'on y branche un signal) ; les durées de l'Enveloppe sont lues à chaque déclenchement (`setModSource`). Un réglage marqué `modulatable: false` n'a pas de prise.

**Commentaire** : nœud `comment` sans son ni prise, rendu par `CommentBlock` derrière les blocs et les câbles (`zIndex: -1`, `elevateNodesOnSelect={false}`), redimensionnable avec `NodeResizer`.

## Vérifier

- `npm run build` (inclut `tsc -b`).
- Tests manuels avec Playwright sur `vite preview` (port 4173) : niveaux via `--level`, chevauchements des blocs dans les modèles, absence d'erreur de page.
- Déploiement automatique sur Vercel à chaque push sur `main`.
