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
  import MetadataV2 from './MetadataV2.svelte';
  import SupportV2 from './SupportV2.svelte';
  import PlayerV2 from './PlayerV2.svelte';
  import AvatarMenu from './AvatarMenu.svelte';
  import { preferences } from '../../lib/stores/preferences';
  import { applyV2Theme } from '../../lib/v2Theme';
  import { bootstrapV2 } from '../../lib/v2Bootstrap';
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
</script>

<div class="v2-shell tune-v2">
  <div class="av-tr"><AvatarMenu /></div>

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
      {:else}
        <div class="soon">
          <div class="badge">À venir</div>
          <h2>{label}</h2>
          <p>Cet écran sera redessiné dans la direction Levente. La navigation, la barre latérale à niveaux et le lecteur sont déjà en place autour de lui.</p>
        </div>
      {/if}
    </main>
  </div>
  <PlayerV2 />
</div>

<style>
  .v2-shell{position:relative; display:flex; flex-direction:column; height:100vh; background:var(--v2-bg); overflow:hidden}
  /* Avatar unique de l'application : pincé en haut à droite de l'écran, au-dessus
     de toutes les vues (y compris les overlays de fiche). */
  .av-tr{position:absolute; top:20px; right:30px; z-index:80}
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
</style>
