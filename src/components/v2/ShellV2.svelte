<script lang="ts">
  /**
   * Coquille du nouveau client (direction Levente) : barre latérale à
   * niveaux + vue principale routée sur `activeView` + lecteur. Portée
   * `.tune-v2`.
   *
   * Seule la Bibliothèque est redessinée à ce stade ; les autres vues
   * affichent un cadre « à venir » dans la coquille — on les redessinera une
   * à une, sans jamais casser la navigation.
   */
  import { activeView, vueDeRetour, type View } from '../../lib/stores/navigation';
  import { formatEcran, tiroirOuvert } from '../../lib/largeurEcran';
  import Sidebar from './Sidebar.svelte';
  import LibraryV2 from './LibraryV2.svelte';
  import HomeV2 from './HomeV2.svelte';
  import SearchV2 from './SearchV2.svelte';
  import * as api from '../../lib/api';
  import { ficheAlbumService, ficheArtisteService } from '../../lib/stores/streaming';
  import { get } from 'svelte/store';
  import { resoudreArtisteDeService, messageRepli } from '../../lib/repliArtisteService';
  import { setSearchCriteria } from '../../lib/stores/shortcuts';
  import { pendingSearchQuery, gestesNavigationService } from '../../lib/stores/navigation';
  import ArtisteServiceV2 from './ArtisteServiceV2.svelte';
  import AlbumDetailV2 from './AlbumDetailV2.svelte';
  import PlaylistsV2 from './PlaylistsV2.svelte';
  import SettingsV2 from './SettingsV2.svelte';
  import RadiosV2 from './RadiosV2.svelte';
  import PodcastsV2 from './PodcastsV2.svelte';
  import QueueV2 from './QueueV2.svelte';
  import FavoritesV2 from './FavoritesV2.svelte';
  import ZonesV2 from './ZonesV2.svelte';
  import MediaServersV2 from './MediaServersV2.svelte';
  import StreamingV2 from './StreamingV2.svelte';
  import CrossfeedV2 from './CrossfeedV2.svelte';
  import EqualizerV2 from './EqualizerV2.svelte';
  import TuneHealthV2 from './TuneHealthV2.svelte';
  import ConverterV2 from './ConverterV2.svelte';
  import DeclickV2 from './DeclickV2.svelte';
  import PluginsV2 from './PluginsV2.svelte';
  import CollectionsV2 from './CollectionsV2.svelte';
  import HistoriqueV2 from './HistoriqueV2.svelte';
  import MetadataV2 from './MetadataV2.svelte';
  import SupportV2 from './SupportV2.svelte';
  // Barre de transport : celle du client actuel, telle quelle. On ne la FORKE
  // pas — 2715 lignes qui divergeraient aussitôt et qu'il faudrait corriger
  // deux fois. Elle ne prend aucune prop et lit tout depuis les stores, donc
  // elle se pose ici sans adaptateur. Ses couleurs suivent le thème v2 par le
  // pont de variables de `tune-v2.css`.
  import EtiquettesV2 from './EtiquettesV2.svelte';
  import RaccourcisV2 from './RaccourcisV2.svelte';
  import TransportBar from '../TransportBar.svelte';
  // « Lecture en cours » : l'écran du client actuel, monté ici. Il n'a jamais
  // existé dans le shell v2 — mais depuis que la barre historique y vit, elle
  // PROPOSE de l'ouvrir (clic sur la piste, et `mobileNowPlayingOpen` en
  // mobile). Sans ces deux montages, le clic tombait dans le repli « À venir » :
  // l'écran n'avait pas disparu, il n'avait jamais été branché.
  import NowPlaying from '../NowPlaying.svelte';
  import TvView from '../TvView.svelte';
  /**
   * 🔴 SANS LUI, TOUT DIALOGUE RESTE SANS REPONSE POUR TOUJOURS.
   *
   * Bertrand, 05/09/2026 : « suppression d'un raccourci ne marche pas ». Elle
   * demande confirmation par `dialogs.confirm()`, qui pose la demande dans une
   * file et attend qu'un conteneur la rende. Ce conteneur etait monte « une
   * seule fois, dans App.svelte » — que le mode `?v2` ne monte JAMAIS.
   *
   * La promesse ne se resolvait donc pas : le clic ne faisait rien, sans
   * message, sans erreur de console. Exactement le defaut que ce composant
   * avait ete ecrit pour corriger — les dialogues natifs qui n'ouvrent pas
   * dans une vue embarquee (#166) — reproduit d'un cran plus haut.
   *
   * Trois ecrans etaient touches, quatre gestes en tout : supprimer un
   * raccourci, vider les favoris radio, et deux confirmations des Reglages
   * dont la deconnexion d'un service.
   */
  import DialogContainer from '../DialogContainer.svelte';
  /**
   * TREIZIÈME « écrit mais pas branché », et le plus coûteux de la série.
   *
   * `notifications.error(...)` est appelé CENT DIX-NEUF fois dans les écrans
   * de cette coquille. Le magasin les enregistrait consciencieusement… et
   * `ToastContainer`, le SEUL composant du client qui rend `$notifications`,
   * n'était monté que par `App.svelte` — que `?v2` ne monte jamais. Le
   * commentaire du magasin le dit mot pour mot : « any component can push a
   * toast, and `App.svelte` subscribes to render it ».
   *
   * Conséquence : en v2, tout message d'erreur, de succès ou d'information
   * partait dans le vide. Y compris `PisteActions.svelte`, qui traite
   * pourtant son échec de lecture correctement depuis toujours.
   *
   * C'est le TROISIÈME canal bouché de #3732 — celui que le ticket ne
   * nommait pas, et sans lequel corriger les deux autres n'aurait rien
   * changé à l'écran.
   */
  import ToastContainer from '../ToastContainer.svelte';
  // OXYGEN monte l'ecran du client ACTUEL, comme « Lecture en cours » et
  // « TV » juste au-dessus. Signale manquant par Bertrand le 05/09/2026 :
  // « Il manque Oxygen dans la v2 !! ». Il pese 1 400 lignes avec son rail de
  // facettes et son inspecteur ; le reecrire aux couleurs du nouveau client
  // est un chantier a part, et le laisser absent en attendant privait d'une
  // fonction entiere. Mieux vaut l'ecran d'hier que pas d'ecran.
  import OxygenView from '../OxygenView.svelte';
  // AMBIANCE et REPERTOIRES, montes de la meme facon. Signales manquants par
  // Querite sur le forum le 05/09/2026 : « manque les onglets : Ambiance,
  // Repertoires, Oxygen ». Les trois vues existaient et etaient declarees ;
  // la coquille n'en montait aucune.
  import AmbianceView from '../AmbianceView.svelte';
  import BrowseView from '../BrowseView.svelte';
  import { mobileNowPlayingOpen } from '../../lib/stores/navigation';
  import AvatarMenu from './AvatarMenu.svelte';
  /**
   * 🔴 LA RECHERCHE GLOBALE, écrite et montée nulle part ici.
   *
   * Sandro, fil 1718 (08/09/2026) : « Dans l'ancienne interface, le bouton
   * situé en haut à droite déclenchait une recherche globale et unifiée. […]
   * ai-je raté une option/un raccourci ? » — il n'a rien raté : le composant
   * existe (475 lignes, `federatedSearch` local + services, aperçu instantané)
   * et `App.svelte:1485` est son SEUL montage. `main.ts` monte `ShellV2` OU
   * `App`, jamais les deux : en v2 la loupe n'existait donc pas, et
   * `src/lib/keyboard.ts` ne porte aucun raccourci de recherche — ni ici ni
   * dans l'ancienne coquille. Il n'y avait aucun repli.
   *
   * Posée dans la MÊME grappe que le signet et l'avatar, comme
   * `App.svelte:1482-1484` pose la paire : un seul endroit, la même place d'un
   * écran à l'autre. La barre reste escamotée en une icône ronde tant qu'on ne
   * clique pas — la grappe ne gagne donc qu'un rond de 32 px.
   */
  import GlobalSearchBar from '../GlobalSearchBar.svelte';
  import { addShortcut } from '../../lib/stores/shortcuts';
  import { notifications } from '../../lib/stores/notifications';
  import { t, locale } from '../../lib/i18n';
  import { preferences } from '../../lib/stores/preferences';
  import { applyV2Theme } from '../../lib/v2Theme';
  import {
    startUpdatePolling, stopUpdatePolling,
    updateAvailable, latestVersion, updateBannerDismissed, dismissUpdateBanner,
  } from '../../lib/stores/updates';
  import { v2SettingsTarget } from '../../lib/stores/v2SettingsNav';
  import { bootstrapV2, suivreLaBibliotheque } from '../../lib/v2Bootstrap';
  import { setupKeyboardShortcuts } from '../../lib/keyboard';
  import { brancherHistoriqueCoquille } from '../../lib/historiqueCoquille';
  import { demarrerTransportV2 } from '../../lib/v2Live';
  import { reserveDeLaGrappe } from '../../lib/gouttiereGrappe';

  /**
   * 🔴 LA GOUTTIÈRE EST MESURÉE, PLUS DEVINÉE.
   *
   * `.av-tr` est en position absolue au-dessus des écrans : sa largeur ne leur
   * est pas connue, ils la réservaient donc par un nombre écrit à la main. Ce
   * nombre a été faux deux fois de suite, pour la même raison — il décrit un
   * ÉTAT, et la grappe en a plusieurs :
   *
   *   - `96px`, avant que la recherche globale ne rejoigne la grappe (#3629) :
   *     « le bouton Modifier est trop proche de l'icône rechercher » ;
   *   - `172px`, qui compte la loupe REPLIÉE (36 px). Dépliée, elle en fait
   *     320. Les boutons « Ajouter un widget » et « Terminé » de l'accueil
   *     passaient donc encore dessous (Bertrand, 09/09/2026), et « 200 lectures
   *     / Vider » de l'Historique avec eux.
   *
   * Un observateur de taille écrit la largeur réelle dans `--v2-grappe-w`. Elle
   * suit la loupe qui s'ouvre, le bouton de tiroir qui paraît, le bouton TV, et
   * tout ce qu'on ajoutera demain — sans qu'un nombre soit à corriger nulle
   * part. La valeur de la feuille reste le repli, avant la première mesure et
   * là où l'observateur n'existe pas.
   *
   * L'effet n'écrit PAS un `$state` qu'il relit : il pose une propriété CSS sur
   * un nœud. Aucune boucle de mise à jour possible.
   */
  let grappeEl = $state<HTMLElement | null>(null);
  let coquilleEl = $state<HTMLElement | null>(null);
  $effect(() => {
    const g = grappeEl, c = coquilleEl;
    if (!g || !c || typeof ResizeObserver === 'undefined') return;
    const poser = () => c.style.setProperty('--v2-grappe-w', `${reserveDeLaGrappe(g.getBoundingClientRect().width)}px`);
    poser();
    const ro = new ResizeObserver(poser);
    ro.observe(g);
    return () => ro.disconnect();
  });
  import '../../styles/tune-v2.css';

  /**
   * 🔴 Des CLÉS, pas des libellés.
   *
   * Le titre de l'en-tête est la première chose qu'on lit sur chaque écran, et
   * il restait en français quelle que soit la langue choisie — même dette que
   * la barre latérale, soldée en même temps (Bertrand, 06/09/2026 :
   * « Traductions incomplètes : merci de tout vérifier »).
   *
   * Une vue sans entrée retombe sur son propre nom : c'est un identifiant
   * technique, mais il vaut mieux qu'un titre vide, et cela se voit tout de
   * suite quand il en manque une.
   */
  const LABELS: Partial<Record<View, string>> = {
    home: 'nav.home', radios: 'v2.nav.radioShort', playlists: 'v2.nav.playlists',
    search: 'nav.search', podcasts: 'v2.nav.podcasts', streaming: 'v2.nav.streaming',
    queue: 'nav.queue', favorites: 'v2.nav.favorites', zonemanager: 'nav.zonemanager',
    mediaservers: 'nav.mediaservers', history: 'nav.history', oxygen: 'v2.nav.oxygen',
    ambiance: 'nav.ambiance', browse: 'nav.browse', equalizer: 'nav.equalizer',
    crossfeed: 'v2.nav.crossfeed', converter: 'v2.nav.converter', declick: 'v2.nav.declick',
    metadata: 'metadata.title', plugins: 'v2.nav.plugins', diagnostics: 'v2.nav.processing',
    settings: 'v2.nav.settings', support: 'v2.nav.support', genres: 'nav.genres',
  };
  const label = $derived(
    LABELS[$activeView] ? $t(LABELS[$activeView] as any) : $activeView,
  );

  // Le thème est posé sur <html> : les tokens s'appliquent alors à toutes les
  // racines .tune-v2, y compris celles imbriquées dans les vues.
  $effect(() => { applyV2Theme($preferences.v2Theme); });

  /**
   * 🔴 LA LANGUE ENREGISTRÉE, que personne n'appliquait.
   *
   * Onzième « écrit mais pas branché », et de loin le plus visible depuis la
   * traduction du client : `main.ts` monte `ShellV2` OU `App`, jamais les
   * deux, et la seule ligne qui applique la préférence au démarrage vivait
   * dans `App.svelte` :
   *
   *     preferences.subscribe((prefs) => { applyTheme(prefs.theme);
   *                                        locale.set(prefs.language ?? 'fr'); });
   *
   * Conséquence exacte : on choisissait sa langue dans les Réglages, l'écran
   * changeait — `SettingsV2` appelle `locale.set` lui-même — puis le premier
   * rechargement ramenait tout en français. « Sur .18, les traductions ne
   * marchent plus du tout » (Bertrand, 06/09/2026) : elles marchaient, elles
   * ne SURVIVAIENT pas.
   *
   * C'est le même oubli que celui décrit trois lignes plus bas pour les
   * magasins partagés, et pour la même raison. Il n'était simplement pas vu,
   * parce que le client était en français partout — la passe de traduction du
   * jour l'a rendu visible.
   *
   * ⚠️ Pas de boucle : `locale` n'écrit jamais dans `preferences`. Le seul
   * autre écrivain est le sélecteur des Réglages, qui met les deux à jour.
   */
  $effect(() => { locale.set($preferences.language ?? 'fr'); });

  // Les stores partagés sont alimentés par App.svelte, que `?v2` ne monte
  // jamais : sans cet appel, zones/albums/appareils restent vides et toute
  // la coquille affiche des écrans vides trompeurs. Voir lib/v2Bootstrap.
  $effect(() => { bootstrapV2(); });
  // Et le RESTE DU TEMPS : le serveur annonce ses scans et ses imports, encore
  // faut-il les écouter. Sans cela, `albums` était rempli au montage et plus
  // jamais — trois testeurs ont signalé qu'il fallait recharger la page.
  $effect(() => suivreLaBibliotheque());
  // Le VIVANT, que `bootstrapV2` ne fait pas : WebSocket, rafraîchissement des
  // zones, minuteur de progression, répétition et aléatoire. Sans lui, la barre
  // de transport reste figée sur l'état du montage — elle n'est pas mal
  // branchée, personne ne l'alimente. Le retour arrête tout au démontage.
  $effect(() => demarrerTransportV2());

  /**
   * L'ANNONCE DE MISE A JOUR, que la coquille v2 ne portait pas.
   *
   * Le sondage, les stores et la bannière existaient depuis longtemps — dans
   * `App.svelte`, que `?v2` ne monte jamais. Personne n'appelait donc
   * `startUpdatePolling()` sur cette voie : `updateAvailable` restait `false`
   * pour toujours, et la pastille de la barre latérale v2, elle aussi branchée
   * sur ce store, ne s'allumait jamais. Écrit, mais pas branché.
   *
   * Le sondage s'arrête au démontage : sans le retour, une coquille remontée
   * (bascule d'interface) en laisserait un second derrière elle.
   */
  $effect(() => {
    startUpdatePolling();
    return () => stopUpdatePolling();
  });

  /**
   * 🔴 Les raccourcis clavier n'etaient branches NULLE PART en `?v2`.
   *
   * `setupKeyboardShortcuts` n'etait appele que par `App.svelte`, que ce mode
   * ne monte jamais. Espace, les fleches, N, P et M ne faisaient donc rien du
   * tout dans le nouveau client — ecrit, pas branche, comme l'annonce de mise
   * a jour avant elle.
   *
   * Constate le 05/09/2026 en cherchant ou poser la touche « arreter » que
   * Bertrand demandait : il n'y avait pas d'endroit ou la poser.
   */
  $effect(() => setupKeyboardShortcuts());

  /**
   * 🔴 L'HISTORIQUE DU NAVIGATEUR, QUE CETTE COQUILLE N'ÉCRIVAIT PAS — #828, #867.
   *
   * FabienM, fil 1749 : « Bouton RETOUR du navigateur ne fonctionne pas dans la
   * V1 alors que ça fonctionne dans l'interface actuelle. […] ça me renvoie au
   * site précédent, JE SORS TOTALEMENT DE TUNE. » Cinq testeurs, le même geste.
   *
   * Ce n'était pas un bouton cassé : `pushState` et `popstate` n'existaient que
   * dans `App.svelte`, que `main.ts` ne monte jamais quand cette coquille
   * tourne. Zéro occurrence dans les cinquante composants de `v2/` — mesuré
   * avant d'écrire. Aucune entrée empilée, donc rien à dépiler : le Précédent
   * remontait à la page d'AVANT Tune.
   *
   * Le branchement rend sa fonction d'arrêt : sans elle, une coquille remontée
   * laisserait un second écrivain derrière elle et chaque changement de vue
   * empilerait deux entrées.
   */
  $effect(() => brancherHistoriqueCoquille());

  /** La bannière n'occupe la place que si elle a quelque chose à dire. */
  const annonceMaj = $derived($updateAvailable && !$updateBannerDismissed);

  /**
   * Le clic MENE quelque part : Réglages → Système, section « À propos », d'où
   * la mise à jour s'installe. Une bannière qui annonce sans conduire oblige à
   * chercher soi-même l'écran — et c'est le même geste que la version de la
   * barre latérale, qui vise déjà cet onglet.
   */
  function ouvrirMaj() {
    v2SettingsTarget.set({ tab: 'system', section: 'about' });
    activeView.set('settings');
  }

  /** Bascule vers le mode TV — plein écran puis vue dédiée, comme l'écran actuel. */
  /**
   * Ouvrir la fiche d'un album de service depuis « Lecture en cours ».
   *
   * La coquille est le seul endroit qui sache que cet écran existe : le
   * composant partagé `NowPlaying` reçoit le geste, il ne le devine pas.
   * `vueDeRetour` porte le chemin du retour, comme pour la fiche artiste —
   * un seul mécanisme de retour dans cette coquille, pas deux.
   */
  function ouvrirAlbumService(c: { service: string; albumId: string; titre: string }) {
    vueDeRetour.set('nowplaying');
    ficheAlbumService.set({ service: c.service as any, id: c.albumId, titre: c.titre });
    activeView.set('streamingalbum');
  }

  /**
   * Résoudre un NOM d'artiste en identifiant de service, puis ouvrir sa fiche.
   *
   * 🔴 Une piste de service ne porte pas l'identifiant de son artiste — seul
   * son nom voyage avec elle. On le résout par la recherche fédérée, comme
   * `ArtistesV2` le fait déjà pour les albums d'un artiste local, et on
   * réemploie l'appariement d'`albumsArtisteStreaming` plutôt que d'en
   * écrire un second :
   * il préfère l'égalité exacte du nom et ne retombe sur le premier candidat
   * qu'à défaut.
   *
   * ⚠️ REPLI EXPLICITE. Si le service ne connaît pas ce nom, il n'y a pas de
   * fiche à ouvrir : on revient au geste d'avant — la recherche, périmètre
   * ouvert sur la source. Un écran vide serait pire que la recherche qu'il
   * remplace.
   */
  async function ouvrirArtisteServiceParNom(c: { service: string; nom: string }) {
    const issue = await resoudreArtisteDeService(c, async (nom, service) => {
      const r = await api.federatedSearch(nom, [service], 5);
      return r?.services?.[service]?.artists ?? [];
    });
    if (issue.type === 'repli') {
      /**
       * 🔴 #956 — LE REPLI PARLE MAINTENANT. Sandro, fil 1769 : « l'interface
       * tourne en boucle et me renvoie simplement sur la grille des résultats
       * de recherche du début ». Le geste est le bon — un écran vide serait
       * pire que la recherche qu'il remplace — mais il était MUET, et un
       * retour silencieux au point de départ se lit comme une panne.
       *
       * `injoignable` garde sa trace : c'est la seule branche qui peut
       * produire son symptôme sans qu'aucune mesure ne l'explique, et le
       * `catch` d'avant l'avalait.
       */
      if (issue.raison === 'injoignable') {
        console.warn('[artiste de service] la recherche a levé', c.service, c.nom, issue.erreur);
      }
      notifications.info(messageRepli(issue.raison, c, get(t)));
      setSearchCriteria({ q: c.nom, source: c.service });
      pendingSearchQuery.set(c.nom);
      activeView.set('search');
      return;
    }
    vueDeRetour.set('nowplaying');
    ficheArtisteService.set({ service: c.service as any, id: issue.id, nom: c.nom });
    activeView.set('streamingartist');
  }

  /**
   * ARMER les gestes que cette coquille sait tenir. L'ancienne ne les arme
   * pas : les composants partagés y liront `null` et garderont leur
   * comportement d'avant. Voir `stores/navigation.gestesNavigationService`.
   */
  $effect(() => {
    gestesNavigationService.set({
      ouvrirAlbum: ouvrirAlbumService,
      ouvrirArtiste: ouvrirArtisteServiceParNom,
    });
    return () => gestesNavigationService.set(null);
  });

  /** Le retour de la fiche album : le dépôt est consommé UNE fois. */
  function fermerAlbumService() {
    const ou = $vueDeRetour;
    ficheAlbumService.set(null);
    vueDeRetour.set(null);
    activeView.set(ou ?? 'nowplaying');
  }

  function modeTv() {
    try {
      document.documentElement.requestFullscreen?.()?.catch(() => {});
    } catch {
      /* le plein écran peut être refusé : la vue s'ouvre quand même */
    }
    activeView.set('tv');
  }

  /** Pose d'un raccourci sur la vue COURANTE, depuis n'importe quel écran. */
  let poseRaccourci = $state(false);
  let nomRaccourci = $state('');
  let pose = $state(false);
  async function poser() {
    const n = nomRaccourci.trim();
    if (!n || pose) return;
    pose = true;
    try {
      await addShortcut(n, '⭐');
      nomRaccourci = '';
      poseRaccourci = false;
    } catch (e: any) {
      notifications.error(e?.message ?? 'Raccourci impossible.');
    }
    pose = false;
  }
