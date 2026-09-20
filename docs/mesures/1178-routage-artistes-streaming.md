# Artistes de Streaming : accès à la fiche existante — #1178

JP Robbe / OpenAI Codex / jp-robbe-20260918-suite6-3864 — 18 septembre 2026.
Référence de chantier : renesenses/tune-server-rust#3864.

## Défaut retenu après inventaire

Le chantier historique demandait des fiches qui existent désormais. Le chemin
album → artiste est corrigé par la PR #1055 (`6b0e978f`, #956 fermé).
L'écran Favoris → artistes est corrigé par la PR #1073 (`e89cee9e`, ancêtre de
main) ; #1063 restait ouvert, un commentaire de rapprochement et une assignation
à Bertrand ont été ajoutés, sans fermeture ni nouvelle affirmation terrain.

Le reliquat reproduit ici est distinct : dans **StreamingV2**, le snippet
`artiste` rend les résultats de recherche et les artistes favoris du compte.
Le portrait ne recevait pas `onOuvrir`, le nom était un span sans geste.
L'identité distante était déjà disponible et la fiche `ArtisteServiceV2` déjà
montée par ShellV2. Aucun nouvel écran n'est nécessaire.

## Correction

Portrait et nom ouvrent cette fiche, avec `vueDeRetour = streaming`. La cible
utilise `source_id ?? id`, et `source ?? service actif`, conformément aux objets
déjà affichés et à leur identité de favori. La source explicite et source_id
priment ; un source_id vide n'est pas remplacé arbitrairement par id.

Sans service non vide ou identifiant exploitable (texte non blanc ou nombre
fini), le nom reste lisible mais aucun bouton d'ouverture n'est fabriqué. Un
identifiant numérique 0 devient la chaîne `0` ; il n'est pas perdu par un test
de vérité. Aucune modification des identifiants textuels, fusion de sources,
lecture immédiate ou nouveau parcours Bandcamp n'est introduite.

## Coordination et base

- Base : `84c3d246679c15dbbfbeb8178865660c4e01c81d`.
- Main actualisé pendant validation : `63fa902cdb409c11fb7ee521f65c5b4e44a6b835`.
  Diff depuis la base contrôlé : aucun de nos fichiers modifié ; base conservée.
- Branche : `fix/jp-robbe-20260918-3864-streaming-artistes`.
- Lot distant : `batch/jp-p1-web-routing-20260918`, même base.
- Worktree : `/srv/builds/jp-web-3864/worktree`, miroir/runtime/cache dédiés
  sous `/srv/builds/jp-web-3864`, hors espaces de Bertrand.
- Verrous atomiques acquis : serveur `verrou:issue-3864`, web
  `verrou:issue-1178`, attachés avec `en-cours`, claims avant édition. Les deux
  restent réservés pendant la revue.
- **Chevauchement de fichier avec PR #1077** : celle-ci modifie StreamingV2
  pour les imports/achats Bandcamp, collection et CSS. Aucun de ses hunks ne
  touche le snippet artiste ou ce routage. Son contenu et les refs non
  intégrées ont été contrôlés ; aucun équivalent de ce correctif trouvé.
- AGENTS web et RELEASE-OPERATIONS serveur lus. La doctrine canonique distante
  référencée par AGENTS a répondu 404 (public et API GitHub autorisée) ; la copie
  locale ancienne n'a pas servi de règle de release. L'instruction explicite
  utilisateur impose les lots batch ; aucune RC publiée ou main modifiée.

## Validation exclusivement sur Shrek

Node officiel v22.23.2, majeure 22 comme la CI, installé seulement dans notre
unité. Archive `node-v22.23.2-linux-x64.tar.xz` vérifiée par le manifeste officiel
SHASUMS256 : `d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307`.
Npm ci utilise le lockfile inchangé, son cache reste propre à l'unité. Avant
validation : charge 1,95/40 CPU, 238 Gio disponibles, 187 Gio disque, pression
CPU/mémoire nulle. Vitest limité à deux workers.

Le nouveau fichier de tests monte **le vrai ShellV2**, StreamingV2 et la vraie
fiche ; seuls fetch et WebSocket sont simulés. Les routes API réelles sont
exercées et leur service/identifiant encodé vérifiés.

- Recherche, portrait Qobuz avec `id`.
- Recherche, nom Tidal avec `source_id` prioritaire, malgré Qobuz actif.
- Favoris du compte, portrait et identifiant numérique 0, service actif repris.
- Favoris du compte, nom Tidal avec identifiant opaque contenant `:` et `/`.
- Six identités incomplètes (absent, vide, blanc, objet, service vide/blanc) :
  texte visible, pas de bouton ni requête de fiche.

Chaque cas positif clique son bouton, constate la fiche chargée via HTTP,
les routes artiste/albums/titres phares et le service rendu, puis clique Retour
et constate Streaming ainsi que l'effacement de la cible et du dépôt de retour.

```sh
npm ci --cache /srv/builds/jp-web-3864/npm-cache --no-audit --no-fund
./node_modules/.bin/vitest run src/lib/__tests__/streamingArtistes1178.test.ts --maxWorkers=2
npm test -- --maxWorkers=2
npm run build
git diff --check
```

Premier passage : **5/5 verts**. Contre-épreuve : fichier de production
StreamingV2 remis à la base, tests inchangés. Transformation réussie,
**4 assertions rouges sur les boutons absents / 1 témoin négatif vert**.
Les échecs surviennent avant les assertions de fiche/retour ; il ne s'agit pas
d'une contre-épreuve indépendante de ces deux étapes. Restauration par `cp`,
empreintes SHA-256 du composant et des tests identiques.

`npm run build` : vert en 1 min 10 s, avec avertissements Svelte et taille
de chunks. Garde-fous npm test : i18n (11 langues), socle Svelte (aucune
nouvelle erreur), dialogues natifs, classes, jetons CSS et français : verts.
Aucun socle, seuil, workflow, version ou lockfile modifié. Après restauration,
`npm test -- --maxWorkers=2` : **476 fichiers / 5 013 tests verts**, étape
Vitest 296,76 s, commande complète code 0.

Après cette suite complète, la revue a relevé que le nouveau bouton du nom
devait hériter explicitement de la couleur et de l’alignement du texte. Une
retouche CSS seule ajoute `color:inherit`, `text-align:inherit` et `width:100%`
pour conserver la présentation du span de bloc précédent. Aucun comportement
de routage changé. Validation finale après cette retouche : **5/5 tests DOM
verts**, `npm run build` vert (1 min 22 s), `git diff --check` vert. La suite
complète et les garde-fous n’ont pas été relancés après cette seule retouche
CSS ; leurs résultats ci-dessus portent sur l’état immédiatement précédent.
Preuves : `/srv/builds/jp-evidence/jp-3864-20260918-suite6`.

## Limites

Aucun compte Qobuz/Tidal, requête au service réel ou validation terrain du
signalement ancien. Les frontières réseau sont simulées ; composants, stores,
routeur et fonctions API sont réels. Le retour vise Streaming, sans promettre
la restauration du texte de recherche ou de son sous-onglet, comportement non
persisté de l'écran existant. Les erreurs de fournisseur, les autres branches
du chantier #3864 et la fusion multisource restent hors correction. Aucun
bump, merge, tag ou déploiement.
