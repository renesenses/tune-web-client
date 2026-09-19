# #914 — titres tronqués dans PodcastsView

JP Robbe / OpenAI Codex / jp-robbe-20260918-1412-p2p3-914

## Périmètre et comportement

Base f6297d583c624ada0c2c05457079371dfcac765c ; branche
fix/jp-robbe-20260918-914-ui ; lot batch/jp-p2p3-ui-20260918.

PodcastsView affichait des titres et noms tronqués sans permettre de lire leur
texte complet. Les 17 placements des sept classes episode-title, card-title,
card-artist, new-ep-title, new-ep-podcast, trending-title et trending-artist
utilisent désormais l’action bulleTexte déjà présente dans le client.

La mesure de débordement existante pose le titre natif seulement si le texte
est coupé. Au clavier, elle regroupe les textes de l’ancêtre interactif dans
une bulle ; aucun arrêt de tabulation supplémentaire n’est ajouté. Les mises
à jour, redimensionnements et destructions restent gérés par cette action.
Les descriptions volontairement abrégées et le comportement de lecture ne
changent pas. Aucun fichier partagé de l’action n’est modifié.

Cette tranche couvre l’écran PodcastsView, pas l’intégralité du ticket #914,
qui doit rester ouvert pour les autres écrans éventuels.

## Preuves locales sur Shrek

Unité : /srv/builds/jp-p2p3-20260918-1412/issue-914.
Node officiel 22.23.2 ; dépendances et cache npm propres à l’unité.

Commande ciblée :

    npx vitest run src/lib/__tests__/podcastsInfobulles914.test.ts --maxWorkers=2

Les cinq tests montent le vrai composant Svelte, son client HTTP et l’action
réelle. Seul fetch reçoit des réponses synthétiques, sans accès à un service.
Ils vérifient : titres complets avec coupe verticale et horizontale ; textes
courts sans infobulle ni tabindex ; abonnements, nouveaux épisodes et ouverture
d’une fiche par Enter ; redimensionnement et changement de pays ; disparition
de la bulle et déconnexion des observateurs au démontage.

- Ciblés corrigés : 5/5 verts.
- Contre-épreuve : remplacement du seul composant par la base, tests inchangés.
  Compilation réussie, puis 4 échecs d’assertion (titre ou bulle absent) et le
  témoin des textes courts vert. Il ne s’agit pas d’une preuve isolée de chaque
  mécanisme interne de l’action, restée inchangée.
- Restauration par cp et contrôle SHA-256 du composant et des tests : OK.
- Ciblés après restauration : 5/5 verts.
- Suite officielle : npm test -- --maxWorkers=2, six gardes vertes, puis
  485 fichiers / 5 112 tests verts en 258,89 s.
- Build : npm run build, réussi en 1 min 22 s. Les avertissements Svelte et
  de taille des chunks existants restent présents ; aucun nouvel échec.
- git diff --check : réussi.

Preuves conservées sous
/srv/builds/jp-evidence/jp-p2p3-20260918-1412/914 : targeted-green.log,
counterproof.log, before-counterproof.sha256, restoration.log,
restored-green.log, full-test.log et build.log.

## Limites

jsdom ne calcule pas la mise en page : les dimensions sont imposées, séparément
pour l’ellipse horizontale et la coupe sur deux lignes. Cela prouve le raccord
aux mesures et le comportement DOM/clavier, pas un rendu visuel dans un vrai
navigateur. Les chemins Découvrir (y compris carte Radio France de repli),
Abonnements et fiche sont exercés ; les variantes recherche/Radio France avec
clé partagent les placements revus mais ne sont pas parcourues par ces tests.
La CI distante et la revue restent distinctes des validations locales.
