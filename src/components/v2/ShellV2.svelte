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
  import { activeView, type View } from '../../lib/stores/navigation';
  import Sidebar from './Sidebar.svelte';
  import LibraryV2 from './LibraryV2.svelte';
  import HomeV2 from './HomeV2.svelte';
  import SearchV2 from './SearchV2.svelte';
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
  import { mobileNowPlayingOpen } from '../../lib/stores/navigation';
  import AvatarMenu from './AvatarMenu.svelte';
  import { addShortcut } from '../../lib/stores/shortcuts';
  import { notifications } from '../../lib/stores/notifications';
  import { t } from '../../lib/i18n';
  import { preferences } from '../../lib/stores/preferences';
  import { applyV2Theme } from '../../lib/v2Theme';
  import { bootstrapV2 } from '../../lib/v2Bootstrap';
  import { demarrerTransportV2 } from '../../lib/v2Live';
  import '../../styles/tune-v2.css';

  const LABELS: Partial<Record<View, string>> = {
    home: 'Accueil', radios: 'Radio', playlists: 'Playlists', search: 'Recherche',
    podcasts: 'Podcasts', streaming: 'Streaming', queue: "File d'attente", favorites: 'Favoris',
    zonemanager: 'Zones', mediaservers: 'Serveurs multimédia',
    equalizer: 'Égaliseur', crossfeed: 'Crossfeed', converter: 'Convertisseur',
    declick: 'Dé-ploc', metadata: 'Métadonnées', plugins: 'Extensions',
    diagnostics: 'Tune Health', settings: 'Réglages', support: 'Support', genres: 'Genres',
  };
  const label = $derived(LABELS[$activeView] ?? $activeView);

  // Le thème est posé sur <html> : les tokens s'appliquent alors à toutes les
  // racines .tune-v2, y compris celles imbriquées dans les vues.
  $effect(() => { applyV2Theme($preferences.v2Theme); });

  // Les stores partagés sont alimentés par App.svelte, que `?v2` ne monte
  // jamais : sans cet appel, zones/albums/appareils restent vides et toute
  // la coquille affiche des écrans vides trompeurs. Voir lib/v2Bootstrap.
  $effect(() => { bootstrapV2(); });
  // Le VIVANT, que `bootstrapV2` ne fait pas : WebSocket, rafraîchissement des
  // zones, minuteur de progression, répétition et aléatoire. Sans lui, la barre
  // de transport reste figée sur l'état du montage — elle n'est pas mal
  // branchée, personne ne l'alimente. Le retour arrête tout au démontage.
  $effect(() => demarrerTransportV2());

  /** Bascule vers le mode TV — plein écran puis vue dédiée, comme l'écran actuel. */
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

<div class="v2-shell tune-v2">
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
  <div class="av-tr">
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

  <div class="v2-row">
    <Sidebar />
    <main class="main">
      {#if $activeView === 'home'}
        <HomeV2 />
      {:else if $activeView === 'library'}
        <LibraryV2 />
      {:else if $activeView === 'search'}
        <SearchV2 />
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
      {:else if $activeView === 'collections'}
        <CollectionsV2 />
      {:else if $activeView === 'nowplaying'}
        <!-- `onAddToPlaylist` non fournie : le bouton « ajouter à une playlist »
             de cet écran reste masqué tant que la coquille v2 n'a pas sa propre
             fenêtre de playlists. Mieux vaut un bouton absent qu'un bouton mort. -->
        <NowPlaying />
      {:else}
        <div class="soon">
          <div class="badge">À venir</div>
          <h2>{label}</h2>
          <p>Cet écran sera redessiné dans la direction Levente. La navigation, la barre latérale à niveaux et le lecteur sont déjà en place autour de lui.</p>
        </div>
      {/if}
    </main>
  </div>
  <TransportBar />

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
  .v2-shell{position:relative; display:flex; flex-direction:column; height:100vh; background:var(--v2-bg); overflow:hidden}
  /* Avatar unique de l'application : pincé en haut à droite de l'écran, au-dessus
     de toutes les vues (y compris les overlays de fiche). */
  .av-tr{position:absolute; top:20px; right:30px; z-index:80; display:flex; align-items:center; gap:10px}
  /* Le bouton d'origine de « Lecture en cours » est MASQUÉ ici : la grappe
     ci-dessus le porte, aligné avec le signet et l'avatar. L'écran actuel, lui,
     garde le sien — il n'a rien à cet endroit. */
  :global(.np-tv-btn) { display: none; }
  .raccourci{width:32px; height:32px; border:0; border-radius:50%; background:var(--v2-surface2);
    color:var(--v2-txt3); display:grid; place-items:center; cursor:pointer; transition:.15s}
  .raccourci:hover{color:var(--v2-acc1); background:var(--v2-hover)}
  .raccourci svg{width:16px; height:16px}
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
  .main{min-width:0; overflow:hidden; display:flex}
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
  .np-overlay{position:fixed; inset:0; z-index:120; background:var(--v2-bg); display:flex; flex-direction:column}
  .np-close{position:absolute; top:12px; left:12px; z-index:1; width:40px; height:40px; border:0; border-radius:50%;
    background:var(--v2-surface); color:var(--v2-txt2); cursor:pointer; display:grid; place-items:center}
  .np-close svg{width:22px; height:22px}
</style>
