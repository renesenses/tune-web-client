<script lang="ts">
  /**
   * L'onglet ÉCOUTER de la vue mini (maquette A1, validée le 31/10/2026).
   *
   * Pochette, titre, artiste et album cliquables, badge de format, PURE,
   * progression, transport et volume en dB. Rien n'est réécrit de ce qui
   * décide : le volume est `VolumeControl` tel quel (limites, verrous PURE,
   * refus de l'appareil compris), le transport est `playback-controls`, les
   * liens sont ceux de `NowPlaying` (`navigationMini`).
   */
  import AlbumArt from '../../partages/AlbumArt.svelte';
  import VolumeControl from '../../partages/VolumeControl.svelte';
  import { currentZone } from '../../../lib/stores/zones';
  import { currentTrack, playbackState, seekPositionMs } from '../../../lib/stores/nowPlaying';
  import { audiophileEnabled } from '../../../lib/stores/audiophile';
  import { isBrowserZone, browserSeek } from '../../../lib/stores/browserAudio';
  import * as controls from '../../../lib/playback-controls';
  import * as api from '../../../lib/api';
  import { formatCompactQuality, getQualityTier, getQualityTierColor, formatTime } from '../../../lib/utils';
  import { ouvrirAlbumMini, ouvrirArtisteMini, destinationAlbum, destinationArtisteMini } from '../../../lib/navigationMini';
  import { feuilleMini } from '../../../lib/vueMini';
  import { t } from '../../../lib/i18n';
  import { bulleTexte } from '../../../lib/infobulleTexte';

  let { replie = false }: { replie?: boolean } = $props();

  const zone = $derived($currentZone);
  const piste = $derived($currentTrack);
  const enLecture = $derived($playbackState === 'playing');
  const duree = $derived(piste && piste.source !== 'radio' ? (piste.duration_ms ?? 0) : 0);
  const pourcent = $derived(duree ? Math.min(100, ($seekPositionMs / duree) * 100) : 0);
  const qualite = $derived(piste ? formatCompactQuality(piste) : '');
  const teinte = $derived(piste ? getQualityTierColor(getQualityTier(piste)) : 'neutre');
  const lienAlbum = $derived(destinationAlbum(piste) !== null);
  const lienArtiste = $derived(destinationArtisteMini(piste) !== null);

  function chercherPosition(e: MouseEvent) {
    const z = $currentZone;
    if (!duree || !z?.id) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pos = Math.floor(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duree);
    seekPositionMs.set(pos);
    void api.seek(z.id, pos);
    if (isBrowserZone(z)) browserSeek(pos);
  }
</script>

