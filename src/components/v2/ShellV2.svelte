<script lang="ts">
  /**
   * Coquille du nouveau client (direction Levente) : assemble la barre
   * latérale à niveaux, la vue principale et le lecteur. Portée `.tune-v2`.
   *
   * Pour l'instant la vue principale est la Bibliothèque ; le routage complet
   * (activeView → composant) viendra quand le nouveau client remplacera l'app.
   */
  import Sidebar from './Sidebar.svelte';
  import LibraryV2 from './LibraryV2.svelte';
  import PlayerV2 from './PlayerV2.svelte';
  import '../../styles/tune-v2.css';
</script>

<div class="v2-shell tune-v2">
  <div class="row">
    <Sidebar />
    <main class="main"><LibraryV2 /></main>
  </div>
  <PlayerV2 />
</div>

<style>
  .v2-shell{display:flex; flex-direction:column; height:100vh; background:var(--v2-bg); overflow:hidden}
  .row{flex:1; min-height:0; display:grid; grid-template-columns:236px 1fr}
  .main{min-width:0; overflow:hidden}
</style>
