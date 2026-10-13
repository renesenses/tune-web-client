# Chantier « accélération de l'UI » (web#1716)

Go de Bertrand le 13/10/2026. Branches : `chantier/perf-ui` (web, depuis `main`) ;
côté serveur, `chantier/perf-ui` depuis `batch/bugs-rc5-20261012`, créée seulement
quand une étape touche le serveur (aucune pour l'instant).

## Banc de mesure

Sur Shrek, jamais une vraie base : `HOME` et `TUNE_DB_PATH` dédiés, serveur sur
`127.0.0.1:18977`, sans scan ni découverte. Bases synthétiques :

| base | artistes | albums | pistes | note |
|---|---:|---:|---:|---|
| `bilou` | 1 295 | 3 679 | 17 373 | taille de la bibliothèque du fil 2256 |
| `grosse-upnp` | 4 000 | 9 427 | 95 925 | taille du .18, dont 5 501 albums UPnP (la clause de doublon de la cause 1 travaille dessus) |

Client : Chromium 1194 sans tête (Playwright), fenêtre 1440×900, contexte neuf
à chaque passe. On mesure le temps entre le clic sur l'onglet et la première
carte, plus les tâches longues (`PerformanceObserver('longtask')`). Shrek étant
partagé (charge entre 14 et 38 pendant les passes), les passes avant/après
alternent. Serveur : binaire de développement (debug), donc des temps serveur
pessimistes.

## État mesuré le 13/10 (avant la première étape)

- **`GET /library/albums?limit=100`** : 0,09 s (`bilou`), 0,5 s (`grosse-upnp`).
  Les 35 à 42 s de l'épique (causes 1 et 2) ne se reproduisent plus : les
  correctifs serveur `507c44b9` / `9d97626a` tiennent. Première carte de l'onglet
  Albums : 0,4 s (`bilou`), 0,8 s (`grosse-upnp`).
- **Onglet Artistes** : première carte à 1,2-1,6 s (`bilou`), 4,3-6,6 s
  (`grosse-upnp`), 3,7 s sur `bilou` avec le processeur ralenti ×4 (l'ordre de
  grandeur des 5-6 s de Bilou sous Windows). Une seule tâche longue fait presque
  tout ce temps (0,8-1,1 s sur `bilou`, 3,0-4,5 s sur `grosse-upnp`) : le
  **montage** des cartes (une `PochetteActions` et un `AlbumArt` par artiste,
  toutes montées d'un coup). Elle revient à chaque ouverture, pistes en cache ou
  non : la cause est le rendu, pas le chargement des pistes.
- À l'ouverture de l'onglet Artistes, le client charge aussi **toutes les pistes**
  (`demanderToutesLesPistes`, 4 pages de 5 000 sur `bilou`, 20 sur `grosse-upnp`,
  ~4 Mo de JSON chacune) et **tous les albums**, seulement pour savoir de quelles
  sources vient chaque artiste (filtre et comptes du menu Source). Ce n'est pas
  ce qui retarde la première carte, mais c'est du réseau, de l'analyse JSON et
  de la mémoire pour rien tant que personne n'ouvre le menu Source.

## Étape 1 — grille progressive de l'onglet Artistes (livrée, PR vers `chantier/perf-ui`)

Une tranche de 120 cartes à l'ouverture, la suivante quand le bas de la grille
approche (`IntersectionObserver`, 800 px d'avance). Le rail A–Z monte jusqu'à la
lettre visée avant de sauter ; le retour d'une fiche monte assez de cartes pour
reposer la position mémorisée. L'ordre, le filtre et les ancres ne changent pas.

| mesure (première carte, ms) | avant | après |
|---|---:|---:|
| `bilou`, 1re ouverture | 1 189 / 1 579 | 423 / 507 |
| `bilou`, 2e ouverture | 1 253 / 1 110 | 330 / 414 |
| `bilou`, processeur ×4, 1re ouverture | 3 697 | 845 |
| `bilou`, processeur ×4, 2e ouverture | 3 519 | 739 |
| `grosse-upnp`, 1re ouverture | 5 335 / 4 997 | 1 223 / 980 |
| `grosse-upnp`, 2e ouverture | 6 626 / 4 263 | 1 428 / 986 |

Plus longue tâche : 836-1 104 ms → 151-157 ms (`bilou`), 3 575-3 806 ms →
210-244 ms (`grosse-upnp`). Vérifié en vrai Chromium : le défilement monte la suite
(120 → 240 → 360…), le saut du rail tombe au même endroit qu'avant, le retour
d'une fiche repose le même `scrollTop` qu'avant.

## Étapes suivantes (à valider une par une)

2. **Ne plus charger toutes les pistes pour l'onglet Artistes.** Deux voies :
   - (a) client seul : ne demander les pistes qu'à l'ouverture du menu Source ou
     quand une source est choisie. Risque faible, mais les comptes du menu Source
     n'existent qu'après cette demande ;
   - (b) serveur : `/library/artists` rend les sources de chaque artiste (un
     `GROUP BY artist_id, source` sur `albums` et `tracks`), ou une route
     `/library/artists/sources`. Le client n'a plus besoin ni des pistes ni des
     albums. Demande la branche serveur `chantier/perf-ui` et une compilation sur
     Shrek. **Décision de Bertrand.**
3. **Même mesure sur les autres grilles qui montent tout d'un coup** (onglets
   Genres / Années / Labels, Favoris, Collections, Playlists) : mesurer d'abord
   sur les deux bases, ne traiter que ce qui dépasse ~300 ms.
4. **Cause 4 de l'épique** (bundle de 4,1 Mo, 30 écrans et 11 langues importés en
   statique dans `ShellV2`) : chargement différé. Toujours **à décider par Bertrand**
   (commentaire du 28/09).
5. **Contre-mesure sur une vraie grosse bibliothèque** : rejouer le banc en
   lecture seule sur le .18 (binaire de production) pour confirmer les chiffres
   serveur, avec son accord.