</script>

<div class="v2-shell tune-v2" class:avec-maj={annonceMaj} bind:this={coquilleEl}>
  <!--
    Le raccourci se pose depuis N'IMPORTE QUEL écran.

    Il vivait dans l'en-tête du groupe « Raccourcis » de la barre latérale :
    utile, mais on ne pense pas à aller à l'autre bout de l'écran pour marquer
    ce qu'on a sous les yeux. Bertrand, 02/09/2026 : « il manque l'icône pour
    créer un raccourci sur chaque écran ».

    Posé ICI, à côté de l'avatar, plutôt que dans chacun des vingt-cinq écrans :
    un seul endroit à tenir, et l'icône ne bouge pas d'un écran à l'autre.
    `captureCurrentView` fige la vue courante quelle qu'elle soit.
  -->
  <!--
    🔴 L'OUVERTURE DU TIROIR vit ICI, pas dans la barre latérale.

    Au palier « tiroir » (≤ 760 px) la barre est hors champ : son propre bouton
    de repli est inatteignable. Sans ce bouton, la navigation entière
    disparaîtrait sur un téléphone.
  -->
  <div class="av-tr" bind:this={grappeEl}>
    <!--
      🔴 L'OUVERTURE DU TIROIR vit ICI, pas dans la barre latérale.

      Au palier « tiroir » (≤ 760 px) la barre est hors champ : son propre
      bouton de repli est inatteignable, et sans celui-ci la navigation
      entière disparaîtrait sur un téléphone.

      Dans la GRAPPE haut-droite, et non en haut à gauche comme le veut
      l'usage : c'est le seul endroit que les vingt-cinq écrans réservent
      déjà (leur en-tête réserve `var(--v2-grappe-w)`). Posé à
      gauche, il se serait couché sur le titre de chaque écran.
    -->
    {#if $formatEcran === 'tiroir'}
      <button class="raccourci" onclick={() => tiroirOuvert.update((v) => !v)}
        aria-expanded={$tiroirOuvert}
        aria-label={$t('v2.nav.menu' as any)} title={$t('v2.nav.menu' as any)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M4 7h16M4 12h16M4 17h16"/>
        </svg>
      </button>
    {/if}
    <!--
      Le mode TV entre DANS la grappe.

      Il était ancré en haut à droite de « Lecture en cours », donc sous
      l'avatar et le signet que la coquille pose au même endroit. Je l'avais
      décalé de 108 px : ça ne se chevauchait plus, mais un nombre magique ne
      s'aligne sur rien et casse au premier bouton ajouté.
      Ici, les trois sont sur la même ligne, à la même taille, espacés par la
      même règle.
    -->
    {#if $activeView === 'nowplaying'}
      <button class="raccourci" onclick={modeTv}
        aria-label={$t('nowplaying.tvMode' as any)} title={$t('nowplaying.tvMode' as any)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
      </button>
    {/if}
    <!--
      La LOUPE, à gauche du signet — l'ordre de `App.svelte`, inversé : là-bas
      le signet précède la recherche dans le flux, mais la grappe y est ancrée
      à droite comme ici, et Sandro décrit « le bouton situé en haut à droite ».
      On garde la recherche la plus à gauche pour que son champ, en s'ouvrant,
      pousse vers la gauche sans jamais recouvrir l'avatar.
    -->
    <GlobalSearchBar />
    <button class="raccourci" onclick={() => (poseRaccourci = !poseRaccourci)}
      aria-label={$t('v2.nav.addShortcut' as any)} title={$t('v2.nav.addShortcut' as any)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><!-- Le SIGNET de l'ecran actuel, et non une etoile : c'est le pictogramme
           que Bertrand associe deja au raccourci. -->
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
    </button>
    <AvatarMenu />
  </div>

  {#if poseRaccourci}
    <div class="rc-fond" role="presentation" onclick={() => (poseRaccourci = false)}>
      <form class="rc" onclick={(e) => e.stopPropagation()}
        onsubmit={(e) => { e.preventDefault(); void poser(); }}>
        <label for="rc-nom">{$t('v2.nav.addShortcut' as any)}</label>
        <!-- svelte-ignore a11y_autofocus -->
        <input id="rc-nom" bind:value={nomRaccourci} placeholder={$t('v2.nav.shortcutName' as any)} autofocus
          onkeydown={(e) => { if (e.key === 'Escape') poseRaccourci = false; }} />
        <button type="submit" disabled={pose || !nomRaccourci.trim()}>{$t('common.save' as any)}</button>
      </form>
    </div>
  {/if}

  {#if annonceMaj}
    <!--
      Dans le FLUX, en premier enfant — pas en absolu par-dessus la coquille :
      une bannière qui recouvre mange la première ligne de chaque écran, et la
      grappe avatar/signet est déjà pincée en haut à droite. Ici elle décale
      tout, y compris la grappe (`.avec-maj .av-tr`).
    -->
    <div class="maj">
      <button class="maj-txt" onclick={ouvrirMaj}>
        {$t('app.updateAvailable').replace('{version}', String($latestVersion ?? ''))}
      </button>
      <button class="maj-x" onclick={dismissUpdateBanner}
        aria-label={$t('app.dismiss')} title={$t('app.dismiss')}>&times;</button>
    </div>
  {/if}

  <div class="v2-row">
    <Sidebar />
    <main class="main">
      {#if $activeView === 'home'}
        <HomeV2 />
      {:else if $activeView === 'library'}
        <LibraryV2 />
      {:else if $activeView === 'search'}
        <SearchV2 />
      {:else if $activeView === 'streamingalbum' && $ficheAlbumService}
        <!-- La fiche d'un album de STREAMING (#1361, #3626). `service` EN MÊME
             TEMPS que l'album : `AlbumDetailV2` n'apparie un album distant que
             sur la paire, et l'ouvrir sans son service le laisserait sur
             « Chargement… » pour toujours. -->
        <AlbumDetailV2
          album={{ id: null, title: $ficheAlbumService.titre,
                   source: $ficheAlbumService.service,
                   source_id: $ficheAlbumService.id } as any}
          service={$ficheAlbumService.service}
          onClose={fermerAlbumService} />
      {:else if $activeView === 'streamingartist'}
        <!-- La fiche d'un artiste de STREAMING (#3825). Écran à part entière,
             et pas un calque de la Recherche : « Lecture en cours » et la
             Bibliothèque doivent pouvoir y mener aussi (#3626, #1361). Sans
             cette route, `activeView` tomberait sur le repli « À venir » —
             le huitième « écrit, pas branché ». -->
        <ArtisteServiceV2 />
      {:else if $activeView === 'playlists'}
        <PlaylistsV2 />
      {:else if $activeView === 'settings'}
        <SettingsV2 />
      {:else if $activeView === 'radios'}
        <RadiosV2 />
      {:else if $activeView === 'podcasts'}
        <PodcastsV2 />
      {:else if $activeView === 'queue'}
        <QueueV2 />
      {:else if $activeView === 'tv'}
        <!-- Le mode TV est un ÉCRAN à part entière : sans cette route, le
             bouton posait `activeView` sur une vue que la coquille ne connaît
             pas, et on tombait sur le repli « À venir ». `TvView` est autonome
             — il lit les magasins et ressort de lui-même vers la vue
             précédente. -->
        <TvView />
      {:else if $activeView === 'tags'}
        <EtiquettesV2 />
      {:else if $activeView === 'shortcuts'}
        <RaccourcisV2 />
      {:else if $activeView === 'favorites'}
        <FavoritesV2 />
      {:else if $activeView === 'zonemanager'}
        <ZonesV2 />
      {:else if $activeView === 'mediaservers'}
        <MediaServersV2 />
      {:else if $activeView === 'streaming'}
        <StreamingV2 />
      {:else if $activeView === 'crossfeed'}
        <CrossfeedV2 />
      {:else if $activeView === 'equalizer'}
        <EqualizerV2 />
      {:else if $activeView === 'diagnostics'}
        <TuneHealthV2 />
      {:else if $activeView === 'converter'}
        <ConverterV2 />
      {:else if $activeView === 'declick'}
        <DeclickV2 />
      {:else if $activeView === 'plugins'}
        <PluginsV2 />
      {:else if $activeView === 'metadata'}
        <MetadataV2 />
      {:else if $activeView === 'support'}
        <SupportV2 />
      {:else if $activeView === 'history'}
        <HistoriqueV2 />
      {:else if $activeView === 'oxygen'}
        <OxygenView />
      {:else if $activeView === 'ambiance'}
        <AmbianceView />
      {:else if $activeView === 'browse'}
        <!-- `onAddToPlaylist` non fournie : le bouton reste masque tant que la
             coquille v2 n'a pas sa propre fenetre de playlists. Mieux vaut un
             bouton absent qu'un bouton mort. -->
        <BrowseView />
      {:else if $activeView === 'collections'}
        <CollectionsV2 />
      {:else if $activeView === 'nowplaying'}
        <!-- `onAddToPlaylist` non fournie : le bouton « ajouter à une playlist »
             de cet écran reste masqué tant que la coquille v2 n'a pas sa propre
             fenêtre de playlists. Mieux vaut un bouton absent qu'un bouton mort. -->
        <NowPlaying tvDansLaCoquille />
      {:else}
        <div class="soon">
          <div class="badge">{$t('v2.shell.soon' as any)}</div>
          <h2>{label}</h2>
          <p>{$t('v2.shell.soonHint' as any)}</p>
        </div>
      {/if}
    </main>
  </div>
  <TransportBar />

  <!-- Le conteneur de dialogues : il ne dessine rien tant que personne ne
       demande. Place ICI, au premier niveau de la coquille, pour couvrir tous
       les ecrans qu'elle monte. -->
  <DialogContainer />

  <!-- Les BANDEAUX. Même raison, même endroit que les dialogues : sans lui,
       `notifications.error()` écrit dans un magasin que personne ne rend, et
       un échec de lecture ne produit rigoureusement rien (#3732). -->
  <ToastContainer />

  <!-- Voie MOBILE : la barre pose ce drapeau au lieu de changer de vue.
       Personne ne l'écoutait ici. -->
  {#if $mobileNowPlayingOpen}
    <div class="np-overlay">
      <button class="np-close" onclick={() => mobileNowPlayingOpen.set(false)} aria-label="Fermer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      <NowPlaying />
    </div>
  {/if}
</div>

<style>
  /* 🔴 `--v2-grappe-w` — la gouttière de la grappe — vit dans
     `src/styles/tune-v2.css`, avec les autres jetons. Elle était ici, dans un
     style de COMPOSANT : `check-jetons-css` ne balaie que `src/styles/` et
     déclarait donc le jeton « défini nulle part » pour les vingt-quatre écrans
     qui l'emploient. Un jeton absent n'échoue pas — la déclaration est ignorée
     en silence — c'est-à-dire exactement la panne qu'on vient de corriger, et
     que la porte savait annoncer. */
  .v2-shell{--maj-h:42px; position:relative; display:flex; flex-direction:column; height:100vh; background:var(--v2-bg); overflow:hidden}
  /* Avatar unique de l'application : pincé en haut à droite de l'écran, au-dessus
     de toutes les vues (y compris les overlays de fiche). */
  .av-tr{position:absolute; top:20px; right:30px; z-index:80; display:flex; align-items:center; gap:10px}
  /* La grappe est en ABSOLU : la bannière du flux ne la pousse pas toute
     seule, il faut le lui dire — sinon les trois ronds se posent dessus. */
  .avec-maj .av-tr{top:calc(20px + var(--maj-h))}
  /* Bannière de mise à jour. Les deux moitiés sont des BOUTONS : le texte mène
     aux Réglages, la croix masque l'annonce pour cette version-là. */
  .maj{flex:0 0 var(--maj-h); display:flex; align-items:center; gap:10px;
    padding:0 30px; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2));
    color:var(--v2-on-acc); font-family:var(--v2-sans)}
  .maj-txt{flex:1; min-width:0; border:0; background:transparent; color:inherit; cursor:pointer;
    text-align:left; font:600 13px var(--v2-sans);
    /* La grappe avatar/signet vit au-dessus du bord droit : le texte s'arrête
       avant, sinon la fin de la phrase passe sous les ronds. */
    padding:0 150px 0 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .maj-txt:hover{text-decoration:underline}
  .maj-x{flex:0 0 auto; width:26px; height:26px; border:0; border-radius:50%; cursor:pointer;
    background:rgba(255,255,255,.18); color:inherit; font-size:18px; line-height:1;
    display:grid; place-items:center}
  .maj-x:hover{background:rgba(255,255,255,.32)}
  /* Le bouton d'origine de « Lecture en cours » est MASQUÉ ici : la grappe
     ci-dessus le porte, aligné avec le signet et l'avatar. L'écran actuel, lui,
     garde le sien — il n'a rien à cet endroit. */
  :global(.np-tv-btn) { display: none; }
  .raccourci{width:32px; height:32px; border:0; border-radius:50%; background:var(--v2-surface2);
    color:var(--v2-txt3); display:grid; place-items:center; cursor:pointer; transition:.15s}
  .raccourci:hover{color:var(--v2-acc1); background:var(--v2-hover)}
  .raccourci svg{width:16px; height:16px}
  /* La loupe reprise du client actuel se dessine en 36 px sur fond
     transparent. Dans la grappe elle voisinerait deux ronds pleins de 32 px :
     on l'aligne sur eux plutôt que de la laisser dépasser. */
  .av-tr :global(.search-icon-btn){width:32px; height:32px; background:var(--v2-surface2);
    color:var(--v2-txt3)}
  .av-tr :global(.search-icon-btn:hover){color:var(--v2-acc1); background:var(--v2-hover)}
  .av-tr :global(.search-icon-btn svg){width:16px; height:16px}
  /* Le voile d'arrière-plan part de `--sidebar-width` (280 px), la largeur de
     la barre latérale du client ACTUEL. Celle du v2 fait 236 px, et 72 px une
     fois repliée : le voile laisserait une bande claire au milieu de l'écran.
     La recherche est globale, le voile l'est aussi — `left:0`, sans nombre à
     tenir à jour quand la barre se replie. */
  .av-tr :global(.search-overlay){left:0}
  .rc-fond{position:fixed; inset:0; z-index:90; background:rgba(0,0,0,.45); display:grid; place-items:center; padding:20px}
  .rc{display:flex; flex-direction:column; gap:10px; width:min(360px,100%); padding:20px;
    background:var(--v2-surface); border:1px solid var(--v2-line2); border-radius:var(--v2-r-card)}
  .rc label{font:600 11px var(--v2-mono); letter-spacing:.06em; text-transform:uppercase; color:var(--v2-txt3)}
  .rc input{background:var(--v2-bg); border:1px solid var(--v2-line2); border-radius:8px; color:var(--v2-txt);
    font:inherit; font-size:13.5px; padding:9px 11px}
  .rc button{border:0; border-radius:8px; background:var(--v2-acc1); color:var(--v2-on-acc);
    font:600 13px var(--v2-sans); padding:9px 14px; cursor:pointer}
  .rc button:disabled{opacity:.5; cursor:default}
  /* `auto` et non une largeur fixe : la barre laterale se replie (72 px) et
     la colonne doit suivre, sinon le repli laisse une bande vide. C'est la
     barre qui porte sa largeur, pas la grille.

     Classe `v2-row` et non `row` : une regle GLOBALE non scopee `.row{gap:20px}`
     de l'app historique s'appliquait a notre grille et inserait 20 px entre la
     barre et la vue. Mesure par CDP (getMatchedStyles) avant renommage. Un nom
     generique dans une app a CSS partage est un piege — on le retire au lieu
     de gagner une bataille de specificite avec `gap:0`. */
  .v2-row{flex:1; min-height:0; display:grid; grid-template-columns:auto 1fr; gap:0;
    /* La RANGEE doit valoir la hauteur du conteneur, pas celle du contenu.
       Sans `minmax(0,1fr)` la rangee implicite est auto-dimensionnee sur le
       plus grand enfant : mesure, la ligne faisait 887 px mais sa rangee
       947 px, si bien que la vue debordait de 60 px PAR-DESSUS la barre de
       transport et masquait les commandes de lecture. */
    grid-template-rows:minmax(0, 1fr)}
  /* `.main` est un conteneur flex ; sans `flex:1` ses enfants se dimensionnent
     a leur CONTENU et laissent le reste vide. Mesure avant correction sur
     1990 px : zone principale 1754 px, ecran Bibliotheque 1139 px — 615 px
     perdus a droite. `:global` parce que l'ecran est un composant enfant :
     le style scope de la coquille ne l'atteindrait pas. */
  /* 🔴 `position:relative` — SANS LUI LA FICHE D'ALBUM MANGE LE LECTEUR.
     Sandro, fil forum 1740, 09/09/2026 : « À l'ouverture de l'album, la barre
     de lecture située en bas de l'écran disparaît complètement. »

     `AlbumDetailV2` (et les autres calques d'écran) posent
     `position:absolute; inset:0`. Sans ancêtre positionné ici, ce `inset:0`
     remontait jusqu'à `.v2-shell` — la coquille ENTIÈRE — et recouvrait donc
     `<TransportBar />`, qui est pourtant son FRÈRE dans la mise en page.
     Le calque est désormais borné à la zone de contenu, et la barre reste. */
  .main{min-width:0; overflow:hidden; display:flex; position:relative}

  /* ---- PETIT ÉCRAN ----------------------------------------------------
     La rangée n'a plus qu'UNE colonne : la barre latérale est passée en
     `position:fixed` (voir `Sidebar`), elle ne prend donc plus de place dans
     la grille. Sans cette règle, la colonne `auto` resterait à sa largeur et
     laisserait un vide à gauche de la vue. */
  @media (max-width: 760px){
    .v2-row{grid-template-columns:1fr}
  }
  /* La grappe passe AU-DESSUS du voile : le bouton qui ouvre le tiroir doit
     rester atteignable pour le refermer. */
  @media (max-width: 760px){
    .av-tr{z-index:121; top:14px; right:14px}
  }
  /* `min-height:0` est INDISPENSABLE, pas cosmetique : un element flex a
     `min-height:auto` par defaut et refuse de retrecir sous la taille de son
     contenu. Sans lui, la section debordait de 60 px sous sa ligne et sa
     grille se dessinait PAR-DESSUS la barre de transport, masquant les
     commandes de lecture. Mesure : ligne 0->887, section 0->947. */
  .main > :global(*){flex:1 1 auto; min-width:0; min-height:0}
  .soon{flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px;
    text-align:center; color:var(--v2-txt); font-family:var(--v2-sans); padding:40px}
  .soon .badge{font:700 10px var(--v2-mono); letter-spacing:.16em; text-transform:uppercase; color:var(--v2-on-acc);
    background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); padding:5px 12px; border-radius:999px}
  .soon h2{font-size:28px; font-weight:800}
  .soon p{max-width:420px; color:var(--v2-txt2); font-size:14px; line-height:1.5}
  /* 🔴 122, et non 120 : AU-DESSUS de la grappe.
     
     Sur petit écran la grappe passe à `z-index:121` pour rester atteignable
     par-dessus le voile du tiroir (voir plus haut). Effet de bord non voulu :
     elle passait aussi au-dessus de « Lecture en cours », qui valait 120 — dans
     une webapp Safari, le menu Profil s'ouvrait donc PAR-DESSUS la file
     d'attente (Alex Campbell, 08/09/2026, « Profile options cover the queue »).
     
     « Lecture en cours » est un plein écran modal avec son propre bouton de
     fermeture (`.np-close`) : rien n'a de raison d'y flotter au-dessus, et le
     bouton de tiroir n'y sert pas — il n'y a pas de tiroir à ouvrir depuis là. */
  .np-overlay{position:fixed; inset:0; z-index:122; background:var(--v2-bg); display:flex; flex-direction:column}
  .np-close{position:absolute; top:12px; left:12px; z-index:1; width:40px; height:40px; border:0; border-radius:50%;
    background:var(--v2-surface); color:var(--v2-txt2); cursor:pointer; display:grid; place-items:center}
  .np-close svg{width:22px; height:22px}
</style>
