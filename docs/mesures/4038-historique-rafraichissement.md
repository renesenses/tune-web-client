# Historique visible : actualisation des groupes — serveur #4038 / web #990

JP Robbe / OpenAI Codex / jp-robbe-20260918-1304-4038

## Périmètre

Base web `fa28352d5fc974fcc00c997b63b3493a6763337c`, lot
`batch/jp-p2-history-refresh-20260918`. Référence serveur consultée :
`627c6e37d23ace6187d11f3fde12fce5f1759f49`.
Développement et validations uniquement sur Shrek, dans
`/srv/builds/jp-4038-20260918-1304/worktree`.

Le composant chargeait les 100 dernières entrées serveur une seule fois au
montage. Les entrées locales ne portent pas le contexte de lecture nécessaire
aux groupes. Une playlist déjà ouverte pouvait donc conserver une seule piste
alors que la réponse serveur en contenait désormais quatre.

Le composant relit cet historique après `playback.started`,
`playback.track_changed` et `_connected`, en regroupant les événements pendant
100 ms. L'historique est global : le filtre ne dépend pas de la zone sélectionnée.
Les événements de position, niveaux, instantanés et changements génériques de
zone ne déclenchent aucune relecture.

Les événements de lecture ne garantissent pas que l'écoute soit déjà écrite :
`queue.rs` appelle `update_now_playing` avant `record_listen`, et
`transport.rs` annonce le démarrage avant l'envoi à la sortie et l'enregistrement.
Une sortie navigateur peut retarder cette écriture bien au-delà d'une seconde.
Un rattrapage toutes les cinq secondes fonctionne donc uniquement pendant que
l'écran est monté et le document visible. Cela représente au plus 12 requêtes
périodiques par minute et par écran visible, auxquelles s'ajoutent les événements
regroupés et le retour au premier plan.

Une seule requête reste en vol. Une invalidation reçue pendant son attente
provoque une relecture ensuite. Le dernier résultat réussi est conservé en cas
d'erreur. Une génération invalide les anciennes réponses avant le DELETE de
vidage ; une réponse antérieure ne peut pas rétablir les lignes supprimées.
Le démontage retire l'abonnement et les minuteurs et interdit la publication
d'un résultat tardif. Les clés et l'état déplié des groupes sont conservés.

Aucune modification du seuil d'écoute, du stockage serveur, de la fusion des
historiques ni de `v2Live.ts`.

## Validation

Node officiel 22.23.2 / npm 10.9.8, archive Linux x64 locale à cette unité,
SHA-256 vérifié avec le fichier officiel SHASUMS256.txt :
`d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307`. Cache npm et dépendances
isolés. Deux workers Vitest. Le disque a été vérifié à 121 Gio libres avant
la suite complète ; aucun graphe Rust n'a été compilé.

Commande ciblée :

```sh
npx vitest run src/lib/__tests__/historiqueRefresh4038.test.ts --maxWorkers=2
```

Neuf tests montent le vrai composant, les vrais stores, le client API et
`tuneWS`. HTTP, WebSocket, horloge et observateurs de géométrie sont simulés.
Les réponses HTTP ont la forme de l'API, avec quatre entrées Qobuz partageant
un contexte playlist, dans une autre zone que celle sélectionnée.

- Groupe ouvert : une à quatre pistes sans perdre l'état déplié.
- Écriture visible seulement après quinze secondes, sans nouvel événement.
- Rafale d'événements et caché/visible pendant un GET : une requête en vol,
  puis une seule relecture.
- Événements fréquents ignorés ; reconnexion du vrai client WebSocket prise
  en compte.
- Aucun nouveau GET pendant que le document est caché ; retour visible immédiat.
- HTTP 503 : dernier instantané conservé, puis récupération au passage suivant.
- DELETE réussi alors qu'un ancien GET est retenu : aucune résurrection.
- DELETE refusé : contenu conservé.
- Démontage pendant GET et délai d'événement : aucune nouvelle requête ni DOM.

Premier passage : 8 verts / 1 rouge de banc. L'attente du test de requêtes
successives ne laissait pas finir les deux `Response.json` ; l'avancement de
l'horloge de zéro milliseconde complète maintenant cette attente. Aucun changement
production pour ce résultat. Passage corrigé : **9/9 verts**, 6,89 s.

Contre-épreuve : seul le composant est remplacé par celui de la base, tests
strictement inchangés. Compilation réussie, puis **7 assertions rouges / 2 verts**.
Six rouges constatent l'absence de fraîcheur/relecture. Le témoin DELETE échoue
avant la course, car la base n'a aucun GET périodique en vol : il ne démontre pas
isolément la garde de génération. Les témoins de refus DELETE et démontage restent
verts. Restauration par `cp`, SHA-256 de production et tests vérifiés, puis
**9/9 verts**, 7,46 s.

Suite officielle `npm test -- --maxWorkers=2` : **six gardes réussies**, dont
« aucune nouvelle erreur » Svelte, puis **484 fichiers / 5 104 tests verts**,
233,43 s pour Vitest. La connexion SSH a expiré pendant la suite ; le processus
distant a continué et le journal contient son résumé complet. Aucune suite
concurrente ou relance n'a été démarrée dans ce target.

Build `npm run build` : **réussi**, code de sortie 0 écrit côté Shrek,
50,20 s. Des avertissements Svelte et de taille des chunks sont présents ; ils
ne sont pas présentés comme une validation sans avertissement.
`git diff --check` : réussi.

Revue indépendante de production, tests et journaux par une autre session
OpenAI Codex : aucun bloquant identifié. Les scénarios de concurrence sont
exercés sur le composant réel ; les limites de la contre-épreuve restent celles
explicitées ci-dessus.

## Limites

Cette preuve porte sur le composant monté et les contrats simulés, sans navigateur
réel, compte de service ou appareil. Elle ne démontre pas la cause de toutes les
écoutes manquantes du signalement historique, ni une réparation des données déjà
absentes du serveur. La limite API de 100 entrées demeure.

Le client API ne propose ici ni annulation ni délai maximal : une requête réseau
qui ne se termine pas peut bloquer les relectures suivantes. Le démontage empêche
sa publication, pas son transport. Le mécanisme partagé de notifications conserve
sa politique : erreurs réseau espacées de 30 secondes, mais une réponse HTTP 5xx
peut produire une notification à chaque relecture. Aucune modification de l'API
commune n'est incluse.

Les journaux, sources de contre-épreuve et empreintes sont conservés dans
`/srv/builds/jp-evidence/jp-4038-20260918-1304`. Aucun merge, tag, bump de version
ou déploiement. Les verrous restent pendant la revue.
