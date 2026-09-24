# #1232 — qui ouvre quelle fiche artiste, et ce qui sépare encore les deux

Bertrand / Claude / campagne-20260922-t4-web — 23 septembre 2026.
Base : `main` @ `44ec7a56` (client web de la v0.9.162).

Ce relevé fait les **points 1 et 2** que le tri du 20/09 laissait ouverts :
l'inventaire des entrées (« qui les ouvre »), puis le delta fonctionnel restant
une fois déduites les trois briques déjà communes. Il ne modifie rien. Il finit
par une **proposition de découpe**, à trancher par Bertrand : le chantier entier
ne tient pas dans une PR, et le faire à moitié laisserait deux fiches et demie.

L'arbitrage de référence est celui de FabienM du 18/09, cité dans
renesenses/tune-server-rust#4330 : **une seule page quel que soit l'endroit du
clic, la page de streaming servant de référence.**

## Ce que l'inventaire change par rapport au tri du 20/09

Le tri décrivait « une dizaine de points d'entrée » à réécrire. C'est vrai des
appelants, mais **la bifurcation elle-même est à un seul endroit** :
`src/lib/ouvrirArtisteDepuis.ts:23`. Tout le reste ou bien l'appelle, ou bien
recopie ses deux branches à la main. C'est ce qui rend la découpe ci-dessous
possible — et c'est le fait principal de ce relevé.

## Inventaire A — qui ouvre quoi

Deux chemins, et un seul aiguillage réel :

- **chemin bibliothèque** — `pendingLibraryArtist.set(id)` puis
  `activeView.set('library')`. `LibraryV2.svelte:1587` consomme le magasin,
  force l'onglet `artists` et passe l'identifiant à `ArtistesV2` par la prop
  `ouvrirId` (`LibraryV2.svelte:2169`, `ArtistesV2.svelte:109`). C'est
  **`ArtistesV2`** qui s'ouvre — grille et fiche dans le même composant.
- **chemin service** — `ficheArtisteService.set({service,id,nom})` puis
  `activeView.set('streamingartist')`. `ShellV2.svelte:658` monte
  **`ArtisteServiceV2`**.

| Origine du clic | Passe par | Fiche montée |
|---|---|---|
| Colonne « Artiste » du tableau de pistes — `ListePistesV2.svelte:512` (écran partagé par dix vues : album, bibliothèque, favoris, historique, playlists, recherche, streaming, étiquettes, titres phares, gestionnaire de playlists) | `ouvrirArtisteDepuis` | l'une ou l'autre |
| Vignette d'artiste favori — `FavoritesV2.svelte:661` | `ouvrirArtisteDepuis` | l'une ou l'autre |
| Grille d'artistes d'un service — `StreamingV2.svelte:1404` (pochette) et `:1423` (nom) | `ouvrirArtisteDepuis` | l'une ou l'autre |
| Résultats de recherche — `SearchV2.svelte:776` (`ouvrirArtiste`), appelé en `:1194`, `:1201`, `:1239`, `:836` | recopie les deux branches (`:782` / `:791`) | l'une ou l'autre |
| Nom d'artiste d'une fiche d'album — `AlbumDetailV2.svelte:874` → `allerArtiste` (`:815`) | recopie les deux branches (`:817` / `:827`) | l'une ou l'autre |
| Menu « … » d'une piste, entrée « Aller à l'artiste » — `PisteActions.svelte:378` → `allerArtiste` (`:328`) | recopie les deux branches (`:330` / `:334`) | l'une ou l'autre |
| Même menu, ancienne coquille — `MenuPisteV1.svelte:221` → `allerArtiste` (`:128`) | recopie les deux branches (`:130` / `:132`) | l'une ou l'autre |
| Nom d'artiste et crédits de « Lecture en cours » — `NowPlaying.svelte:1801` et `:1945` → `navigateToArtist` (`:550`) | recopie les deux branches (`:539` / `:567`, `:602`) | l'une ou l'autre |
| Résolution d'un artiste de service par son NOM (relais `gestesNavigationService`, armé en `ShellV2.svelte:468`) — `ShellV2.svelte:426` et `:456` | — | `ArtisteServiceV2`, ou repli sur la recherche |
| « À propos » ▸ artiste similaire — `ArtistesV2.svelte:374` | — | reste dans `ArtistesV2`, ou bascule sur la recherche |

**Le fait à retenir** : aucun de ces chemins ne choisit une fiche. Tous
choisissent d'après la **nature de l'objet cliqué** — un artiste de
bibliothèque va toujours à `ArtistesV2`, un artiste de service toujours à
`ArtisteServiceV2`. L'arbitrage du 18/09 n'est donc pas « mal appliqué » : il
n'est **pas appliqué du tout**, et il ne peut pas l'être tant que la fiche élue
ne sait pas montrer un artiste purement local.

