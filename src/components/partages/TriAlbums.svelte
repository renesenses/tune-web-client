<script lang="ts">
  /**
   * Le sélecteur de tri d'une liste d'albums : une clé, un sens.
   *
   * Un seul composant pour la recherche et la fiche artiste (Bertrand,
   * 16/09/2026), et la même forme que celui des dossiers (`CollectionsV2`,
   * `.tricol`) : deux sélecteurs qui se ressemblent sans être le même
   * finiraient par diverger. Il ne trie rien lui-même — `trierAlbums`
   * (lib) s'en charge, et c'est lui que les témoins éprouvent.
   *
   * `cles` restreint l'offre à l'écran : la fiche artiste n'a pas besoin de
   * « Artiste », la recherche a besoin de « Pertinence ».
   */
  import { t } from '../../lib/i18n';
  import { CLES_TRI_ALBUMS, LIBELLES_TRI_ALBUMS, type CleTriAlbums, type SensTri } from '../../lib/trierAlbums';

  let {
    cle = $bindable<CleTriAlbums>('pertinence'),
    sens = $bindable<SensTri>('asc'),
    cles = CLES_TRI_ALBUMS as readonly CleTriAlbums[],
  }: { cle?: CleTriAlbums; sens?: SensTri; cles?: readonly CleTriAlbums[] } = $props();
</script>

<label class="tricol">
  <span>{$t('v2.fav.sortBy' as any)}</span>
  <select value={cle} aria-label={$t('v2.fav.sortBy' as any)}
    onchange={(ev) => (cle = (ev.currentTarget as HTMLSelectElement).value as CleTriAlbums)}>
    {#each cles as k (k)}
      <option value={k}>{$t(LIBELLES_TRI_ALBUMS[k] as any)}</option>
    {/each}
  </select>
  <button class="sens" type="button" onclick={() => (sens = sens === 'asc' ? 'desc' : 'asc')}
    title={$t((sens === 'asc' ? 'common.ascending' : 'common.descending') as any)}
    aria-label={$t((sens === 'asc' ? 'common.ascending' : 'common.descending') as any)}>
    {#if sens === 'asc'}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>
    {:else}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M6 13l6 6 6-6"/></svg>
    {/if}
  </button>
</label>

<style>
  .tricol{display:inline-flex; align-items:center; gap:8px}
  .tricol span{font:9.5px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3)}
  .tricol select{height:30px; padding:0 8px; border:1px solid var(--v2-line2); border-radius:var(--v2-r-pill);
    background:var(--v2-surface2); color:var(--v2-txt2); font:12.5px inherit; cursor:pointer}
  .tricol select:hover{border-color:var(--v2-acc2); color:var(--v2-txt)}
  .sens{width:30px; height:30px; display:grid; place-items:center; padding:0;
    border:1px solid var(--v2-line2); border-radius:var(--v2-r-pill); background:var(--v2-surface2);
    color:var(--v2-txt2); cursor:pointer}
  .sens:hover{border-color:var(--v2-acc2); color:var(--v2-txt)}
  .sens svg{width:14px; height:14px}
</style>
