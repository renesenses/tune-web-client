<script lang="ts">
  /**
   * Lecture en cours, plein écran (première version) : grande pochette, titre,
   * artiste doré, album, qualité et sortie, progression et transport. Mêmes
   * gestes que la barre de lecture (`transportNocturne`).
   */
  import Play from '@lucide/svelte/icons/play';
  import Pause from '@lucide/svelte/icons/pause';
  import SkipBack from '@lucide/svelte/icons/skip-back';
  import SkipForward from '@lucide/svelte/icons/skip-forward';
  import Shuffle from '@lucide/svelte/icons/shuffle';
  import Repeat from '@lucide/svelte/icons/repeat';
  import Repeat1 from '@lucide/svelte/icons/repeat-1';
  import { t } from '../../lib/i18n';
  import { formatTime } from '../../lib/utils';
  import type { RepeatMode } from '../../lib/types';
  import { currentZone } from '../../lib/stores/zones';
  import { currentTrack, playbackState, seekPositionMs, shuffleEnabled } from '../../lib/stores/nowPlaying';
  import { repeatMode } from '../../lib/stores/repeatStore';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import BadgeQualiteNocturne from './BadgeQualiteNocturne.svelte';
  import { allerA } from './navigationNocturne';
  import {
    lecturePause, suivant, precedent, basculerAleatoire, reglerRepetition, chercherA, etiquetteSortie,
  } from './transportNocturne';

  const piste = $derived($currentTrack);
  const duree = $derived(piste?.duration_ms ?? 0);
  const position = $derived(Math.min($seekPositionMs, duree || $seekPositionMs));
  const ratio = $derived(duree > 0 ? Math.min(1, position / duree) : 0);
  const joue = $derived($playbackState === 'playing');
  const aleatoire = $derived($currentZone?.shuffle ?? $shuffleEnabled);
  const repetition = $derived<RepeatMode>($currentZone?.repeat ?? $repeatMode);
  const sortie = $derived(etiquetteSortie($currentZone));
  const LIBELLE_SORTIE = { tess: 'v2.nav.tess', bitPerfect: 'tess.badge.bit_perfect', transcode: 'signal.transcoded' } as const;

  function chercher(e: MouseEvent) {
    if (!duree) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    chercherA(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duree);
  }
  function chercherClavier(e: KeyboardEvent) {
    if (!duree) return;
    const pas = e.key === 'ArrowRight' ? 5000 : e.key === 'ArrowLeft' ? -5000 : 0;
    if (!pas) return;
    e.preventDefault();
    chercherA(Math.min(duree, position + pas));
  }
</script>

