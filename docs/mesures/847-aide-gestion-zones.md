# Zones : retrouver les commandes de gestion depuis la grille — #847

JP Robbe / OpenAI Codex / jp-robbe-20260918-1412-p2p3-847

Base : `f6297d583c624ada0c2c05457079371dfcac765c`.
Branche : `fix/jp-robbe-20260918-847-ui`.
Lot : `batch/jp-p2p3-ui-20260918`.

## Périmètre

Quand la grille contient des zones, une phrase indique que renommer, fusionner
ou supprimer se fait en vue Liste. Le nom de la vue est interpolé depuis sa clé
existante, dans onze langues. Le bouton Liste existant référence cette aide
avec `aria-describedby`. L'aide disparaît en mode Liste et en l'absence de zones,
sans laisser une référence ARIA vers un élément absent.

Les cartes, leurs actions et la suppression en deux temps restent inchangées.
Cette proposition améliore la découvrabilité dans le cadre de la conception
existante ; elle ne tranche pas le souhait éventuel de déplacer les commandes
destructives vers les cartes. Le ticket reste ouvert pour la revue de Bertrand.

Fichiers : ZonesV2, une clé `v2.zones.listActionsHelp` dans les onze locales,
test privé et présent rapport. Aucun partage de clés avec le lot dashboard #912.
La clé est placée auprès de `viewList`, sans déplacer les autres traductions.

Au contrôle final, la PR #1206 (#1096) touche désormais ZonesV2 : chargeur de
rafraîchissement et état vide juste avant la branche grille. L'aide et ses clés
sont distinctes, sans modification de cette logique commune. Le coordinateur a
vérifié une composition isolée sans conflit sur les douze fichiers communs
(ZonesV2 et onze locales), base f6297d58, autre SHA `8e2af9ca` ; preuve
`compatibility-pr1206.json` dans le dossier d'évidence. Ce contrôle ne fusionne
aucune branche et ne constitue pas une validation runtime combinée. Aucun rebase
ni reprise de ce travail n'est effectué dans cette unité.

## Validation sur Shrek

Unité : `/srv/builds/jp-p2p3-20260918-1412/issue-847`.
Node officiel 22.23.2 / npm 10.9.8 ; runtime du lot en lecture seule, dépendances
et cache npm isolés pour cette unité. Deux workers maximum, une validation à la
fois dans cet agent. Disque contrôlé à 126 Gio avant installation, puis 124 Gio
avant les gardes ; aucun Cargo.

Commandes :

```sh
npx vitest run src/lib/__tests__/zonesListHelp847.test.ts --maxWorkers=2
npx vitest run src/lib/__tests__/zonesListHelp847.test.ts src/lib/__tests__/vueZonesGrille.test.ts src/lib/__tests__/zonesFusion.test.ts --maxWorkers=2
npm test -- src/lib/__tests__/zonesListHelp847.test.ts src/lib/__tests__/vueZonesGrille.test.ts src/lib/__tests__/zonesFusion.test.ts --maxWorkers=2
npm run build
git diff --check
```

Les **cinq nouveaux témoins montent ZonesV2**, les stores et le client HTTP réels,
avec réponses HTTP simulées :

- aide traduite visible et reliée au bouton Liste ; aucune action destructive
  ajoutée dans les cartes et aucun appel de mutation ;
- clic sur le bouton Liste existant, disparition de l'aide, préférence persistée,
  commandes présentes ; premier clic Supprimer sans DELETE, annulation sans
  DELETE, puis DELETE simulé après le second clic de confirmation ;
- préférence Liste déjà enregistrée : pas d'aide ni référence ARIA pendante ;
- grille sans zone : pas d'aide ni référence pendante ;
- retour de Liste vers Grille : aide réapparue, zone courante préservée, aucune
  mutation serveur.

Premier passage : **5/5 verts**, 7,75 s.

Contre-épreuve : seul ZonesV2 est remplacé par le composant de base, traductions
et tests inchangés. Compilation réussie puis **3 assertions rouges / 2 verts**.
Les trois rouges sont `expect(help()?.textContent).toBe(helpText)` : résultat
`undefined`, phrase française complète attendue. Ils prouvent l'absence du
raccord d'aide ; le scénario de suppression s'arrête à cette assertion et ne
constitue pas une contre-épreuve isolée de la confirmation. Liste enregistrée
et absence de zones restent vertes.

Restauration par `cp` ; empreintes de ZonesV2, des locales et du test vérifiées.
**24/24 tests verts dans trois fichiers**, 7,79 s : cinq montages nouveaux et
dix-neuf gardes existantes de grille/fusion (ces dernières lisent aussi le code,
elles ne sont pas présentées comme dix-neuf parcours montés).

Six gardes officielles + trois fichiers ciblés : **réussis**, code 0,
**24/24 verts**, 8,01 s pour Vitest. Svelte sans nouvelle erreur, onze langues
à 100 %, aucun texte visible en dur ni clé orpheline. Revue du coordinateur
sur production et cinq montages : aucun bloquant.
Build : **réussi**, 1 min 25 s, code 0. Avertissements Svelte et de taille de
chunks présents ; aucune revendication de compilation sans avertissement.
`git diff --check` réussi.

## Limites

Pas de recette visuelle dans un navigateur réel ni de lecteur d'écran ; le DOM,
la liaison ARIA, les gestes et les requêtes simulées sont vérifiés. Les onze
traductions passent les gardes du dépôt, sans recette linguistique humaine.
Aucun appareil, compte ou serveur de production n'est sollicité. Le DELETE du
test est entièrement simulé.

Validation ciblée retenue après revue pour cette aide sans changement métier :
la suite de 5 000 tests du dépôt n'est pas rejouée sur cette branche. Elle est
réservée à la CI/au lot ; les résultats complets de la branche #1097 ne sont pas
revendiqués comme ceux de #847.

Preuves : `/srv/builds/jp-evidence/jp-p2p3-20260918-1412/847`.
Aucun merge, bump, tag ou déploiement. Verrou conservé pendant la revue.