<section class="ecouter" class:replie data-ecouter-mini>
  <div class="pochette">
    <AlbumArt coverPath={piste?.cover_path ?? null} albumId={piste?.album_id ?? null}
      source={piste?.source ?? null} size={replie ? 112 : 220} alt={piste?.title ?? ''} />
  </div>

  <div class="infos">
    <div class="titre" title={piste?.title ?? ''}>{piste?.title ?? $t('mini.rienEnLecture' as any)}</div>
    {#if piste}
      <div class="sous">
        {#if piste.artist_name}
          <button class="lien" use:bulleTexte disabled={!lienArtiste} onclick={() => ouvrirArtisteMini(piste)} data-lien-artiste>{piste.artist_name}</button>
        {/if}
        {#if piste.artist_name && piste.album_title}<span class="sep">·</span>{/if}
        {#if piste.album_title}
          <button class="lien" use:bulleTexte disabled={!lienAlbum} onclick={() => ouvrirAlbumMini(piste)} data-lien-album>{piste.album_title}</button>
        {/if}
      </div>
      <div class="badges">
        {#if qualite}<span class="q tier-{teinte}" data-badge-format>{qualite}</span>{/if}
        {#if $audiophileEnabled}<span class="pure" data-badge-pure>{$t('audiophile.pure' as any)}</span>{/if}
      </div>
    {/if}
  </div>

  {#if !replie}
    <div class="progression">
      <div class="barre" role="slider" tabindex="0" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.round(pourcent)} onclick={chercherPosition}
        onkeydown={() => {}} data-progression>
        <i style:width="{pourcent}%"></i>
      </div>
      <div class="temps"><span>{formatTime($seekPositionMs)}</span><span>{duree ? formatTime(duree) : ''}</span></div>
    </div>
  {/if}

  <div class="transport">
    <button class="tb" onclick={() => controls.skipPrevious(zone)} aria-label={$t('transport.previous' as any)} data-precedent>
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
    </button>
    <button class="lecture" onclick={() => controls.togglePlayPause(zone, piste, $playbackState)}
      aria-label={enLecture ? $t('mini.pause' as any) : $t('common.play' as any)} data-lecture-pause>
      {#if enLecture}
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
      {:else}
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
      {/if}
    </button>
    <button class="tb" onclick={() => controls.skipNext(zone)} aria-label={$t('transport.next' as any)} data-suivant>
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
    </button>
  </div>

  <div class="volume">
    <div class="vc"><VolumeControl enDb /></div>
    {#if !replie}
      <button class="tb petit" onclick={() => feuilleMini.set('file')} aria-label={$t('nav.queue' as any)} data-ouvrir-file>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h12M4 12h12M4 18h8"/><path d="M17 15v6l4-3z" fill="currentColor"/></svg>
      </button>
    {/if}
  </div>
</section>

<style>
  .ecouter{flex:1; min-height:0; overflow:auto; display:flex; flex-direction:column; align-items:center;
    gap:10px; padding:14px 18px 10px; font-family:var(--v2-sans); color:var(--v2-txt)}
  .pochette{width:220px; height:220px; border-radius:6px; overflow:hidden; flex:0 0 auto; box-shadow:var(--v2-sh-card)}
  .infos{width:100%; min-width:0; display:flex; flex-direction:column; gap:4px}
  .titre{font-size:17px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .sous{display:flex; align-items:baseline; gap:4px; min-width:0; font-size:13px; color:var(--v2-txt2)}
  .sep{flex:0 0 auto}
  .lien{border:0; background:none; padding:0; font:inherit; color:inherit; cursor:pointer; min-width:0;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-decoration:underline;
    text-decoration-color:var(--v2-line2); text-underline-offset:3px}
  .lien:hover:not(:disabled){color:var(--v2-txt)}
  .lien:disabled{cursor:default; text-decoration:none}
  .badges{display:flex; gap:6px; align-items:center; min-height:20px}
  .q{font:600 10.5px var(--v2-mono); padding:3px 7px; border-radius:4px}
  .q.tier-gold-max{color:#f59e0b; background:rgba(245,158,11,.15)}
  .q.tier-gold{color:#a78bfa; background:rgba(167,139,250,.12)}
  .q.tier-blue{color:#60a5fa; background:rgba(96,165,250,.1)}
  .q.tier-green{color:#34d399; background:rgba(52,211,153,.1)}
  .q.tier-gray{color:#f87171; background:rgba(248,113,113,.08)}
  .q.tier-neutre{color:var(--v2-txt2); background:var(--v2-surface)}
  .pure{font:700 10px var(--v2-sans); letter-spacing:.12em; padding:3px 7px; border-radius:4px;
    color:var(--v2-acc1); border:1px solid var(--v2-acc1)}
  .progression{width:100%; display:flex; flex-direction:column; gap:5px}
  .barre{height:6px; border-radius:3px; background:var(--v2-line2); cursor:pointer; overflow:hidden}
  .barre i{display:block; height:100%; background:linear-gradient(90deg,var(--v2-acc1),var(--v2-acc2))}
  .temps{display:flex; justify-content:space-between; font:500 10.5px var(--v2-mono); color:var(--v2-txt3)}
  .transport{display:flex; align-items:center; justify-content:center; gap:22px}
  .tb{width:36px; height:36px; display:grid; place-items:center; border:0; background:none; color:var(--v2-txt);
    border-radius:50%; cursor:pointer}
  .tb svg{width:20px; height:20px}
  .tb.petit{color:var(--v2-txt2); flex:0 0 auto}
  .tb:hover{background:var(--v2-hover)}
  .lecture{width:56px; height:56px; border-radius:50%; display:grid; place-items:center; border:0; cursor:pointer;
    color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .lecture svg{width:26px; height:26px}
  .volume{width:100%; display:flex; align-items:center; gap:6px}
  .vc{flex:1; min-width:0}

  /* Maquette C : 360 × 140. La pochette à gauche, le reste à droite. */
  .ecouter.replie{display:grid; grid-template-columns:112px 1fr; grid-template-rows:auto auto 1fr;
    align-items:center; column-gap:12px; row-gap:4px; padding:8px 10px; overflow:hidden}
  .replie .pochette{grid-row:1 / span 3; width:112px; height:112px}
  .replie .titre{font-size:14px}
  .replie .sous{font-size:12px}
  .replie .transport{justify-content:flex-start; gap:6px}
  .replie .lecture{width:36px; height:36px}
  .replie .lecture svg{width:18px; height:18px}
  .replie .tb{width:30px; height:30px}
  .replie .volume{grid-column:2}
</style>