<article class="noc-lecture">
  {#if !piste}
    <p class="noc-vide">{$t('v2.queue.empty')}</p>
  {:else}
    <div class="noc-lecture-pochette">
      <AlbumArt coverPath={piste.cover_path} albumId={piste.album_id ?? null} size={0} alt={piste.title} source={piste.source ?? null} />
    </div>
    <div class="noc-lecture-infos">
      <span class="noc-surtitre">{$t('nav.nowplaying')}{$currentZone ? ` · ${$currentZone.name}` : ''}</span>
      <h1 title={piste.title}>{piste.title}</h1>
      {#if piste.artist_name}
        <button type="button" class="noc-lien-artiste" onclick={() => piste?.artist_id != null && allerA({ nom: 'artiste', id: piste.artist_id })}>{piste.artist_name}</button>
      {/if}
      {#if piste.album_title}
        <button type="button" class="noc-lecture-album" onclick={() => piste?.album_id != null && allerA({ nom: 'album', id: piste.album_id })}>{piste.album_title}</button>
      {/if}
      <div class="noc-lecture-qualite">
        <BadgeQualiteNocturne format={piste.format} sample_rate={piste.sample_rate} bit_depth={piste.bit_depth} source={piste.source ?? null} complet />
        {#if sortie}<span class="noc-sortie" data-sortie={sortie}>{$t(LIBELLE_SORTIE[sortie])}</span>{/if}
      </div>

      <div class="noc-lecture-progression">
        <div class="noc-lecture-rail" role="slider" tabindex="0" aria-label={$t('v2.album.fiche.duration')}
          aria-valuemin={0} aria-valuemax={Math.round(duree / 1000)} aria-valuenow={Math.round(position / 1000)}
          onclick={chercher} onkeydown={chercherClavier}>
          <div class="noc-lecture-rempli" style:width={`${ratio * 100}%`}></div>
        </div>
        <div class="noc-lecture-temps"><span>{formatTime(position)}</span><span>{duree ? `-${formatTime(duree - position)}` : ''}</span></div>
      </div>

      <div class="noc-lecture-transport">
        <button type="button" class="noc-t" class:actif={aleatoire} aria-pressed={aleatoire} onclick={basculerAleatoire}
          aria-label={aleatoire ? $t('transport.shuffleOn') : $t('transport.shuffleOff')}><Shuffle size={20} /></button>
        <button type="button" class="noc-t" onclick={precedent} aria-label={$t('transport.previous')}><SkipBack size={24} /></button>
        <button type="button" class="noc-t-principal" onclick={lecturePause} aria-label={joue ? $t('common.pause') : $t('common.play')}>
          {#if joue}<Pause size={26} fill="currentColor" />{:else}<Play size={26} fill="currentColor" />{/if}
        </button>
        <button type="button" class="noc-t" onclick={suivant} aria-label={$t('transport.next')}><SkipForward size={24} /></button>
        <button type="button" class="noc-t" class:actif={repetition !== 'off'} aria-pressed={repetition !== 'off'} onclick={() => reglerRepetition()}
          aria-label={repetition === 'one' ? $t('transport.repeatOne') : repetition === 'all' ? $t('transport.repeatAll') : $t('transport.repeatOff')}>
          {#if repetition === 'one'}<Repeat1 size={20} />{:else}<Repeat size={20} />{/if}
        </button>
      </div>
    </div>
  {/if}
</article>

<style>
  .noc-lecture {
    min-height: 100%;
    display: flex;
    align-items: center;
    gap: 56px;
    padding: 40px 24px;
  }
  .noc-lecture-pochette {
    flex: 0 0 auto;
    width: min(46vh, 520px);
    aspect-ratio: 1;
    border-radius: var(--noc-rayon);
    overflow: hidden;
    background: var(--noc-pochette-fond);
    box-shadow: var(--noc-pochette-ombre);
  }
  .noc-lecture-pochette :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .noc-lecture-infos { flex: 1; min-width: 0; max-width: 680px; }
  .noc-surtitre {
    font-size: var(--noc-taille-surtitre);
    letter-spacing: var(--noc-interlettre-surtitre);
    text-transform: uppercase;
    font-weight: var(--noc-graisse-forte);
    color: var(--noc-ambre);
  }
  h1 {
    margin: 12px 0 8px;
    font-size: var(--noc-taille-titre-artiste);
    font-weight: var(--noc-graisse-titre);
    letter-spacing: var(--noc-interlettre-titre);
    line-height: 1.08;
    color: var(--noc-texte);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  .noc-lien-artiste,
  .noc-lecture-album {
    display: block;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .noc-lien-artiste { font-size: var(--noc-taille-section); font-weight: 500; color: var(--noc-ambre); }
  .noc-lien-artiste:hover { color: var(--noc-ambre-vif); }
  .noc-lecture-album { margin-top: 6px; font-size: var(--noc-taille-sous-titre); color: var(--noc-texte-2); }
  .noc-lecture-album:hover { color: var(--noc-texte); }
  .noc-lecture-qualite { display: flex; align-items: center; gap: 10px; margin-top: 18px; }
  .noc-sortie {
    padding: 1px 6px;
    border-radius: var(--noc-rayon-petit);
    border: 1px solid var(--noc-ligne);
    color: var(--noc-texte-2);
    font-size: var(--noc-taille-micro);
    font-weight: var(--noc-graisse-forte);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .noc-sortie[data-sortie='bitPerfect'] { color: var(--noc-turquoise); border-color: var(--noc-turquoise-doux); }
  .noc-sortie[data-sortie='tess'] { color: var(--noc-ambre); border-color: var(--noc-ambre-doux); }
  .noc-lecture-progression { margin-top: 40px; }
  .noc-lecture-rail { position: relative; height: 14px; cursor: pointer; }
  .noc-lecture-rail::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 5px;
    height: 4px;
    border-radius: 2px;
    background: var(--noc-piste-progression);
  }
  .noc-lecture-rempli {
    position: absolute;
    left: 0;
    top: 5px;
    height: 4px;
    border-radius: 2px;
    background: var(--noc-ambre);
  }
  .noc-lecture-rail:focus-visible { outline: 2px solid var(--noc-focus); outline-offset: 3px; border-radius: 4px; }
  .noc-lecture-temps {
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
    color: var(--noc-texte-2);
    font-size: var(--noc-taille-mini);
    font-variant-numeric: tabular-nums;
  }
  .noc-lecture-transport { display: flex; align-items: center; gap: 26px; margin-top: 26px; }
  .noc-t {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--noc-texte-2);
    cursor: pointer;
  }
  .noc-t:hover { color: var(--noc-texte); }
  .noc-t.actif { color: var(--noc-turquoise); }
  .noc-t-principal {
    width: 64px;
    height: 64px;
    display: grid;
    place-items: center;
    padding-left: 3px;
    border: 0;
    border-radius: 50%;
    background: var(--noc-ambre);
    color: var(--noc-sur-ambre);
    cursor: pointer;
  }
  .noc-t-principal:hover { background: var(--noc-ambre-vif); }
  .noc-vide { color: var(--noc-texte-3); }
  @media (max-width: 900px) {
    .noc-lecture { flex-direction: column; align-items: flex-start; gap: 24px; }
    .noc-lecture-pochette { width: min(80vw, 420px); }
    /* Itération 13 : en colonne, les infos prenaient la largeur de leur
       contenu ; le rail et les temps dépassaient la marge droite. */
    .noc-lecture-infos { align-self: stretch; width: 100%; }
  }
  /* Itération 13 — au doigt : le rail se saisit sur 44 px de haut (le trait
     reste de 4 px, à la même place) ; le lien de l'album fait 24 px. */
  @media (pointer: coarse) {
    .noc-lecture-rail { height: var(--noc-cible-tactile); margin-block: -15px; }
    .noc-lecture-rail::before, .noc-lecture-rempli { top: 20px; }
  }
  .noc-lecture-album { min-height: var(--noc-cible-lien); }
</style>
