<script lang="ts">
  /**
   * DÉMO — choisit le rendu : `?vue=avant` monte le VRAI `CircleV2` de main
   * (nourri par le bouchon `fetch`), `?vue=apres` la mise en page de démo.
   * `?onglet=decouvrir|messages|playlists|cercle` choisit l'onglet de la démo.
   */
  import CircleV2 from '../../components/v2/CircleV2.svelte';
  import DemoCercleLevente from './DemoCercleLevente.svelte';
  const q = new URLSearchParams(location.search);
  const vue = q.get('vue') === 'avant' ? 'avant' : 'apres';
  const o = q.get('onglet');
  const onglet = (['decouvrir', 'messages', 'playlists', 'cercle'] as const).find((x) => x === o) ?? 'decouvrir';
</script>

{#if vue === 'avant'}
  <div class="tune-v2 cadre-avant"><CircleV2 /></div>
{:else}
  <DemoCercleLevente ongletInitial={onglet} />
{/if}

<style>
  .cadre-avant{min-height:100vh; background:var(--v2-bg); color:var(--v2-txt); font-family:var(--v2-sans)}
</style>
