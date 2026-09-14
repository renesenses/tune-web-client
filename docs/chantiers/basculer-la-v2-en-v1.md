# Basculer la v2 en v1, et retirer l'interface actuelle

> ## ⚠️ ÉTAT AU 14/09/2026 — LE PLAN CI-DESSOUS A ÉTÉ EXÉCUTÉ EN PARTIE
>
> Ce document est la reconnaissance d'origine. Il est conservé pour son
> raisonnement, mais **cinq de ses affirmations se sont révélées fausses** à
> l'exécution. Les voici, avant de le lire.
>
> ### Les phases 1 et 3 sont FAITES
>
> | Phase | État | PR |
> |---|---|---|
> | 1 — ranger les emprunts | ✅ **faite** | #1023, #1024, #1025, #1026, #1028 |
> | 2 — porte d'entrée | ✅ **faite** | #1022 |
> | 3 — écrans hérités | ✅ **faite** | #1027 |
> | 4 — inverser le défaut | à faire — **une ligne** | |
> | 5 — retirer l'interface actuelle | après une release | |
>
> L'arborescence est désormais : **51** composants en `v2/`, **39** en
> `partages/` (ce que les deux interfaces utilisent), **8** en
> `v2-heritage/` (les écrans hérités, voir leur `LISEZ-MOI.md`), et **70** à la
> racine — l'interface actuelle, isolée. `racineIsolee.test.ts` garde qu'aucun
> sous-dossier n'y puise plus.
>
> ### Ce que ce document dit de FAUX
>
> **1. « 24 emprunts » — il y en avait 26, puis 39 au total.** Le décompte ne
> voyait que les `from '…'` et ratait les `import('…')` DYNAMIQUES
> (`TrackTagsDrawer`, `AddToPlaylistModal`). Il ignorait aussi les satellites de
> satellites, et — surtout — les emprunts depuis `partages/` et `v2-heritage/`,
> deux dossiers créés en cours de route. Onze composants de plus, découverts
> APRÈS avoir annoncé la phase close.
>
> **2. « Le point dur : la v2 n'a pas de porte d'entrée » — le défaut était
> ailleurs, et pire.** `LoginView` était inatteignable dans les DEUX interfaces :
> un 401 appelait `clearToken()`, qui posait `#login`, que PERSONNE ne lisait.
> L'application devenait muette. Ce n'était donc pas un obstacle à la bascule
> mais un défaut existant — corrigé par #1022 et l'issue #1021.
>
> Et **la seconde porte cachait le même défaut**, découvert le 14/09 en
> portant l'assistant (#1033) : `OnboardingView` — 1 117 lignes — pend à
> `$activeView === 'onboarding'`, valeur que personne ne pose. Elle n'a jamais
> été atteignable non plus. L'assistant réellement monté était
> `OnboardingWizard`, ailleurs dans `App.svelte`. Deux portes d'entrée, deux
> écrans morts, et le même piège : ce document listait des fichiers qui
> EXISTENT, jamais des chemins qu'on PARCOURT.
>
> **3. « Phase 3 : combler les deux trous » — la phase 3 est devenue autre
> chose.** Les alarmes ont bien été portées (#1020) ; les concerts sont
> reportés sur décision de Bertrand. Mais le vrai travail de la phase 3 a été
> de sortir CINQ ÉCRANS de l'interface actuelle — ce que ce document ne
> prévoyait pas du tout.
>
> **4. « Les déplacer suffit » — faux.** Entrer dans `v2/` signifie hériter de
> ses DIX contrôleurs de conformité. Mesuré : 17 gardes rouges. D'où
> `v2-heritage/`, un dossier qui doit se vider.
>
> **5. Le coût n'est pas le nombre de fichiers déplacés.** C'est le nombre de
> GARDES qui citent le composant, et les DIX façons dont ce dépôt désigne un
> chemin (import statique, dynamique, depuis la racine, nom séparé du dossier,
> nom nu, entre briques rangées, regex à barre nue, regex à barre échappée,
> chaîne dans un `.includes()`, et l'ORDRE déplacer/réécrire). `AlbumArt` avait
> 23 imports et un seul test : vert du premier coup. `NowPlaying` en avait un
> et quarante tests : quatre relances.
>
> ### La leçon
>
> Un inventaire mesure un PÉRIMÈTRE ; une garde garde une PROPRIÉTÉ. Trois
> inventaires successifs se sont trompés ici. `racineIsolee.test.ts` ne compte
> rien : il exige zéro.


Reconnaissance du 14/09/2026, sur `tune-web-client` `origin/main` (`d58ae8cd`).
Aucun code modifié. Tous les chiffres ci-dessous sont mesurés, pas estimés.

---

## Ce que la mesure dit, en une page

| | Interface actuelle | v2 |
|---|---|---|
| Vues montées | **39** | **31** |
| Composants `.svelte` | **116** | **50** |
| Point d'entrée | `App.svelte` | `ShellV2.svelte` |

Trois faits commandent tout le chantier.

**1. La bascule elle-même est propre et tient en une ligne.** `main.ts` monte
`ShellV2` ou `App` selon `futureInterface()`, et toute la règle vit dans
`lib/interfaceChoisie.ts` : forçage par l'URL, choix mémorisé par appareil,
défaut. Inverser le défaut est trivial.

**2. La v2 emprunte 24 composants à l'interface actuelle**, dont `AlbumArt`
**23 fois**. Supprimer `src/components/*.svelte` casse la v2 à l'instant. Ces
24 doivent déménager AVANT toute suppression.

**3. Deux fonctions ne sont pas couvertes** : les alarmes et les concerts. Et
une troisième, plus gênante, n'a pas de place du tout dans la v2 — voir le
point dur.

---

## Le point dur : la v2 n'a pas de porte d'entrée

`ShellV2` ne contient **aucune** mention de `login`, `onboarding` ou `auth`
(mesuré : 0 occurrence). L'interface actuelle, elle, monte `LoginView` et
`OnboardingView` comme deux vues ordinaires de sa cascade.

Autrement dit : **aujourd'hui, un utilisateur non connecté ou une installation
neuve passe forcément par l'interface actuelle.** La v2 n'a jamais eu à s'en
occuper, parce qu'on n'y arrive qu'une fois déjà dedans.

C'est le seul obstacle qui n'est pas un déménagement mais une construction. Il
doit être réglé avant même d'envisager la suppression, sinon une installation
neuve n'a plus d'écran d'accueil du tout.

---

## Inventaire : ce que la v2 couvre vraiment

⚠️ **Compter par nom de composant donne un résultat FAUX.** La v2 regroupe là
où l'interface actuelle sépare : treize vues semblent orphelines, six sont en
réalité absorbées ailleurs. Le tableau ci-dessous est vérifié par fonction.

### Couvert, mais sous un autre nom

| Fonction | Vue actuelle | Où elle vit en v2 |
|---|---|---|
| Bandcamp | `BandcampView` | `StreamingV2` (77 occurrences) |
| Playlists intelligentes | `SmartPlaylistsView` | onglet « smart » de `PlaylistsV2` |
| Favoris radio | `RadioFavoritesView` | `RadiosV2` |
| Tableau de bord | `DashboardView` | `HomeV2` |
| Jetons de service | `ServiceTokensView` | section des réglages |
| Hors-ligne | `OfflineView` | présent en v2 |

Aucun travail à prévoir : la fonction est là, l'écran d'origine peut tomber.

### Non couvert

| Fonction | Vue actuelle | Poids |
|---|---|---|
| **Alarmes** | `AlarmsView` | 399 lignes |
| **Concerts** | `ConcertsView` | 269 lignes |
| **Connexion** | `LoginView` | voir le point dur |
| **Première installation** | `OnboardingView` | voir le point dur |

⚠️ **Les deux dernières lignes sont périmées, et l'une des deux nommait le
mauvais fichier.**

| Fonction | Où elle en est |
|---|---|
| Connexion | portée — `SessionExpireeOverlay` monte `LoginView` des deux côtés (#1021, #1022) |
| Première installation | portée — `AssistantPremiereInstallation` monte `OnboardingWizard` des deux côtés (#1033) |

`OnboardingView` n'était pas l'assistant : elle n'a jamais été atteignable.
Voir la préface, point 2.

### Restant à vérifier une par une

`PlaylistManagerView`, `SmartAIView`, `DeplocView`, `GenreTreeView`,
`MetadataView`, `TvView`, `ZoneManagerView` — certaines ont un équivalent v2
au nom différent, d'autres sont peut-être mortes depuis longtemps. À trancher
écran par écran, pas au jugé.

---

## Les 24 emprunts, et ce qu'ils imposent

Ce que la v2 importe de `src/components/` :

| Composant | Importé par la v2 |
|---|---|
| `AlbumArt` | **23 fois** |
| `AlbumEditModal` | 4 |
| `ServiceBadge` | 3 |
| `QualityBadge` | 3 |
| 20 autres | 1 fois chacun |

Ce ne sont pas des restes de l'ancienne interface : ce sont des **briques
partagées qui n'ont jamais été rangées**. Trois d'entre elles sont même des
vues complètes (`TvView`, `OxygenView`, `NowPlaying`), ce qui veut dire que la
v2 réutilise des écrans de l'interface actuelle tels quels.

**Conséquence sur l'ordre des opérations** : le déménagement de ces 24 est un
préalable absolu, et il touche des fichiers que d'autres sessions modifient en
permanence. C'est le morceau qui demande le plus de coordination, pas le plus
de réflexion.

---

## Découpe proposée

### Phase 1 — Ranger les 24 emprunts

Déplacer vers un dossier commun (`src/components/partages/` ou dans `v2/`) les
24 composants que les deux interfaces utilisent, et corriger les imports des
deux côtés.

**Témoin** : une garde qui compte les imports `from '../X.svelte'` depuis
`v2/` et exige **zéro**. Sans elle, un nouvel emprunt réapparaîtra.
**Contre-épreuve** : réintroduire un import croisé doit rougir.

Aucun changement visible à l'écran. C'est le préalable de tout le reste.

### Phase 2 — Donner une porte d'entrée à la v2

Connexion et première installation dans `ShellV2`. C'est la seule phase qui
construit au lieu de déplacer.

**Témoin** : une installation neuve, base vide, atteint l'accueil sans jamais
monter `App.svelte`.
**Contre-épreuve** : sans session valide, la v2 ne doit pas afficher une
coquille vide — aujourd'hui, rien ne l'en empêche.

### Phase 3 — Combler les deux trous

Alarmes et concerts en v2, ou décision explicite de les abandonner. 668 lignes
au total : ce n'est pas le gros du travail, c'est une décision de produit.

### Phase 4 — Inverser le défaut

`futureInterface()` rend `true` sans choix mémorisé. `?v2=0` reste comme issue
de secours. **Rien n'est supprimé** — c'est le point de non-retour réversible :
si un testeur remonte un blocage, une ligne le ramène en arrière.

**Témoin** : sans `localStorage` ni paramètre d'URL, c'est `ShellV2` qui monte.

Laisser tourner une release complète avant la phase 5.

### Phase 5 — Retirer l'interface actuelle

Suppression de `App.svelte`, des 39 vues et des composants devenus orphelins.
Retrait de `interfaceChoisie.ts`, du paramètre `?v2`, de la clé
`tune-interface`.

**Témoin** : `npm test` vert, aucun import mort, le bundle rétrécit.
**Contre-épreuve** : une adresse portant `?v2=0` — quelqu'un l'a mise en
favori — doit ouvrir la v2 sans erreur, pas une page blanche.

---

## Ce qui revient à Bertrand

**1. Les alarmes et les concerts : on les porte, ou on les abandonne ?**
668 lignes. Si personne ne s'en sert, le chantier raccourcit d'autant.

**2. Où placer la bascule par rapport au train ?** La phase 4 change ce que
voit tout le parc au prochain démarrage. Juste après un tag laisse une release
entière pour recevoir les retours ; juste avant, l'inverse.

**3. Quels écrans veux-tu avoir vus toi-même avant la phase 4 ?** La v2 couvre
31 vues ; je peux en prouver le rendu, pas l'usage.

**4. La phase 5 est-elle souhaitable tout de suite ?** L'interface actuelle est
un filet : tant qu'elle existe, `?v2=0` répare n'importe quel blocage. La
supprimer supprime ce filet. Rien n'oblige à enchaîner 4 et 5.

---

## Ce que je déconseille

**Supprimer avant de ranger.** Les 24 emprunts font tomber la v2 immédiatement.

**Basculer avant d'avoir une porte d'entrée.** Une installation neuve se
retrouverait sans écran de connexion.

**Enchaîner les phases 4 et 5 dans la même release.** Le filet de secours est
la seule chose qui rend la bascule sûre ; le retirer dans le même mouvement,
c'est parier qu'aucun blocage ne remontera.
