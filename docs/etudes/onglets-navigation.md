# Étude : navigation par onglets dans le client web (ShellV2)

Statut : étude, sans code. Go de Bertrand du 31/10/2026 pour l'étude ; la réalisation viendrait en rc11, après sa validation.

Demande de terrain (un testeur) : garder plusieurs écrans ouverts, par exemple un album, Oxygène et la file d'attente, et passer de l'un à l'autre sans perdre sa place.

## 1. L'existant, mesuré dans le code

### 1.1 Un seul écran à la fois, choisi par un magasin

- `src/lib/stores/navigation.ts` : `activeView` (un `writable<View>`) désigne l'écran courant. `View` compte une soixantaine de valeurs (`home`, `library`, `oxygen`, `queue`, `streamingalbum`, etc.).
- `src/components/v2/ShellV2.svelte` (1156 lignes) : dans `<main class="main">`, une chaîne `{#if $activeView === …}` monte UN composant. Quitter un écran le démonte, et son `$state` local est perdu. Le défaut est connu : le commentaire de `navigation.ts` le décrit ("quitter une vue la démonte et perd son $state local").
- Les fiches (`streamingalbum`, `streamingartist`, `streaminglabel`) sont des vues à part, qui lisent des magasins de cible (`ficheAlbumService`, `vueDeRetour`, `ficheAlbumDeRetour`). Les fiches d'albums LOCAUX vivent à l'intérieur de `LibraryV2` (calque), pas dans `activeView`.
- Autres singletons globaux : `previousView`, `listResetNonce`, `settingsInitialTab`, `pendingSearchQuery`, `pendingOxygenFolder`, `v2SettingsTarget`. Ce sont des "dépôts à consommer une fois" : ils supposent UN écran actif.

### 1.2 Mémoires de position déjà présentes

