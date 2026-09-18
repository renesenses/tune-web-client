# Arrêt du média navigateur sous ShellV2 — web #1171 / serveur #4090

JP Robbe / OpenAI Codex / jp-robbe-20260918-suite5-4090 — 18 septembre 2026.

## Défaut et correction

ShellV2 monte `demarrerTransportV2`, tandis que le gestionnaire historique
`App.svelte` n'est pas monté. Le message `playback.stopped` rafraîchissait les
zones et la file sans arrêter l'élément audio du navigateur. Le serveur
`5bef77710657f26a28abe89358a4bba8e40c447c` émet cet événement dans `stop` et
`stop_and_clear` ; son relais WebSocket ajoute l'identifiant dans `data.zone_id`.

Le transport V2 transmet maintenant cet arrêt au lecteur. L'identifiant est
comparé au propriétaire de la **source chargée**, indépendant de la zone
sélectionnée : si A joue et B est affichée, arrêter B laisse A intacte, arrêter
A libère son audio. L'arrêt vide la source, réinitialise l'élément, éteint
`browserAudioPlaying` et arrête son minuteur sans attendre de relecture HTTP.

Le propriétaire est fixé seulement lors du chargement effectif. Une URL
identique sans rechargement conserve son propriétaire ; un chargement forcé
ou une nouvelle URL reçoit celui de l'appelant. Une source chargée sans
identifiant connu perd l'ancien propriétaire : on ne devine pas à partir de
l'écran. Stop et destruction effacent ce propriétaire.

Les raccords de lecture passent l'identifiant de la zone réellement retournée
par le serveur. RadiosV2 transmet `zid`, déjà capturé avant sa requête. La
reprise et l'avancement de piste transmettent également cette provenance sans
changer leur politique. `queue.cleared` seul ne vaut pas un arrêt.

## Base, antériorité et coordination

- Base et lot : `22fa6080cd16fed9b81e2437b65909618e6e6672`,
  `batch/jp-p2-browser-stop-20260918`.
- Branche : `fix/jp-robbe-20260918-4090-browser-stop`.
- Worktree : `/srv/builds/jp-web-4090/worktree` ; miroir et outils locaux à cette
  unité sous `/srv/builds/jp-web-4090`, hors espaces de Bertrand.
- Le web main est passé à `30264a18` pendant la validation. Contrôle root :
  aucun des cinq fichiers de code et tests modifié entre cette tête et la base.
- Lecture d'AGENTS et de la doctrine/runbook communs. La dernière RC web
  `rc/v0.9.154` (`646162e4ef36c29d07a088e654ab899d62b01b88`) est déjà ancêtre
  de main et publiée. Le lot indépendant suit l'instruction utilisateur
  explicite `batch/*`, sans écrire dans une RC publiée ni promouvoir une release.
- PR ouvertes et refs non intégrées contrôlées sur les quatre fichiers de
  production ; aucun correctif équivalent ou changement concurrent trouvé.
  L'ancien raccord resume non intégré a déjà son équivalent dans main.
- Verrous atomiques serveur `verrou:issue-4090` et web `verrou:issue-1171`,
  labels `en-cours`, claims publiés avant édition, périmètre étendu annoncé.
  Les verrous restent réservés pendant la revue.

## Validation sur Shrek

Node officiel v22.23.2, conformément à la majeure 22 de la CI. Archive
`node-v22.23.2-linux-x64.tar.xz` contrôlée avec son `SHASUMS256.txt` officiel :
`d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307`.
Installation locale à l'unité, aucune installation globale ; `npm ci` a installé
225 paquets depuis le lockfile inchangé. Deux workers Vitest maximum.

Les huit nouveaux témoins traversent le vrai `tuneWS`, le vrai transport V2 et
les vrais stores/lecteur. Ils simulent les frontières HTTP, WebSocket et Audio :

1. arrêt immédiat, source libérée, état et minuteur stoppés malgré HTTP refusé ;
2. A propriétaire/B sélectionnée : B, DLNA et événement sans zone sans effet,
   puis arrêt A effectif ;
3. `queue.cleared` sans effet et désabonnement effectif du transport ;
4. aucune attribution devinée pour source inconnue, après stop ou destruction ;
5. URL identique sans reload et rechargement forcé ;
6. vrai `playAndSync` avec sélection B pendant la réponse de A ;
7. vrai `resumeAndSync` : source rechargée rattachée à la zone retournée ;
8. montage réel de RadiosV2, clic du bouton, réponse différée et sélection B :
   seule la zone A capturée avant la requête possède le flux.

Commandes (PATH inclut le runtime Node local), lancées depuis le worktree :

```sh
npm ci --cache /srv/builds/jp-web-4090/npm-cache --no-audit --no-fund
./node_modules/.bin/vitest run src/lib/__tests__/browserStopV2_1171.test.ts --maxWorkers=2
./node_modules/.bin/vitest run src/lib/__tests__/browserStopV2_1171.test.ts src/lib/stores/browserAudio.test.ts src/lib/__tests__/v2TransportVivant.test.ts src/lib/__tests__/v2EchecsLectureVisibles.test.ts --maxWorkers=2
npm run check
npm test -- --maxWorkers=2
npm run build
git diff --check
```

Premier passage : 8/8 verts. Contre-épreuve : seul l'appel
`browserStopForZone(event.data.zone_id)` retiré du gestionnaire de production,
tests inchangés. Transformation réussie, **6 assertions rouges / 2 témoins
négatifs verts**, absence d'arrêt observée. Restauration par `cp`, cinq
empreintes SHA-256 identiques (quatre sources et test). Après restauration :
**55/55 tests verts**, quatre fichiers, dont la suite existante montant ShellV2.
Cela ne constitue pas une contre-épreuve isolée de chaque propriété du helper.

`npm run build` : vert, 1 min 14 s, avec avertissements Svelte et taille de
chunks. `git diff --check` : vert. `npm run check` brut : rouge, 45 erreurs et
569 avertissements dans 87 fichiers. Le garde-fou officiel exécuté par
`npm test` confirme **aucune nouvelle erreur** face au socle versionné
(fichier + message) ; aucun diagnostic dans le nouveau test, v2Live,
browserAudio ou zones.ts. Aucun socle, lockfile ou seuil de CI modifié.
Guards i18n, dialogues natifs, classes, jetons CSS et français : verts.
`npm test -- --maxWorkers=2` : **471 fichiers, 4 993 tests verts** ; étape
Vitest 274,03 s. La commande complète (guards inclus) sort avec le code 0.

Preuves hors worktree : `/srv/builds/jp-evidence/jp-4090-20260918-suite5`.
Relecture indépendante de production, tests et raccords : sans défaut bloquant.

## Limites

Aucun navigateur réel, décodage réseau réel ou sortie audio physique testé.
Les primitives Audio, HTTP et WebSocket sont simulées ; l'intégration des
modules et le montage RadiosV2 sont réels. La suite voisine monte ShellV2,
mais le nouveau témoin d'arrêt branche directement son transport partagé.

Aucune correction de pause, reprise, seek ou de sélection tardive d'une radio.
Le contrôle de type de zone après la réponse radio reste préexistant : un
changement A navigateur vers B DLNA peut empêcher le lancement. L'identité
capturée évite d'attribuer son flux à B ; ce correctif n'élargit pas le démarrage.
Les appelants historiques sans identifiant restent supportés et produisent un
propriétaire inconnu s'ils chargent une nouvelle source. Aucun secret, compte
de streaming, appareil tiers, bump, merge, tag ou déploiement.
