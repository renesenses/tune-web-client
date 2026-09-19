# Couleur par étape dans la barre de lecture — #1097

JP Robbe / OpenAI Codex / jp-robbe-20260918-1412-p2p3-1097

Base : `f6297d583c624ada0c2c05457079371dfcac765c`.
Branche : `fix/jp-robbe-20260918-1097-ui`.
Lot : `batch/jp-p2p3-ui-20260918`.

## Correctif

Le panneau du chemin du signal de TransportBar utilisait le verdict global pour
l'icône, le trait et le point de chaque étape. Une source intacte devenait donc
orange si un autre maillon était altéré ; inversement, une étape explicitement
altérée pouvait devenir verte avec un verdict global vrai.

Le panneau utilise maintenant `step.bit_perfect ?? verdict`, comme celui de
NowPlaying. Une étape sans ce drapeau conserve le repli des anciens serveurs.
L'en-tête lossless, le voyant global de la barre et le bouton PURE ne changent pas.

La PR #1199 voisine modifiait le transfert et son CSS, sans recouvrir le panneau
ni les imports. Elle est intégrée à la base de cette unité. Aucun code de
transfert n'est modifié ici.

## Validation sur Shrek

Unité isolée : `/srv/builds/jp-p2p3-20260918-1412/issue-1097`.
Node officiel 22.23.2 / npm 10.9.8, runtime commun en lecture seule vérifié
SHA-256 ; dépendances et cache npm propres à cette unité. Deux workers maximum.
Disque contrôlé à 133 puis 132 Gio libres ; aucun build Rust.

Commandes :

```sh
npx vitest run src/lib/__tests__/signalPath1097.test.ts --maxWorkers=2
npx vitest run src/lib/__tests__/signalPath1097.test.ts src/lib/__tests__/transfertZoneBarreLecture3630.test.ts --maxWorkers=2
npm test -- --maxWorkers=2
npm run build
git diff --check
```

Le banc monte le vrai TransportBar, ses stores et le client HTTP, puis clique
sur le voyant pour ouvrir le panneau. HTTP est simulé ; aucune source audio,
compte ou matériel réel. Les assertions portent sur les trois éléments DOM
colorés, le voyant global, le verdict lossless de l'en-tête et la mise à jour
pendant que le panneau reste ouvert.

Premier passage : cinq tests verts. Deux témoins entièrement ancien serveur
ont ensuite été ajoutés, global faux et vrai avec tous les drapeaux absents.

Contre-épreuve : seul TransportBar est remplacé par la version de base, les sept
tests restent inchangés. Compilation réussie puis **cinq assertions rouges / deux
verts** ; les deux témoins ancien serveur restent verts. Les cas de données
mixtes échouent sur la première couleur divergente, sans prétendre isoler chaque
classe par une contre-épreuve séparée.

Restauration par `cp`, empreintes SHA-256 de production et test vérifiées :
**sept nouveaux tests et sept tests de transfert verts (14/14)**, 7,99 s.

Suite officielle : **six gardes réussies**, notamment Svelte sans nouvelle
erreur, puis **485 fichiers / 5 114 tests verts**, 253,67 s, code 0.
Build : **réussi**, 56,78 s, code 0. Avertissements Svelte et de taille des chunks
présents, sans revendication d'une compilation sans avertissement.
`git diff --check` réussi. Deux relectures indépendantes de la production et des
tests n'ont relevé aucun bloquant.

Pendant la validation, main avance à `91ede920` (PR #1202) ; ses changements
ListePistesV2/helper/test ne recouvrent pas ceux de cette unité. Base conservée.

## Limites et livraison

Preuve de rendu DOM avec classes CSS, sans comparaison de pixels dans un
navigateur réel ni essai audio. La conformité des drapeaux envoyés par le
serveur et la cause exacte de toutes les captures terrain ne sont pas établies
par ces tests. Aucune modification du contrat ni de la politique PURE.

Journaux et sources de contre-épreuve conservés dans
`/srv/builds/jp-evidence/jp-p2p3-20260918-1412/1097`.
Aucun merge, version, tag ou déploiement. Verrou conservé pendant la revue.
