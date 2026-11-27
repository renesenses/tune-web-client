# Zone icons

52 icons for Tune zones: rooms (`pieces/`), people (`personnes/`) and devices (`appareils/`).

- Drawn from scratch by Rémi for Tune, 27/11/2026, on a 24 × 24 grid: 1.75 stroke, rounded caps and joins, `stroke="currentColor"` (the colour follows the theme).
- No path is taken from any other product, platform or brand.
- **Licence: CC0 1.0 Universal (public domain dedication).** You may copy, modify and redistribute them, for any purpose, without asking. https://creativecommons.org/publicdomain/zero/1.0/

The default icon of a zone (from its `output_type`, refined by `brand`, `model`, `detected_manufacturer` and its name) and the per-zone choice are in `src/lib/iconesZone.ts`. The icons are drawn by `src/components/partages/IconeZone.svelte`.

| Folder | Icons |
|---|---|
| `pieces/` | maison, salon, salle-ecoute, home-cinema, chambre, chambre-enfant, cuisine, salle-a-manger, bureau, bibliotheque, studio, salle-de-bain, salle-de-jeux, salle-de-sport, entree, cave, atelier, garage, jardin, terrasse, exterieur, voiture |
| `personnes/` | homme-court, homme-barbe, homme-boucles, homme-casquette, femme-carre, femme-queue, femme-chignon, femme-boucles |
| `appareils/` | enceinte, colonnes, enceinte-reseau, enceinte-connectee, enceinte-portable, barre-de-son, caisson, ampli, dac, streamer, platine, casque, ecouteurs, telephone, tablette, portable, ordinateur, televiseur, recepteur-tv, navigateur, serveur, groupe |