- `saveViewContext` / `loadViewContext` : instantané sérialisable par vue, en mémoire seulement (perdu au rechargement). Une seule entrée PAR VUE, donc pas deux contextes pour deux onglets de la même vue.
- `stashViewState` / `takeViewState` : dépôt à usage unique pour le retour navigateur (#1215).
- `OxygenView` (`v2-heritage`) garde ses filtres dans `facetSels`, `facetEt`, `query`, etc., en `$state` local : rien n'est conservé quand on quitte l'écran.
- Défilement : géré écran par écran (`QueueV2`, `LibraryV2`, `ArtistesV2`…), jamais restauré par la coquille.

### 1.3 Historique du navigateur

- `src/lib/historiqueCoquille.ts` (582 lignes), branché par `brancherHistoriqueCoquille` dans `ShellV2` : SEUL écrivain de l'historique de la coquille v2. Chaque changement de vue fait un `pushState`; `popstate` repose la vue.
- Adresse : `#vue` ou `#vue/detail` (`#library/album:12`). L'état d'une entrée est construit champ par champ (`etatCoquille()`), car `history.state` refuse les proxies Svelte.
- `historiqueNavigation.ts` : `reculerAvecIntention` évite qu'un retour applicatif écrase l'entrée quittée.
- `routeAuChargement.ts` : `vueDepuisHash` restaure la vue depuis l'adresse au chargement (table `Record<View, boolean>` des vues restaurables), puis la vue de démarrage.

### 1.4 Mémoire par profil

- `ui_preferences` : blob de préférences synchronisé côté serveur, rangé PAR PROFIL (tune-server-rust#3991), relu au démarrage (`v2Bootstrap.ts`) puis écrit par `PATCH /system/config`. `stores/preferences.ts` y range déjà la vue de démarrage, la disposition de la file, l'ordre de la barre latérale, l'ordre manuel des collections, etc.
- `shortcuts.ts` : les "raccourcis" existants sont des signets d'écran (nom, icône, `view`, `state`) rangés par profil, avec `captureCurrentView()` qui sait déjà décrire un écran sérialisé. C'est la brique la plus proche d'un "contenu d'onglet".

### 1.5 Clavier, écran étroit, temps réel

- Aucun gestionnaire global de raccourcis hors `Sidebar` (Échap ferme le tiroir) et la modale de pose de raccourci. Le clavier est donc libre.
- `largeurEcran.ts` : trois formats (`large` > 1100 px, `etroit` <= 1100, `tiroir` <= 760 px) ; au palier tiroir la barre latérale devient un tiroir. Il existe aussi un mode "sans distraction" (`focusMode`) et `mobileNowPlayingOpen`.
- Temps réel : un seul `tuneWS` partagé (`websocket.ts`). Les écrans s'y abonnent à leur montage. L'accueil et Oxygène font des chargements lourds (voir #1152 pour 50 000 pistes).

### 1.6 Issues et discussions (état `all`)

Recherche faite sur `tune-web-client` et `tune` (onglets, tabs, plusieurs écrans, navigation). Aucune issue ni discussion ne traite de la navigation par onglets ou du multi-écrans. Les résultats portent sur des sous-onglets internes (Streaming, Coffrets, Réglages) : hors sujet. Voisines à relire à la réalisation :
- #995 (ouverte) : vumètres et analyseur d'Oxygen qui "cassent" au changement d'écran ou à l'ouverture de la file. Non reproduite, non mesurée. À examiner avant tout choix "gardé monté".
- #924 : accès aux facettes d'Oxygen (fermée) : montre que l'état des filtres a de la valeur.
- #1215, #3843/#3824 : retour navigateur et vue de retour : contraintes à respecter.
- #828/#867 : historique de la coquille.

## 2. Ce qu'est un onglet

Un onglet = un identifiant + un instantané d'écran :

```
Onglet {
  id          // court, stable (uuid ou compteur)
  vue         // View
  detail      // clé de fiche ("album:12"), comme l'adresse actuelle
  titre       // calculé : nom d'album, "Oxygène", "File d'attente"
  icone       // celle de la barre latérale
  contexte    // JSON sérialisable propre à la vue (voir 2.2)
  epingle     // booléen
}
```

### 2.1 Quoi garder

| Élément | Garder | Remarque |
|---|---|---|
| Route (`vue` + `detail`) | oui | déjà sérialisable (`etatCoquille`) |
| Défilement vertical | oui, en pixels de la zone `.main` | restauré après le rendu ; approximatif si la liste est paginée |
| Filtres d'Oxygène (`facetSels`, `facetEt`, `query`, mode d'affichage, tri) | oui | à exposer en instantané dans la vue ; les listes chargées sont rechargées |
| Onglet interne (Réglages, Streaming) | oui | via `saveViewContext` généralisé |
| Sélection de pistes, menus ouverts, saisies non validées | non | éphémère |
| Résultats chargés | non (en mode recréé) | rechargés depuis l'API |

### 2.2 Contrat de contexte

Aujourd'hui `saveViewContext(view, ctx)` est unique par vue. Il devient `saveViewContext(ongletId, ctx)` : même API, clé différente. Chaque vue décide de ce qu'elle écrit (déjà vrai). Les vues qui n'écrivent rien reviennent à leur racine, et c'est acceptable en première version.

## 3. Options d'emplacement

### A. Barre d'onglets au-dessus du contenu (recommandée)

Une rangée mince entre le haut de la fenêtre et `<main>`, à droite de la barre latérale. Familière (navigateur, éditeur), ne touche pas la barre latérale.

```
+--------+----------------------------------------------------------+
| Tune   | [Album : Dark Side x] [Oxygène x] [File d'attente x] [+] |
|        +----------------------------------------------------------+
| Accueil|                                                          |
| Biblio |   (contenu de l'onglet actif)                            |
| Oxygène|                                                          |
| File   |                                                          |
| ...    |                                                          |
+--------+----------------------------------------------------------+
| Lecteur : titre en cours  |<  >||  >|   volume                      |
+-------------------------------------------------------------------+
```

Coût : une rangée d'environ 36 px de hauteur, perdue pour les écrans déjà "hauts" (voir #2198, en-tête trop haut sur 16 pouces). Parade : la rangée n'apparaît qu'à partir du 2e onglet.

### B. Onglets épinglés dans la barre latérale

Les entrées de la barre latérale deviennent des onglets persistants (un écran fixe par entrée) ; les fiches s'ouvrent à part.

```
| Accueil
| Biblio
| Oxygène  <-- coche : écran conservé (pastille •)
| File     <-- coche : écran conservé
```

Plus simple (aucune nouvelle rangée), mais elle ne répond pas au cas "deux albums ouverts à la fois" : un seul exemplaire par écran.

### C. Hybride (étape ultérieure)

A comme base ; épingler un onglet le réduit à son icône, en tête de rangée, non fermable par erreur (comme les navigateurs). Les entrées de la barre latérale ouvrent ou activent un onglet (clic) ; Ctrl/Cmd-clic ou clic molette force un nouvel onglet.

### D. Écartées

- Fenêtres flottantes ou volet divisé (deux écrans côte à côte) : demande autre, coût de mise en page élevé.
- Plusieurs fenêtres du navigateur : déjà possible, mais sans partage d'état et sans mémoire par profil.

## 4. Nombre d'onglets

Recommandation : plafond de 8 onglets ouverts (dont les épinglés), message court au-delà ("Ferme un onglet pour en ouvrir un nouveau") plutôt que fermeture silencieuse du plus ancien. Paramétrable ultérieurement. Raison : la mémoire (section 8) et la lisibilité de la rangée ; 8 tient sur 1100 px avec titres tronqués à environ 140 px.

## 5. Mémoire par profil et au rechargement

- Le jeu d'onglets (liste ordonnée, onglet actif, contextes sérialisés) est rangé dans `ui_preferences`, donc PAR PROFIL et suivi par le serveur, comme `ordreBarreLaterale`. Nouvelle clé, par exemple `ongletsOuverts: { version: 1, actif: id, liste: Onglet[] }`.
- Écriture espacée (debounce environ 1 s, et à `visibilitychange`), jamais à chaque défilement. Taille bornée : 8 onglets x quelques centaines d'octets.
- Rechargement (F5) : l'adresse (`#vue/detail`) reste prioritaire pour l'onglet actif (comportement actuel de `routeAuChargement`); les autres onglets sont relus depuis `ui_preferences`. Un lien profond ouvre un NOUVEL onglet plutôt que d'écraser l'actif.
- Changement de profil : on remplace le jeu d'onglets par celui du profil entrant (même mécanisme que la relecture des préférences de `v2Bootstrap`).
- Plusieurs navigateurs sur le même profil : "dernier qui écrit gagne", comme les autres préférences. Acceptable pour un confort ; à dire dans la doc.
- Option "Rouvrir mes onglets au démarrage" (activée par défaut), et la vue de démarrage reste disponible quand l'option est désactivée.
- Validation à la relecture : une vue inconnue ou non restaurable (`vuesRestaurables`), ou une fiche disparue, devient un onglet à la racine de sa vue, sans erreur.

## 6. Bouton retour du navigateur

C'est le point le plus délicat : l'historique est aujourd'hui une pile linéaire alimentée par les changements de `activeView`.

Options :
1. **Historique par onglet** (recommandée) : chaque onglet porte sa pile de navigation interne ; le bouton Précédent recule DANS l'onglet actif et ne change jamais d'onglet. Techniquement : `history.state` porte `{ ongletId, vue, detail }`; au `popstate`, si l'entrée appartient à un autre onglet, on l'active puis on repose sa vue. Les entrées d'un onglet fermé sont ignorées au `popstate` (on passe à la suivante via `history.back()` ou `replace`).
2. **Historique global** : tout changement d'onglet empile une entrée, Précédent revient à l'onglet d'avant. Simple, mais surprenant (on perd le contenu de l'onglet fermé) et pollue la pile.
3. **Ne pas toucher l'historique** au changement d'onglet (le basculement entre onglets n'écrit rien) et ne garder que la navigation interne. Variante simple de 1, à retenir pour le premier jet : le changement d'onglet fait un `replaceState`, l'adresse reflète l'onglet actif.

Contraintes à tenir : `reculerAvecIntention` (ne pas écraser l'entrée quittée), `state` sans proxy Svelte, `vueDeRetour` et `ficheAlbumDeRetour` à rendre PAR ONGLET (aujourd'hui singletons : un retour de fiche lirait la cible d'un autre onglet). Les tests existants sur l'historique (une quarantaine de fichiers `historique*`, `retourNavigation*`) deviennent le filet de non-régression.

## 7. Raccourcis clavier

Aucun gestionnaire global n'existe : le champ est libre, mais il faut éviter les conflits du navigateur (Ctrl+T, Ctrl+W, Ctrl+Tab sont pris et non interceptables de façon fiable).

| Action | Proposition | Remarque |
|---|---|---|
| Onglet suivant / précédent | Alt+Droite / Alt+Gauche (macOS : Option) ou Ctrl+PageDown / PageUp | Alt+Flèche gauche = Précédent navigateur sous Windows/Linux : choisir PageUp/PageDown |
| Aller à l'onglet 1 à 8 | Alt+1 … Alt+8 | pas de conflit connu avec le navigateur |
| Fermer l'onglet | Alt+W | Ctrl+W ferme la fenêtre du navigateur |
| Nouvel onglet (copie de l'écran) | Alt+T | |
| Ouvrir un lien dans un nouvel onglet | Ctrl/Cmd-clic, clic molette | sur pochettes et entrées de la barre latérale |

Ignorés quand le focus est dans un champ de saisie. À afficher dans l'écran existant des raccourcis clavier, et personnalisables à terme.

## 8. Mobile et petit écran

- Palier `tiroir` (<= 760 px) : onglets désactivés par défaut. La navigation reste celle d'aujourd'hui (tiroir, barre mobile). Raison : la rangée n'aurait pas la place, et le mobile garde sa pile de navigation naturelle.
- Palier `etroit` (<= 1100 px) : rangée affichée avec icônes seules (titre en infobulle), même logique que le repli de la barre latérale.
- Passage large vers tiroir en cours de session : les onglets sont conservés en mémoire mais cachés ; le retour à un écran large les réaffiche. Aucun onglet n'est perdu en tournant l'écran d'une tablette.
- Les apps Android et iOS (clients natifs) sont hors périmètre.

## 9. Accessibilité

- Motif ARIA "tabs" : conteneur `role="tablist"`, chaque onglet `role="tab"` avec `aria-selected` et `aria-controls`, panneau `role="tabpanel"` portant `aria-labelledby`.
- Clavier sur la rangée : flèches gauche/droite pour se déplacer, Début/Fin, Entrée ou Espace pour activer, Suppr pour fermer (activation manuelle, pour ne pas recharger un écran à chaque flèche). Tabulation unique ("roving tabindex").
- Bouton de fermeture : `aria-label` "Fermer l'onglet <titre>" ; annonce poli (`aria-live`) à l'ouverture, à la fermeture et au changement.
- Focus : à la fermeture, vers l'onglet voisin ; au changement d'onglet, vers le titre de l'écran (pas de piège dans le lecteur).
- Contraste et cible tactile (au moins 24 px de haut ; 32 px visés) ; respect de `prefers-reduced-motion` pour l'animation de glissement.
- Écrans cachés (mode "gardés montés") : `inert` ou `hidden` obligatoire, sinon un lecteur d'écran lirait les panneaux invisibles.

## 10. Performances : monté ou recréé

| | Recréé (démonté, restauré depuis le contexte) | Gardé monté (caché) |
|---|---|---|
| Mémoire | faible, un seul écran | croît avec chaque onglet (grilles de 500 pochettes d'Oxygène, listes de 50 000 pistes) |
| WebSocket / minuteurs | un jeu d'abonnements | N jeux : vumètres, analyseur, sondages d'état tournent en arrière-plan |
| Retour à l'onglet | rechargement (réseau) + restauration du défilement | instantané, état exact |
| Complexité | modérée : tout passe par des instantanés | élevée : singletons (`vueDeRetour`, `pendingSearchQuery`…) partagés entre onglets montés |
| Cohérence avec le code | proche de l'existant | impose de rendre chaque vue "pausable" |

Recommandation : **recréé avec restauration** pour la première version, avec un petit cache d'instantanés. Le code actuel démonte déjà chaque vue ; les écrans reposent sur des magasins globaux et des abonnements au montage (WS inclus), ce qui rend le "gardé monté" risqué et coûteux (et c'est justement le sujet de #995 : les vumètres d'Oxygène supportent mal les montages et démontages répétés). Une seconde étape optionnelle pourrait garder monté (caché, `inert`, abonnements suspendus) les 2 derniers onglets actifs seulement, après mesure.

Mesures à faire avant de trancher : empreinte mémoire d'Oxygène sur 50 000 pistes, nombre d'abonnements WS par écran, temps de remontage de la Bibliothèque.

## 11. Risques

1. **Singletons de navigation** (`vueDeRetour`, `ficheAlbumDeRetour`, `listResetNonce`, `pendingOxygenFolder`, `settingsInitialTab`, `ficheAlbumService`) : à rendre par onglet ou à vider proprement au changement. Risque principal de régression silencieuse ("écrit mais pas branché").
2. **Historique du navigateur** : 580 lignes de logique fine et une quarantaine de tests ; la modifier peut réintroduire "je sors de Tune" (#828/#867).
3. **Contextes non sérialisables** : `history.state` refuse les proxies ; les instantanés doivent suivre la règle de `etatCoquille()`.
4. **Deux écrivains de préférences** (plusieurs navigateurs sur un profil) : écrasements.
5. **Poids du blob `ui_preferences`** : bornes strictes (8 onglets, contextes plafonnés à environ 2 Ko).
6. **Vumètres / analyseur (#995)** : non reproduit, non mesuré ; à traiter AVANT d'introduire plus de montages.
7. **Coquille et ancienne interface** : `App.svelte` reste en place tant que l'interface actuelle n'est pas retirée ; les onglets ne concernent que `ShellV2` (comme `historiqueCoquille`).
8. **Place verticale** (#2198) et **surcharge cognitive** : rangée masquée tant qu'il n'y a qu'un onglet ; option pour la désactiver.
9. **Clavier** : conflits avec le navigateur et les lecteurs d'écran.
10. **Tests** : la porte web se joue sur Shrek ; le chantier ajoute des cas d'historique et de restauration à chaque étape.

## 12. Recommandation

Option A (rangée d'onglets au-dessus du contenu), écrans RECRÉÉS avec restauration d'instantané, jeu d'onglets mémorisé par profil dans `ui_preferences`, historique du navigateur interne à l'onglet actif, désactivé sous 760 px. L'épinglage (option C) et le "gardé monté" (2 onglets) sont des suites optionnelles. Le bouton d'ouverture en nouvel onglet (Ctrl/Cmd-clic, clic molette, menu "Ouvrir dans un nouvel onglet") répond directement à la demande : album, Oxygène et file côte à côte, en un clic.

## 13. Estimation par étapes (rc11)

| Étape | Contenu | Estimation |
|---|---|---|
| 0 | Mesures (mémoire, WS, remontage) et traitement de #995 | 1 j |
| 1 | Modèle `Onglet` + magasin ; singletons de retour rendus par onglet ; aucune interface | 2 j |
| 2 | Rangée d'onglets (A), ouverture/fermeture/bascule, titres et icônes, restauration route + défilement | 3 j |
| 3 | Contextes de vue : Oxygène (filtres), Réglages, Streaming ; généralisation de `saveViewContext` | 2 j |
| 4 | Historique du navigateur par onglet + tests de non-régression | 3 j |
| 5 | Mémoire par profil (`ui_preferences`), rechargement, changement de profil, option de démarrage | 2 j |
| 6 | Clavier + accessibilité (ARIA, focus, annonces) | 2 j |
| 7 | Écran étroit et tiroir, réglage "activer les onglets", textes (i18n) | 1 j |
| 8 | Recette sur Shrek, essai terrain, ajustements | 2 j |
| Total | | environ 18 jours-développeur (3 à 4 semaines calendaires avec revue) |

Jalon minimal livrable plus tôt (étapes 0 à 2 + 5 simplifiée) : environ 8 jours, sans clavier ni historique par onglet.

## 14. Décisions attendues de Bertrand

1. Option A, puis C : d'accord ?
2. Plafond de 8 onglets : d'accord ?
3. Écrans recréés en première version (le gardé monté vient après mesure) ?
4. Onglets activés par défaut, ou réglage à cocher dans Réglages ?
