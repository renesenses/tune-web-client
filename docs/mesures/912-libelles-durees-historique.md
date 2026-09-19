# Web #912 — Libellés des classes de durée de l’historique

JP Robbe / OpenAI Codex / jp-robbe-20260918-1412-p2p3-912

## Portée et constat

Base web : f6297d583c624ada0c2c05457079371dfcac765c.
Code serveur consulté sur Shrek : 627c6e37d23ace6187d11f3fde12fce5f1759f49.
Cette unité change seulement trois valeurs de traduction dans les onze langues.
Aucun calcul, filtre, événement d’écoute ni migration ne change.

L’arbitrage du 01/09 proposait « Écoutées ≥ 30 s » et « Ignorées ».
La lecture du chemin d’écriture ne permet pas de soutenir ces mots :
- history_repo.rs:929–930 classe duration_ms avec >= 30000 et < 30000 ;
- orchestrator/commun.rs:479–516 recopie duration_ms dans ListenRecord ;
- orchestrator/transport.rs, appel record_listen après output_sent, lui passe
  resolved.duration_ms.unwrap_or(0), la durée de la piste ;
- orchestrator/queue.rs:628 passe également np.duration_ms.
Aucune mise à jour de durée effective n’a été trouvée dans HistoryRepo.
Ces points ne prouvent pas l’origine de chaque ancienne ligne en base.

Les termes retenus sont donc « Durées enregistrées dans l’historique »,
« 30 s et plus » et « Moins de 30 s ». Ils ne promettent ni fin de piste
ni abandon ni temps réellement écouté. Une durée inconnue enregistrée à zéro
reste dans la deuxième classe, comme avant.

## Validation sur Shrek

Node 22.23.2, dépendances isolées, deux workers au plus.

Commande ciblée :
```sh
npx vitest run src/lib/__tests__/dashboardDurationLabels912.test.ts --maxWorkers=2
```

11/11 tests verts : montage réel de DashboardView, traductions réelles dans
les onze langues, API simulée (y compris les chargements de Highlights).
Les compteurs 3/1 et largeurs 75 %/25 % sont conservés dans le DOM.

Contre-épreuve : seules les onze locales de production sont remplacées par
celles de HEAD. Le test reste identique et compilable : 11 assertions rouges
sur les anciens intitulés. Restauration par cp, empreintes vérifiées,
puis 11/11 verts avec la même commande.

Gardes officielles : check-i18n, check-svelte, check-native-dialogs,
check-classes-css, check-jetons-css, check-francais-v2.
Build : npm run build.
Pas de suite intégrale supplémentaire pour ces seules valeurs de traduction.

## Limites et reliquats

Ce correctif ne valide pas les chiffres du compte utilisateur et ne mesure
pas une écoute réelle. Les autres observations de #912 restent distinctes :
Streak en dur, périodes des blocs Highlights, axes, filtres et cohérence
des classements. Aucune clôture globale du ticket n’est revendiquée.

Preuves : /srv/builds/jp-evidence/jp-p2p3-20260918-1412/912.
