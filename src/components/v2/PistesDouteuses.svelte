<script lang="ts">
  import type { PisteDouteuse } from '../../lib/artisteDepuisChemin';
  import { formatNombre } from '../../lib/formats';
  import { t } from '../../lib/i18n';

  let { pistes }: { pistes: PisteDouteuse[] } = $props();
  let limite = $state(50);
  let visibles = $derived(pistes.slice(0, limite));

  function cleRaison(raison: string) {
    switch (raison) {
      case 'missing_artist': return 'v2.meta.dReasonArtist';
      case 'missing_album': return 'v2.meta.dReasonAlbum';
      case 'very_short': return 'v2.meta.dReasonShort';
      default: return 'v2.meta.dReasonOther';
    }
  }
</script>

<section class="pistes-douteuses" aria-label={$t('v2.meta.dTracks' as any)}>
  <h3>{$t('v2.meta.dTracks' as any)}</h3>
  <ol>
    {#each visibles as piste (piste.id)}
      {@const raisons = piste.reasons?.length ? piste.reasons : ['unknown']}
      <li data-piste-id={piste.id}>
        <strong>{piste.title || '—'}</strong>
        <span class="chemin">{piste.file_path || $t('v2.meta.dNoPath' as any)}</span>
        <span class="raisons">{raisons.map((raison) => $t(cleRaison(raison) as any)).join(' · ')}</span>
      </li>
    {/each}
  </ol>
  <div class="suite">
    <span aria-live="polite">{$formatNombre(visibles.length)} / {$formatNombre(pistes.length)}</span>
    {#if visibles.length < pistes.length}
      <button type="button" onclick={() => (limite += 50)}>
        {$t('common.showMore')} ({$formatNombre(Math.min(50, pistes.length - visibles.length))})
      </button>
    {/if}
  </div>
</section>

<style>
  .pistes-douteuses{margin:16px 0 22px; border:1px solid var(--v2-line2); border-radius:10px; padding:14px}
  h3{margin:0 0 10px; font:600 calc(14px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt)}
  ol{list-style:none; margin:0; padding:0}
  li{display:flex; flex-direction:column; gap:4px; padding:10px 0; border-bottom:1px solid var(--v2-line2); min-width:0}
  strong{font:600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt); overflow-wrap:anywhere}
  .chemin{font:calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3); overflow-wrap:anywhere}
  .raisons{font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt2)}
  .suite{display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin-top:12px; font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt3)}
  button{border:1px solid var(--v2-line2); border-radius:8px; background:transparent; color:var(--v2-txt); padding:7px 12px; font:600 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); cursor:pointer}
  button:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:2px}
</style>