## Inventaire B — le delta fonctionnel restant

Trois briques sont déjà communes (`EnTeteArtiste.svelte`,
`BioEtTitresPhares.svelte`, `DiscographieCommune.svelte`) ; elles ne sont pas
comptées ici. Reste :

### Ce que `ArtistesV2` sait et que la fiche élue ne sait pas — à porter

| bloc | où | remarque |
|---|---|---|
| Édition du nom et de la fiche | `ArtistesV2.svelte:851` (`RenommerModale`), `:867` (`ArtistEditModal`), bouton `:708` | la fiche de service n'a aucun geste d'édition — normal pour un artiste distant, à conditionner à « artiste local » |
| Étiquettes | `:713` (bouton), `:879` (`EtiquettesPanneau`, chargé à la demande) | |
| Enrichissement et biographie distante | `:355` (`enrichir`), `:342` (`chargerMetadonnees`), `:660` (passé à `BioEtTitresPhares` par `actionsBio`) | `ArtisteServiceV2.svelte:399` monte la même brique **sans** `actionsBio` : le raccord existe déjà |
| « À propos » : similaires, membres, instruments | `:742`–`:764` | absent de la fiche élue |
| Signalement (`ReportButton`) | `:718` | |

Environ 150 à 200 lignes de script sur les 1 014 du fichier.

### Ce que la fiche élue sait et que `ArtistesV2` ne sait pas — à garder

- Distinction « échec de chargement des titres phares » / « aucun titre », avec
  bouton « Réessayer » — `ArtisteServiceV2.svelte:48`, `:158`, `:368`.
- Jeton de concurrence dédié à la seconde vague de compléments —
  `ArtisteServiceV2.svelte:186`.

### Ce qui relève de la LISTE, et n'a rien à faire dans une fiche

Grille A–Z et rail alphabétique (`ArtistesV2.svelte:803`–`:846`), chargement de
la liste complète (`:439`), filtres `q` / `provenance` / portée (`:85`–`:125`),
actions de vignette (`:532`, `:589`, `:812`), restauration du défilement
(`:237`), `listResetNonce` (`:185`). **Ce périmètre reste dans `ArtistesV2`** :
la convergence porte sur la fiche, pas sur l'écran-liste.

Déjà alignés à l'identique des deux côtés, donc **pas** un delta : les gestes de
lecture de la discographie locale (`ArtisteServiceV2.svelte:312`) et « Best of »
/ « Radio » (`ArtistesV2.svelte:567`) — commentaires croisés `#1356`.

## Découpe proposée — quatre PR, chacune verte et livrable seule

Ordre imposé par les dépendances : on ne bascule pas le routage vers une fiche
qui ne saurait pas encore afficher un artiste local.

1. **T1 — la fiche élue accepte un artiste LOCAL.** `ArtisteServiceV2` sait déjà
   lire une discographie locale (`:312`) ; lui donner une entrée « artiste de
   bibliothèque » (identifiant local, sans service). Rien n'est encore routé
   vers elle : la PR est invisible pour l'utilisateur, et c'est voulu.
2. **T2 — porter les cinq blocs manquants** (édition, étiquettes,
   enrichissement, « À propos », signalement), conditionnés à « artiste local ».
   À la fin de T2, et pas avant, les deux fiches sont équivalentes.
3. **T3 — faire converger le routage.** D'abord ramener les cinq recopies
   (`SearchV2`, `AlbumDetailV2`, `PisteActions`, `MenuPisteV1`, `NowPlaying`)
   sur `ouvrirArtisteDepuis` ; puis retourner la bifurcation **dans cette seule
   fonction**. C'est le moment où l'arbitrage du 18/09 devient visible.
4. **T4 — ramener `ArtistesV2` à la liste seule** et retirer le code de fiche
   devenu mort.

T1 est prenable tout de suite. T3 est celle qui demande le plus de témoins : un
par origine de clic, sinon une entrée oubliée continuera d'ouvrir l'ancienne
fiche sans que rien ne le signale.

## Ce que ce relevé ne dit pas

- **Il ne tranche pas le sort de la liste d'artistes.** L'arbitrage porte sur la
  fiche ; que devient l'onglet « Artistes » de la Bibliothèque une fois sa fiche
  partie n'est écrit nulle part.
- **Il ne mesure rien dans le navigateur.** Les entrées sont relevées dans le
  code, pas en cliquant les dix origines une à une sur le .18.
- **Voisinage non rejoué** : #1178 a été fermé le 20/09 et `fix/1373-appariement-artiste`
  touche l'appariement. L'inventaire ci-dessus est relu sur `44ec7a56`, qui les
  porte — mais toute branche non fusionnée à cette date lui échappe.
