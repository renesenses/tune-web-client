# Tune — Matrice de test UI (client web)

**Pour** : Elie (stagiaire, à partir du 06/07)
**Cadre** : Axe 2 « UI validée » de la roadmap v0.9.0
**But** : valider systématiquement chaque vue du client web sur toutes les plateformes, tailles d'écran, thèmes et langues, avant la GA.

> *Objectif : **zéro régression visuelle/fonctionnelle** sur l'UI. On teste large mais on priorise : P0 d'abord (chemin critique quotidien), P3 en dernier.*

---

## 1. Mise en place (environnement Elie)

- **Serveur** : lancer `tune-server` en local (Windows), ouvrir `http://localhost:8888`
- **Navigateurs** : Chrome + Edge (Windows), + demander à un testeur Mac de repasser les P0 sur Safari
- **Redimensionnement** : outils dev navigateur (F12 → mode responsive) pour simuler les breakpoints
- **Comptes streaming** : au moins Tidal + Qobuz connectés (Réglages → Services de streaming) pour les vues streaming
- **Une sortie réelle** minimum branchée (DLNA ou AirPlay ou BluOS) + la sortie locale

---

## 2. Dimensions de test

| Dimension | Valeurs à couvrir |
|---|---|
| **Plateforme / navigateur** | Windows Chrome, Windows Edge, macOS Safari (P0 only) |
| **Taille d'écran** | Desktop ≥1400px · Laptop ~1200px · Tablette ~1024px · Mobile ~390px · **Demi-écran** (fenêtre à 50%, ~700px) |
| **Thème** | Dark (défaut) · Light · Midnight · OLED |
| **Langue** | fr, en + 1 CJK (ko **ou** ja **ou** zh) pour vérifier les débordements de texte |
| **Sortie audio** | Local · DLNA · AirPlay · BluOS · OAAT (selon dispo) |

**Règle de couverture** : chaque vue passe **au moins** sur `{Chrome} × {Desktop, Mobile, Demi-écran} × {Dark, Light}`. Les P0 ajoutent `{Safari, Tablette, Midnight/OLED, 1 langue CJK}`.

---

## 3. Priorité des vues (37 vues)

### P0 — chemin critique quotidien (à tester en premier, couverture complète)

| Vue | Points de vigilance |
|---|---|
| **HomeView / DashboardView** | Grille responsive, stats, covers qui ne « flashent » pas |
| **LibraryView** | Onglets Albums/Artistes/Pistes/Genres, filtres qualité/format/SR, grille dense |
| **SearchView** | Recherche fédérée local+streaming, grille par type, petites covers |
| **QueueView** | Ordre, drag&drop, piste courante, local vs streaming |
| **NowPlaying** (plein écran) | Cover, seek bar (pas d'overshoot), crédits, volume |
| **StreamingView** | Tidal/Qobuz/YouTube/Spotify/Deezer/Amazon, badges qualité (jamais le volume) |
| **ZoneManagerView** | Création/suppression zone, groupes, volumes |
| **SettingsView** | Config serveur, auth streaming, DB — la plus grosse vue (179K) |

### P1 — fréquent

PlaylistsView · PlaylistManagerView · PlaylistsHub · RadiosView · RadioFavoritesView · FavoritesView · BrowseView · GenresView · GenreTreeView · MetadataView · EqualizerView

### P2 — features

CollectionsView · SmartCollectionsView · SmartPlaylistsView · SmartAIView · DJView · ConverterView · PodcastsView · HistoryView · MediaServersView · PluginsView · BridgeView · OnboardingView · LoginView

### P3 — secondaire / admin

AdminDashboard · DiagnosticsView · ServiceTokensView · ShortcutsView · AlarmsView · PartyView · OfflineView · AudioVisualizer

---

## 4. Checklist par vue (à cocher pour chaque vue)

Pour **chaque vue**, sur chaque combinaison de la règle de couverture :

- [ ] **Layout** : rien ne déborde, pas de scroll horizontal, pas d'éléments coupés
- [ ] **Responsive** : sidebar → sidebar icônes (tablette) → barre d'onglets bas (mobile) ; grilles se recomposent
- [ ] **Demi-écran** : la vue reste utilisable à ~700px (cas fréquent : fenêtre à côté d'une autre)
- [ ] **Thème** : couleurs/contrastes corrects en Dark/Light/Midnight/OLED ; pas de texte illisible
- [ ] **Langue** : libellés traduits, pas de clé brute (`view.title`), pas de texte tronqué en CJK/allemand
- [ ] **Données vides** : la vue s'affiche proprement sans contenu (0 piste, 0 playlist...)
- [ ] **Données massives** : grande bibliothèque / longues listes → pas de lag, scroll fluide
- [ ] **Interactions** : boutons/menus/modales s'ouvrent et se ferment ; actions principales marchent
- [ ] **Temps réel** : les événements WebSocket mettent à jour la vue (lecture, zone, queue) sans refresh manuel
- [ ] **Console** : aucune erreur JS rouge en console (F12)

---

## 5. Format de remontée de bug

Pour chaque anomalie, noter :

```
Vue          : LibraryView
Combinaison  : Windows Chrome · Mobile 390px · Dark · fr
Attendu      : la grille d'albums passe à 2 colonnes
Observé      : les covers se chevauchent, scroll horizontal
Repro        : 1) ouvrir Bibliothèque 2) onglet Albums 3) réduire à 390px
Capture      : (screenshot)
Console      : (erreur JS éventuelle)
```

---

## 6. Ordre de travail suggéré (semaine 1)

1. **Jour 1** : setup + P0 en `Chrome × {Desktop, Mobile, Demi-écran} × Dark`. Remonter les bugs bloquants tout de suite.
2. **Jour 2** : P0 en Light + Midnight/OLED + 1 langue CJK. Repasser Safari (via un testeur Mac).
3. **Jour 3-4** : P1 (couverture Chrome × 3 tailles × Dark/Light).
4. **Jour 5** : P2/P3 + re-test des bugs P0 corrigés.

> *Astuce : commencer par **NowPlaying, QueueView, LibraryView, SearchView** — ce sont les vues vues 90% du temps par les utilisateurs.*

---

*Document de cadrage — matrice à faire évoluer avec Elie selon les retours.*
