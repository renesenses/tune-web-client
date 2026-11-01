<script lang="ts">
  /**
   * La mini-barre de lecture, au-dessus des onglets, hors de l'onglet
   * Écouter (maquette A4/A5) : ce qui joue, la file, lecture/pause. Un clic
   * sur la piste ramène à Écouter.
   */
  import AlbumArt from '../../partages/AlbumArt.svelte';
  import { activeView } from '../../../lib/stores/navigation';
  import { currentZone } from '../../../lib/stores/zones';
  import { currentTrack, playbackState, seekPositionMs } from '../../../lib/stores/nowPlaying';
  import * as controls from '../../../lib/playback-controls';
  import { feuilleMini } from '../../../lib/vueMini';
  import { t } from '../../../lib/i18n';
  import { bulleTexte } from '../../../lib/infobulleTexte';

  const piste = $derived($currentTrack);
  const enLecture = $derived($playbackState === 'playing');
  const duree = $derived(piste && piste.source !== 'radio' ? (piste.duration_ms ?? 0) : 0);
  const pourcent = $derived(duree ? Math.min(100, ($seekPositionMs / duree) * 100) : 0);
</script>

<div class="mbar" data-mini-barre>
  <div class="filet"><i style:width="{pourcent}%"></i></div>
  <button class="piste" onclick={() => activeView.set('nowplaying')} aria-label={$t('nav.nowplaying' as any)}>
    <span class="cv"><AlbumArt coverPath={piste?.cover_path ?? null} albumId={piste?.album_id ?? null}
      source={piste?.source ?? null} size={40} alt={piste?.title ?? ''} /></span>
    <span class="tx">
      <span class="t1" use:bulleTexte>{piste?.title ?? $t('mini.rienEnLecture' as any)}</span>
      {#if piste?.artist_name}<span class="t2" use:bulleTexte>{piste.artist_name}{piste.album_title ? ` · ${piste.album_title}` : ''}</span>{/if}
    </span>
  </button>
  <button class="act" onclick={() => feuilleMini.set('file')} aria-label={$t('nav.queue' as any)} data-ouvrir-file>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h12M4 12h12M4 18h8"/><path d="M17 15v6l4-3z" fill="currentColor"/></svg>
  </button>
  <button class="rond" onclick={() => controls.togglePlayPause($currentZone, piste, $playbackState)}
    aria-label={enLecture ? $t('mini.pause' as any) : $t('common.play' as any)} data-lecture-pause>
    {#if enLecture}
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
    {:else}
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
    {/if}
  </button>
</div>

<style>
  .mbar{position:relative; flex:0 0 58px; display:flex; align-items:center; gap:8px; padding:0 10px;
    background:var(--v2-player1); border-top:1px solid var(--v2-line); font-family:var(--v2-sans)}
  .filet{position:absolute; left:0; right:0; top:-1px; height:2px; background:var(--v2-line2)}
  .filet i{display:block; height:100%; background:var(--v2-acc1)}
  .piste{flex:1; min-width:0; display:flex; align-items:center; gap:10px; border:0; background:none; padding:0;
    cursor:pointer; text-align:left; color:var(--v2-txt)}
  .cv{width:40px; height:40px; flex:0 0 40px; border-radius:4px; overflow:hidden}
  .tx{min-width:0; display:flex; flex-direction:column}
  .t1{font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .t2{font-size:11.5px; color:var(--v2-txt2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .act{width:32px; height:32px; display:grid; place-items:center; border:0; background:none; color:var(--v2-txt2); cursor:pointer}
  .act svg{width:18px; height:18px}
  .rond{width:36px; height:36px; border-radius:50%; display:grid; place-items:center; border:0; cursor:pointer;
    background:var(--v2-surface); color:var(--v2-txt)}
  .rond svg{width:18px; height:18px}
</style>
