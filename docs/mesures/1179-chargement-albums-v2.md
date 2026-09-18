# #1179 — Bibliothèque V2 : nommer un chargement incomplet et proposer un nouvel essai

Identité : **JP Robbe / OpenAI Codex / jp-robbe-20260918-suite6-3482**.
Suivi serveur : [#3482](https://github.com/renesenses/tune-server-rust/issues/3482).
Suivi web : [#1179](https://github.com/renesenses/tune-web-client/issues/1179).

## Défaut et correction

Base web relue : `84c3d246679c15dbbfbeb8178865660c4e01c81d`.
La V2 publie les 100 premiers albums puis charge le complément. Un rejet de
la seconde requête laissait cette première page sans message d'erreur.
Le démarrage absorbe les rejets avec Promise.allSettled ; le rechargement
depuis un événement bibliothèque lançait la même opération sans gestionnaire
de rejet.

Le chargeur conserve les albums reçus et publie un état distinct
`libraryAlbumsLoadState` : chargement, repos ou erreur (initiale ou après première page).
`libraryLoading` garde son contrat de première page : la grille reste utilisable
pendant le complément. La vue locale affiche l'échec, avec « Affichage
partiel » seulement quand le complément de cet essai échoue, et un bouton « Réessayer ».
Une erreur initiale ne se présente plus comme une bibliothèque vide, et une
ancienne liste complète conservée n'est pas qualifiée de partielle.
L'essai le plus récent est seul autorisé à remplacer les données et l'état ;
les opérations plus anciennes continuent leur requête mais leurs résultats
sont écartés. Aucune annulation réseau n'est ajoutée.

Les textes existants oxygen.truncated, oxygen.loadError, zone.retry et
v2.lib.loading sont génériques et traduits. Aucun texte propre à Oxygen
ni fournisseur n'apparaît dans le bandeau. Les vues distantes et les onglets
Artistes/Titres ont leurs propres chargeurs et ne reçoivent pas ce bandeau.

## Périmètre

Trois fichiers de production : v2Bootstrap.ts, stores/library.ts et
LibraryV2.svelte. Aucun changement du filtre de recherche, des facettes,
des paramètres de pagination serveur, de l'interface historique ou du scan.
Les deux appels getAllAlbums conservent leurs arguments.

Ce défaut est démontré indépendamment du cas initial de Patatorz.
Il ne prouve ni que son album était local, ni que sa requête complémentaire
avait échoué. Le rapprochement des recherches bibliothèque/globale reste
hors périmètre ; le suivi serveur n'est pas annoncé résolu intégralement.

## Isolation et coordination

- Worktree : /srv/builds/jp-web-3482/worktree.
- Branche : fix/jp-robbe-20260918-3482-library-load-errors.
- Lot : batch/jp-p2-library-load-20260918, même base 84c3d246.
- Verrous globaux serveur3482 et web1179 acquis atomiquement, claims publiés
  avant l'édition : commentaires5728049553 et5728049834.
- PR actives et lots non ancêtres de main contrôlés : aucun ne touchait
  ces trois fichiers. Les autres verrous sont conservés.
- Actualisation root pendant validation : main web63fa902c (PR1173/1176)
  ne modifie aucun des trois fichiers ni le nouveau test ; base conservée.
- Node22.23.2 officiel copié puis SHA vérifié :
  d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307.
  npm-cache et node_modules isolés. Deux workers Vitest.
- Au lancement ciblé : charge4,39/40, RAM232Gio disponible, disque185Gio.
  Avant suite complète : charge19,3/40, CPUpressure0,16%, aucun AOSP actif.
  Aucun processus d'autrui modifié.

## Témoins comportementaux

Le module chargementAlbums1179.test.ts appelle le vrai bootstrapV2, le vrai
loadAlbums et suivreLaBibliotheque, avec les vrais stores Svelte. Les six
premiers cas montent le vrai composant LibraryV2 et lisent le DOM rendu.

Frontières simulées : api.getAllAlbums (succès/rejet/promesse différée),
getZones/getDevices, l'inscription aux événements WebSocket et fetch de
secours. Les chargeurs profils/licence/préférences sans rapport sont
neutralisés. ResizeObserver et dimensions du viewport sont simulés.
Ce n'est pas une requête réelle au serveur ni une validation dans un
navigateur matériel.

Huit cas :
1. Échec première page : alerte visible, aucun message « bibliothèque vide ».
2. Première page100 visible pendant le complément, puis échec signalé.
3. Clic sur Réessayer : réponse101, album complémentaire rendu, alerte retirée.
4. Succès nominal complet et paramètres des deux appels inchangés.
5. Échec déclenché après scan : absorbé et visible, puis désabonnement vérifié.
6. Un échec initial de rafraîchissement garde la liste complète ancienne
   sans l'annoncer partielle.
7. Une ancienne réponse complémentaire ne remplace pas le succès plus récent.
8. Une ancienne erreur ne remplace pas le succès ni son état.

## Commandes et résultats

Toutes les commandes sont exécutées sur Shrek, dans le worktree, avec :
```sh
export PATH=/srv/builds/jp-web-3482/runtime/node-v22.23.2-linux-x64/bin:$PATH
npm ci --cache /srv/builds/jp-web-3482/npm-cache
```

Premier passage et contre-épreuve :
```sh
npx vitest run src/lib/__tests__/chargementAlbums1179.test.ts --maxWorkers=2
```

- Premier passage : 7/7 verts, 11,52s.
- Sauvegarde de production par copie hors worktree, hashes des trois sources
  et du test conservés.
- Contre-épreuve : seul le raccord du catch vers l'état error est retiré.
  Signatures, export du chargeur et stores restent présents ; compilation
  réussie, tests inchangés.
- Résultat : **4 assertions rouges / 3 témoins verts**, 13,90s.
  Messages : état attendu error mais obtenu loading ; bouton de nouvel
  essai attendu mais absent. Les refus initial, complémentaire et WS sont
  effectivement détectés. Aucun rouge de compilation.
- Restauration par cp ; **4 hashes OK**.

Retour au vert avec suites voisines :
```sh
npx vitest run src/lib/__tests__/chargementAlbums1179.test.ts \
  src/lib/__tests__/bibliothequeVivante.test.ts \
  src/lib/__tests__/triAjoutRecent899.test.ts \
  src/lib/__tests__/porteeRepertoireV2_3101.test.ts --maxWorkers=2
```

**17/17 tests verts**, quatre fichiers, 20,58s ; les sept nouveaux sont inclus.

### Suite complète intermédiaire et précision finale

Avant la précision distinguant liste ancienne conservée et première page
partielle : npm test officiel, **476 fichiers / 5 015 tests verts**, 310,34s.
Les six gardes (i18n, Svelte, dialogues natifs, classes CSS, jetons CSS et
textes V2) passent ; Svelte indique aucune nouvelle erreur, pas zéro dette.
Cette suite porte sept nouveaux tests et n'est pas présentée comme une
suite complète sur le dernier diff.

La revue a ensuite demandé de réserver le préfixe partiel à un échec du
complément de l'essai courant. L'état partial-error matérialise cette
distinction, et le huitième témoin vérifie une ancienne liste complète
conservée après l'échec initial d'un rafraîchissement.
Premier passage final : **8/8 verts**, 12,45s.

### Validation sur le diff final

Même commande ciblée à quatre fichiers : **18/18 verts**, dont huit nouveaux,
14,22s. Contre-épreuve finale compilable (commande du module seul) :
**5 assertions rouges / 3 témoins verts**, 14,26s, après retrait du seul
raccord catch vers error/partial-error. Tests inchangés ; restauration cp et
quatre hashes OK avant le retour au vert des 18 tests.

Les six gardes officiels sont verts sur le diff final (Svelte : aucune
nouvelle erreur, dette préexistante conservée). Commandes :
```sh
node scripts/check-i18n.mjs
node scripts/check-svelte.mjs
node scripts/check-native-dialogs.mjs
node scripts/check-classes-css.mjs
node scripts/check-jetons-css.mjs
node scripts/check-francais-v2.mjs
npm run build
git diff --check
```
Build final vert en 1 min 25 s ; avertissements Svelte et taille de chunks
préexistants conservés. Les résultats des gardes finaux sont conservés dans
final-guards.log. Aucun npm run check brut supplémentaire ni nouvelle suite
complète après la précision sémantique.


Les journaux exacts sont conservés dans
/srv/builds/jp-evidence/jp-3482-20260918-suite6/.
Aucun merge, bump, tag ou déploiement.
