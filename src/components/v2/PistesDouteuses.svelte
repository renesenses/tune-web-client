<script lang="ts">
  import type { PisteDouteuse } from '../../lib/artisteDepuisChemin';
  import * as api from '../../lib/api';
  import { formatNombre } from '../../lib/formats';
  import { t } from '../../lib/i18n';

  /** `onEcrit` reçoit le bilan : c'est le parent qui l'affiche, la liste
   *  relue pouvant ne plus contenir ce composant (#8679). */
  /*  `onIgnorer` — renesenses/tune-server-rust#8958 : « C'est normal » sur une
   *  alerte. Le parent appelle le serveur et relit la liste. */
  /*  `onIgnorerAlbum` — renesenses/tune-server-rust#9028 : « Normal pour les
   *  N pistes de cet album », après une confirmation DANS la page qui liste
   *  les pistes concernées (aperçu du serveur). */
  let { pistes, onEcrit, onIgnorer, onIgnorerAlbum }: {
    pistes: PisteDouteuse[];
    onEcrit?: (bilan: string) => void | Promise<void>;
    onIgnorer?: (piste: PisteDouteuse, raison: string) => void | Promise<void>;
    onIgnorerAlbum?: (albumId: number, raison: string, trackIds: number[], albumTitle: string) => void | Promise<void>;
  } = $props();
  let ignorant = $state<string | null>(null);

  async function ignorer(piste: PisteDouteuse, raison: string) {
    if (ignorant || !onIgnorer) return;
    ignorant = `${piste.id}:${raison}`;
    try { await onIgnorer(piste, raison); } finally { ignorant = null; }
  }

  /** La portée annoncée par le serveur ; sans elle (serveur ancien), pas de geste. */
  function porteeDe(piste: PisteDouteuse, raison: string): 'track' | 'album' | null {
    return onIgnorer ? (piste.ignore_scopes?.[raison] ?? null) : null;
  }
  let limite = $state(50);
  let visibles = $derived(pistes.slice(0, limite));

  /*
    renesenses/tune-server-rust#9028 — les alertes REGROUPÉES PAR ALBUM :
    deux pistes visibles ou plus du même album forment un bloc titré par
    l'album, pour que la portée d'un geste groupé se voie (demande du
    testeur, fil 2685). Ordre : celui de la première piste de chaque album.
  */
  type Bloc =
    | { cle: string; piste: PisteDouteuse }
    | { cle: string; albumId: number; titre: string; pistes: PisteDouteuse[] };
  let blocs = $derived.by(() => {
    const parAlbum = new Map<number, PisteDouteuse[]>();
    for (const p of visibles) {
      if (p.album_id == null || !p.album_title?.trim()) continue;
      const l = parAlbum.get(p.album_id);
      if (l) l.push(p); else parAlbum.set(p.album_id, [p]);
    }
    const vus = new Set<number>();
    const out: Bloc[] = [];
    for (const p of visibles) {
      const groupe = p.album_id != null ? parAlbum.get(p.album_id) : undefined;
      if (groupe && groupe.length > 1) {
        if (vus.has(p.album_id!)) continue;
        vus.add(p.album_id!);
        out.push({ cle: `a${p.album_id}`, albumId: p.album_id!, titre: p.album_title!, pistes: groupe });
      } else {
        out.push({ cle: `p${p.id}`, piste: p });
      }
    }
    return out;
  });

  /** Les raisons qu'un geste groupé peut couvrir dans le bloc : mémorisées
   *  piste par piste (`track`) et portées par au moins deux de ses pistes.
   *  Un artiste manquant se mémorise déjà pour tout l'album (#8958). */
  function raisonsGroupees(groupe: PisteDouteuse[]): { raison: string; nombre: number }[] {
    if (!onIgnorerAlbum) return [];
    const compte = new Map<string, number>();
    for (const p of groupe) {
      for (const r of p.reasons ?? []) {
        if (r === 'missing_album' || p.ignore_scopes?.[r] !== 'track') continue;
        compte.set(r, (compte.get(r) ?? 0) + 1);
      }
    }
    return [...compte].filter(([, n]) => n > 1).map(([raison, nombre]) => ({ raison, nombre }));
  }

  /** La confirmation en cours (une à la fois), avec l'aperçu du serveur. */
  let confirmation = $state<{
    albumId: number; titre: string; raison: string;
    apercu: api.ApercuAlerteAlbum | null; erreur: string | null;
  } | null>(null);
  let groupeOccupe = $state(false);

  async function preparerAlbum(albumId: number, titre: string, raison: string) {
    if (groupeOccupe) return;
    confirmation = { albumId, titre, raison, apercu: null, erreur: null };
    try {
      const apercu = await api.apercuAlerteAlbum(albumId, raison);
      if (confirmation?.albumId === albumId && confirmation.raison === raison) confirmation.apercu = apercu;
    } catch (e: any) {
      if (confirmation?.albumId === albumId) confirmation.erreur = e?.message ?? $t('v2.meta.dIgnoreFailed' as any);
    }
  }

  async function confirmerAlbum() {
    const c = confirmation;
    if (!c?.apercu?.tracks.length || groupeOccupe || !onIgnorerAlbum) return;
    groupeOccupe = true;
    try {
      await onIgnorerAlbum(c.albumId, c.raison, c.apercu.tracks.map((x) => x.id), c.apercu.album_title || c.titre);
      confirmation = null;
    } catch (e: any) {
      if (confirmation) confirmation.erreur = e?.message ?? $t('v2.meta.dIgnoreFailed' as any);
    } finally {
      groupeOccupe = false;
    }
  }

  function duree(ms: number) {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

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

{#snippet lignePiste(piste: PisteDouteuse)}
  {@const raisons = piste.reasons?.length ? piste.reasons : ['unknown']}
  <li data-piste-id={piste.id}>
    <strong>{piste.title || '—'}</strong>
    <span class="chemin">{piste.file_path || $t('v2.meta.dNoPath' as any)}</span>
    {#if piste.reasons?.length && piste.reasons.some((r) => porteeDe(piste, r))}
      <!-- tune-server-rust#8958 — une alerte par ligne, chacune avec son
           « C'est normal » : piste, ou tout l'album selon sa nature. -->
      <ul class="raisons alertes">
        {#each piste.reasons as raison (raison)}
          {@const portee = porteeDe(piste, raison)}
          <li data-raison={raison}>
            <span>{texteRaison(piste, raison)}</span>
            {#if portee}
              <button type="button" class="normal" data-portee={portee}
                disabled={ignorant != null}
                onclick={() => ignorer(piste, raison)}>
                {$t((portee === 'album' ? 'v2.meta.dIgnoreAlbum' : 'v2.meta.dIgnoreTrack') as any)}
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <span class="raisons">{raisons.map((raison) => texteRaison(piste, raison)).join(' · ')}</span>
    {/if}
    {#if dossierDe(piste)}
      <button type="button" class="ligne" disabled={occupe} onclick={() => ecrire([piste.id])}>
        {$t('v2.meta.dFolderWrite' as any)}
      </button>
    {/if}
  </li>
{/snippet}

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
    {#each blocs as bloc (bloc.cle)}
      {#if 'piste' in bloc}
        {@render lignePiste(bloc.piste)}
      {:else}
        {@const groupees = raisonsGroupees(bloc.pistes)}
        <!-- tune-server-rust#9028 — un album, ses pistes signalées, et le
             geste groupé (après confirmation dans la page). -->
        <li class="album" data-album-id={bloc.albumId}>
          <div class="album-tete">
            <strong>{$t('v2.meta.dAlbumGroup' as any).replace('{album}', bloc.titre)}</strong>
            <span class="raisons">{$t('v2.meta.dAlbumGroupCount' as any).replace('{count}', $formatNombre(bloc.pistes.length))}</span>
          </div>
          {#each groupees as g (g.raison)}
            <div class="album-geste" data-raison-album={g.raison}>
              <span>{$t(cleRaison(g.raison) as any)}</span>
              <button type="button" class="normal-album"
                disabled={groupeOccupe || ignorant != null}
                onclick={() => preparerAlbum(bloc.albumId, bloc.titre, g.raison)}>
                {$t('v2.meta.dIgnoreAlbumN' as any).replace('{count}', $formatNombre(g.nombre))}
              </button>
            </div>
          {/each}
          {#if confirmation && confirmation.albumId === bloc.albumId}
            {@const c = confirmation}
            <div class="confirmer" role="group" aria-label={$t('v2.meta.dIgnoreAlbumConfirmLabel' as any)} data-confirmer-album>
              {#if c.erreur}
                <p class="erreur" role="alert">{c.erreur}</p>
              {:else if !c.apercu}
                <p aria-live="polite">{$t('v2.tool.loading' as any)}</p>
              {:else if !c.apercu.tracks.length}
                <p aria-live="polite">{$t('v2.meta.dIgnoreAlbumNone' as any)}</p>
              {:else}
                <p aria-live="polite">
                  {$t('v2.meta.dIgnoreAlbumPreview' as any)
                    .replace('{count}', $formatNombre(c.apercu.total))
                    .replace('{album}', c.apercu.album_title || c.titre)
                    .replace('{reason}', $t(cleRaison(c.raison) as any))}
                </p>
                {#if c.apercu.folder}<p class="chemin">{c.apercu.folder}</p>{/if}
                <ul class="pistes-album">
                  {#each c.apercu.tracks as x (x.id)}
                    <li data-apercu-piste={x.id}>{x.title || '—'} <span>({duree(x.duration_ms)})</span></li>
                  {/each}
                </ul>
              {/if}
              <div class="gestes">
                {#if c.apercu?.tracks.length}
                  <button type="button" class="go" disabled={groupeOccupe} onclick={confirmerAlbum}>
                    {$t('v2.meta.dIgnoreAlbumConfirm' as any).replace('{count}', $formatNombre(c.apercu.total))}
                  </button>
                {/if}
                <button type="button" disabled={groupeOccupe} onclick={() => (confirmation = null)}>{$t('v2.tool.cancel' as any)}</button>
              </div>
            </div>
          {/if}
          <ol>
            {#each bloc.pistes as piste (piste.id)}
              {@render lignePiste(piste)}
            {/each}
          </ol>
        </li>
      {/if}
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
  ul.alertes{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:4px}
  ul.alertes li{flex-direction:row; flex-wrap:wrap; align-items:center; gap:4px 10px; padding:0; border:0}
  button.normal{padding:3px 10px; font-weight:500; color:var(--v2-txt2); align-self:auto}
  button.normal:hover:not(:disabled){color:var(--v2-txt); border-color:var(--v2-acc2)}
  /* tune-server-rust#9028 — un album et ses pistes signalées. */
  li.album{gap:8px; padding:12px 0}
  li.album > ol{padding-left:14px; border-left:2px solid var(--v2-line2)}
  li.album > ol > li:last-child{border-bottom:0}
  .album-tete{display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 10px}
  .album-geste{display:flex; flex-wrap:wrap; align-items:center; gap:4px 10px; font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt2)}
  button.normal-album{padding:3px 10px; border-color:var(--v2-acc2); align-self:auto}
  .confirmer{display:flex; flex-direction:column; gap:6px; padding:10px 12px; border:1px solid var(--v2-acc2); border-radius:8px}
  .confirmer p{margin:0; font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt2)}
  .confirmer .erreur{color:var(--v2-danger, #c0392b)}
  .pistes-album{list-style:none; margin:0; padding:0; display:flex; flex-wrap:wrap; gap:2px 14px}
  .pistes-album li{display:inline; padding:0; border:0; font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt)}
  .pistes-album span{color:var(--v2-txt3)}
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
