<script lang="ts">
  import type { PisteDouteuse } from '../../lib/artisteDepuisChemin';
  import * as api from '../../lib/api';
  import { formatNombre } from '../../lib/formats';
  import { t } from '../../lib/i18n';

  /** `onEcrit` reçoit le bilan : c'est le parent qui l'affiche, la liste
   *  relue pouvant ne plus contenir ce composant (#8679). */
  let { pistes, onEcrit }: { pistes: PisteDouteuse[]; onEcrit?: (bilan: string) => void | Promise<void> } = $props();
  let limite = $state(50);
  let visibles = $derived(pistes.slice(0, limite));

  // renesenses/tune-server-rust#8679 — l'artiste du dossier, quand la balise
  // manque : par ligne, ou pour toute la liste après un aperçu chiffré.
  let avecDossier = $derived(pistes.filter((p) => dossierDe(p)));
  let apercu = $state<api.ApercuArtisteDuDossier | null>(null);
  let occupe = $state(false);
  let erreur = $state<string | null>(null);

  function dossierDe(p: PisteDouteuse): string | null {
    return p.reasons?.includes('missing_artist') ? (p.folder_artist?.trim() || null) : null;
  }

  function cleRaison(raison: string) {
    switch (raison) {
      case 'missing_artist': return 'v2.meta.dReasonArtist';
      case 'missing_album': return 'v2.meta.dReasonAlbum';
      case 'very_short': return 'v2.meta.dReasonShort';
      default: return 'v2.meta.dReasonOther';
    }
  }

  function texteRaison(p: PisteDouteuse, raison: string) {
    const dossier = raison === 'missing_artist' ? dossierDe(p) : null;
    return dossier
      ? $t('v2.meta.dReasonArtistFolder' as any).replace('{name}', dossier)
      : $t(cleRaison(raison) as any);
  }

  function direBilan(b: api.BilanArtisteDuDossier) {
    const base = $t('v2.meta.dFolderDone' as any)
      .replace('{tracks}', $formatNombre(b.updated))
      .replace('{albums}', $formatNombre(b.albums_updated));
    const fichiers = b.file_writes_enabled
      ? $t('v2.meta.dFolderFilesQueued' as any).replace('{count}', $formatNombre(b.files_scheduled))
      : $t('fileWrites.savedInTuneOnly' as any);
    return `${base} ${fichiers}`;
  }

  async function ecrire(ids?: number[]) {
    if (occupe) return;
    occupe = true;
    erreur = null;
    try {
      const b = await api.ecrireArtisteDuDossier(ids);
      apercu = null;
      await onEcrit?.(direBilan(b));
    } catch (e: any) {
      erreur = e?.message ?? $t('v2.meta.dFolderFailed' as any);
    }
    occupe = false;
  }

  async function preparer() {
    if (occupe) return;
    occupe = true;
    erreur = null;
    try {
      apercu = await api.apercuArtisteDuDossier();
    } catch (e: any) {
      erreur = e?.message ?? $t('v2.meta.dFolderFailed' as any);
    }
    occupe = false;
  }
</script>

<section class="pistes-douteuses" aria-label={$t('v2.meta.dTracks' as any)}>
  <h3>{$t('v2.meta.dTracks' as any)}</h3>

  {#if avecDossier.length}
    <div class="dossier">
      {#if apercu}
        <p class="apercu" aria-live="polite">
          {$t('v2.meta.dFolderPreview' as any)
            .replace('{tracks}', $formatNombre(apercu.tracks))
            .replace('{names}', $formatNombre(apercu.artists.length))}
          {apercu.file_writes_enabled ? $t('v2.meta.dFolderFilesOn' as any) : $t('v2.meta.dFolderFilesOff' as any)}
        </p>
        {#if apercu.artists.length}
          <ul class="noms">
            {#each apercu.artists.slice(0, 12) as a (a.name)}
              <li>{a.name} <span>({$formatNombre(a.tracks)})</span></li>
            {/each}
            {#if apercu.artists.length > 12}<li>…</li>{/if}
          </ul>
        {/if}
        <div class="gestes">
          <button type="button" class="go" disabled={occupe || !apercu.tracks} onclick={() => ecrire()}>
            {$t('v2.meta.dFolderConfirm' as any).replace('{count}', $formatNombre(apercu.tracks))}
          </button>
          <button type="button" disabled={occupe} onclick={() => (apercu = null)}>{$t('v2.tool.cancel' as any)}</button>
        </div>
      {:else}
        <button type="button" class="tout" disabled={occupe} onclick={preparer}>
          {$t('v2.meta.dFolderAll' as any).replace('{count}', $formatNombre(avecDossier.length))}
        </button>
      {/if}
      {#if erreur}<p class="erreur" role="alert">{erreur}</p>{/if}
    </div>
  {/if}

  <ol>
    {#each visibles as piste (piste.id)}
      {@const raisons = piste.reasons?.length ? piste.reasons : ['unknown']}
      <li data-piste-id={piste.id}>
        <strong>{piste.title || '—'}</strong>
        <span class="chemin">{piste.file_path || $t('v2.meta.dNoPath' as any)}</span>
        <span class="raisons">{raisons.map((raison) => texteRaison(piste, raison)).join(' · ')}</span>
        {#if dossierDe(piste)}
          <button type="button" class="ligne" disabled={occupe} onclick={() => ecrire([piste.id])}>
            {$t('v2.meta.dFolderWrite' as any)}
          </button>
        {/if}
      </li>
    {/each}
  </ol>
  <div class="suite">
    <span aria-live="polite">{$formatNombre(visibles.length)} / {$formatNombre(pistes.length)}</span>
    {#if visibles.length < pistes.length}
      <button type="button" class="plus" onclick={() => (limite += 50)}>
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
  .raisons{font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt2); overflow-wrap:anywhere}
  .suite{display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin-top:12px; font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt3)}
  .dossier{display:flex; flex-direction:column; gap:8px; margin:0 0 12px}
  .dossier p{margin:0; font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt2)}
  .dossier .erreur{color:var(--v2-danger, #c0392b)}
  .noms{list-style:none; margin:0; padding:0; display:flex; flex-wrap:wrap; gap:4px 12px}
  .noms li{display:inline; padding:0; border:0; font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt)}
  .noms span{color:var(--v2-txt3)}
  .gestes{display:flex; flex-wrap:wrap; gap:8px}
  button{border:1px solid var(--v2-line2); border-radius:8px; background:transparent; color:var(--v2-txt); padding:7px 12px; font:600 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); cursor:pointer; align-self:flex-start}
  button.go{border-color:var(--v2-acc2)}
  button:disabled{opacity:.5; cursor:default}
  button:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:2px}
</style>
