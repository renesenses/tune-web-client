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
  import PlayerV2 from './PlayerV2.svelte';
  import AvatarMenu from './AvatarMenu.svelte';
  import '../../styles/tune-v2.css';

  const LABELS: Partial<Record<View, string>> = {
    home: 'Accueil', radios: 'Radio', playlists: 'Playlists', search: 'Recherche',
    podcasts: 'Podcasts', streaming: 'Streaming', queue: "File d'attente", favorites: 'Favoris',
    zonemanager: 'Zones', equalizer: 'Égaliseur / DSP', converter: 'Convertisseur',
    declick: 'Déclic', metadata: 'Métadonnées', plugins: 'Extensions',
    diagnostics: 'Diagnostics', settings: 'Réglages', support: 'Support', genres: 'Genres',
  };
  const label = $derived(LABELS[$activeView] ?? $activeView);
</script>

<div class="v2-shell tune-v2">
  <div class="av-tr"><AvatarMenu /></div>

  <div class="row">
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
  .row{flex:1; min-height:0; display:grid; grid-template-columns:236px 1fr}
  .main{min-width:0; overflow:hidden; display:flex}
  .soon{flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px;
    text-align:center; color:var(--v2-txt); font-family:var(--v2-sans); padding:40px}
  .soon .badge{font:700 10px var(--v2-mono); letter-spacing:.16em; text-transform:uppercase; color:#04121a;
    background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); padding:5px 12px; border-radius:999px}
  .soon h2{font-size:28px; font-weight:800}
  .soon p{max-width:420px; color:var(--v2-txt2); font-size:14px; line-height:1.5}
</style>
