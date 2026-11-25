<script lang="ts">
  /**
   * Barre de lecture Nocturne : pochette, titre, artiste et qualité à gauche ;
   * progression fine ambrée et transport au centre ; zone, volume et file à
   * droite. Tout se lit dans les magasins partagés, tout geste passe par les
   * mêmes appels que la barre historique (`*AndSync`, `api.seek`…).
   */
  import Play from '@lucide/svelte/icons/play';
  import Pause from '@lucide/svelte/icons/pause';
  import SkipBack from '@lucide/svelte/icons/skip-back';
  import SkipForward from '@lucide/svelte/icons/skip-forward';
  import Shuffle from '@lucide/svelte/icons/shuffle';
  import Repeat from '@lucide/svelte/icons/repeat';
  import Repeat1 from '@lucide/svelte/icons/repeat-1';
  import Speaker from '@lucide/svelte/icons/speaker';
  import Volume2 from '@lucide/svelte/icons/volume-2';
  import ListMusic from '@lucide/svelte/icons/list-music';
  import Check from '@lucide/svelte/icons/check';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { formatTime } from '../../lib/utils';
  import type { RepeatMode } from '../../lib/types';
  import {
    currentZone, currentZoneId, zones, switchZone,
    pauseAndSync, resumeAndSync, nextAndSync, previousAndSync,
  } from '../../lib/stores/zones';
  import { currentTrack, playbackState, seekPositionMs, shuffleEnabled, zoneVolume } from '../../lib/stores/nowPlaying';
  import { repeatMode } from '../../lib/stores/repeatStore';
  import { upNextCount } from '../../lib/stores/queue';
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import BadgeQualiteNocturne from './BadgeQualiteNocturne.svelte';
  import { allerA } from './navigationNocturne';

  interface Props { fileOuverte: boolean; basculerFile: () => void }
  let { fileOuverte, basculerFile }: Props = $props();

  let menuZones = $state(false);

  const piste = $derived($currentTrack);
  const duree = $derived(piste?.duration_ms ?? 0);
  const position = $derived(Math.min($seekPositionMs, duree || $seekPositionMs));
  const ratio = $derived(duree > 0 ? Math.min(1, position / duree) : 0);
  const joue = $derived($playbackState === 'playing');
  const aleatoire = $derived($currentZone?.shuffle ?? $shuffleEnabled);
  const repetition = $derived<RepeatMode>($currentZone?.repeat ?? $repeatMode);
  const zonesVisibles = $derived($zones.filter((z) => z.id != null && !z.device_forgotten));

  function zid(): number | null { return $currentZoneId; }

  function lecturePause() {
    const z = zid();
    if (z == null) return;
    (joue ? pauseAndSync(z) : resumeAndSync(z)).catch(signalerEchecLecture);
  }
  function suivant() { const z = zid(); if (z != null) nextAndSync(z).catch(signalerEchecLecture); }
  function precedent() { const z = zid(); if (z != null) previousAndSync(z).catch(signalerEchecLecture); }

  async function basculerAleatoire() {
    const z = zid();
    if (z == null) return;
    try {
      await api.setShuffle(z, !aleatoire);
      shuffleEnabled.set(!aleatoire);
      zones.update((zs) => zs.map((x) => (x.id === z ? { ...x, shuffle: !aleatoire } : x)));
    } catch (e) { signalerEchecLecture(e); }
  }
  async function basculerRepetition() {
    const z = zid();
    if (z == null) return;
    const suivante: RepeatMode = repetition === 'off' ? 'all' : repetition === 'all' ? 'one' : 'off';
    try {
      await api.setRepeat(z, suivante);
      repeatMode.set(suivante);
      zones.update((zs) => zs.map((x) => (x.id === z ? { ...x, repeat: suivante } : x)));
    } catch (e) { signalerEchecLecture(e); }
  }

  function chercher(e: MouseEvent) {
    const z = zid();
    if (z == null || !duree) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const ms = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duree);
    seekPositionMs.set(ms);
    api.seek(z, ms).catch(signalerEchecLecture);
  }
  function chercherClavier(e: KeyboardEvent) {
    const z = zid();
    if (z == null || !duree) return;
    const pas = e.key === 'ArrowRight' ? 5000 : e.key === 'ArrowLeft' ? -5000 : 0;
    if (!pas) return;
    e.preventDefault();
    const ms = Math.max(0, Math.min(duree, position + pas));
    seekPositionMs.set(ms);
    api.seek(z, ms).catch(signalerEchecLecture);
  }

  let minuterieVolume: ReturnType<typeof setTimeout> | null = null;
  function reglerVolume(e: Event) {
    const v = Number((e.currentTarget as HTMLInputElement).value) / 100;
    zoneVolume.set(v);
    const z = zid();
    if (z == null) return;
    if (minuterieVolume) clearTimeout(minuterieVolume);
    minuterieVolume = setTimeout(() => { api.setVolume(z, v).catch(signalerEchecLecture); }, 120);
  }

  function ouvrirAlbum() {
    const id = piste?.album_id;
    if (id != null) allerA({ nom: 'album', id });
  }
  function ouvrirArtiste() {
    const id = piste?.artist_id;
    if (id != null) allerA({ nom: 'artiste', id });
  }
</script>

<footer class="noc-barre">
  <button type="button" class="noc-barre-pochette" onclick={ouvrirAlbum} aria-label={piste?.album_title ?? piste?.title ?? ''} disabled={!piste}>
    {#if piste}<AlbumArt coverPath={piste.cover_path} albumId={piste.album_id ?? null} size={0} vignette alt={piste.title} source={piste.source ?? null} />{/if}
  </button>

  <div class="noc-barre-milieu">
    <div class="noc-barre-titres">
      {#if piste}
        <span class="noc-barre-ligne">
          <span class="noc-barre-titre" title={piste.title}>{piste.title}</span>
          <BadgeQualiteNocturne format={piste.format} sample_rate={piste.sample_rate} bit_depth={piste.bit_depth} source={piste.source ?? null} complet />
        </span>
        <button type="button" class="noc-barre-artiste" title={piste.artist_name ?? ''} onclick={ouvrirArtiste}>{piste.artist_name ?? ''}</button>
      {/if}
    </div>
    <div class="noc-barre-temps">
      <span>{formatTime(position)}</span>
      <div class="noc-barre-progression" role="slider" tabindex="0" aria-label={$t('v2.album.fiche.duration')}
        aria-valuemin={0} aria-valuemax={Math.round(duree / 1000)} aria-valuenow={Math.round(position / 1000)}
        onclick={chercher} onkeydown={chercherClavier}>
        <div class="noc-barre-rempli" style:width={`${ratio * 100}%`}></div>
      </div>
      <span>{duree ? `-${formatTime(duree - position)}` : ''}</span>
    </div>
    <div class="noc-barre-transport">
      <button type="button" class="noc-t" class:actif={aleatoire} aria-pressed={aleatoire} onclick={basculerAleatoire}
        aria-label={aleatoire ? $t('transport.shuffleOn') : $t('transport.shuffleOff')}><Shuffle size={15} /></button>
      <button type="button" class="noc-t" onclick={precedent} aria-label={$t('transport.previous')}><SkipBack size={16} /></button>
      <button type="button" class="noc-t-principal" onclick={lecturePause} aria-label={joue ? $t('common.pause') : $t('common.play')}>
        {#if joue}<Pause size={16} fill="currentColor" />{:else}<Play size={16} fill="currentColor" />{/if}
      </button>
      <button type="button" class="noc-t" onclick={suivant} aria-label={$t('transport.next')}><SkipForward size={16} /></button>
      <button type="button" class="noc-t" class:actif={repetition !== 'off'} aria-pressed={repetition !== 'off'} onclick={basculerRepetition}
        aria-label={repetition === 'one' ? $t('transport.repeatOne') : repetition === 'all' ? $t('transport.repeatAll') : $t('transport.repeatOff')}>
        {#if repetition === 'one'}<Repeat1 size={15} />{:else}<Repeat size={15} />{/if}
      </button>
    </div>
    {#if $currentZone}
      <div class="noc-barre-legende">
        <span>{$t('nav.nowplaying')} · {$currentZone.name}</span>
      </div>
    {/if}
  </div>

  <div class="noc-barre-droite">
    <div class="noc-zone-ancre">
      <button type="button" class="noc-zone" onclick={() => (menuZones = !menuZones)} aria-expanded={menuZones}>
        <Speaker size={18} />
        <span class="noc-zone-nom" title={$currentZone?.name ?? ''}>{$currentZone?.name ?? '—'}</span>
        <span class="noc-zone-pastille" class:joue></span>
      </button>
      {#if menuZones}
        <div class="noc-zone-menu" role="menu">
          {#each zonesVisibles as z (z.id)}
            <button type="button" role="menuitemradio" aria-checked={z.id === $currentZoneId}
              onclick={() => { menuZones = false; if (z.id != null) void switchZone(z.id); }}>
              <span class="noc-zone-pastille" class:joue={z.state === 'playing'}></span>
              <span class="noc-zone-nom" title={z.name}>{z.name}</span>
              {#if z.id === $currentZoneId}<Check size={14} />{/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <label class="noc-volume">
      <Volume2 size={16} />
      <input type="range" min="0" max="100" step="1" value={Math.round($zoneVolume * 100)} oninput={reglerVolume}
        aria-label={$t('reglages.fiche.volume')} style:--noc-volume-ratio={`${Math.round($zoneVolume * 100)}%`} />
    </label>
    <button type="button" class="noc-t noc-file-bascule" class:actif={fileOuverte} aria-pressed={fileOuverte} onclick={basculerFile} aria-label={$t('nav.queue')}>
      <ListMusic size={19} />
      {#if $upNextCount > 0}<span class="noc-file-compte">{$upNextCount > 99 ? '99+' : $upNextCount}</span>{/if}
    </button>
  </div>
</footer>

<style>
  .noc-barre {
    position: relative;
    height: var(--noc-hauteur-barre);
    display: grid;
    grid-template-columns: var(--noc-pochette-barre) minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 28px;
    padding: 0 20px 0 15px;
    background: var(--noc-fond-barre);
    border-top: 1px solid var(--noc-ligne);
  }
  .noc-barre-pochette {
    width: var(--noc-pochette-barre);
    height: var(--noc-pochette-barre);
    padding: 0;
    border: 0;
    border-radius: var(--noc-rayon-petit);
    overflow: hidden;
    background: var(--noc-pochette-fond);
    cursor: pointer;
  }
  .noc-barre-pochette :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .noc-barre-milieu {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding-top: 2px;
  }
  .noc-barre-titres { min-height: 38px; display: flex; flex-direction: column; gap: 4px; }
  .noc-barre-ligne { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .noc-barre-titre {
    color: var(--noc-texte);
    font-size: var(--noc-taille-barre-titre);
    font-weight: var(--noc-graisse-forte);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .noc-barre-artiste {
    align-self: flex-start;
    max-width: 100%;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    font-size: var(--noc-taille-mini);
    color: var(--noc-texte-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
  }
  .noc-barre-artiste:hover { color: var(--noc-ambre); }
  .noc-barre-temps {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 4px 0 0;
    font-size: var(--noc-taille-badge);
    color: var(--noc-texte-4);
    font-variant-numeric: tabular-nums;
  }
  .noc-barre-temps > span { width: 22px; }
  .noc-barre-temps > span:last-child { width: 30px; text-align: right; }
  .noc-barre-progression {
    position: relative;
    flex: 1;
    height: 12px;
    cursor: pointer;
  }
  .noc-barre-progression::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 5px;
    height: 2px;
    border-radius: 1px;
    background: var(--noc-piste-progression);
  }
  .noc-barre-rempli {
    position: absolute;
    left: 0;
    top: 5px;
    height: 2px;
    border-radius: 1px;
    background: var(--noc-ambre);
  }
  .noc-barre-progression:hover::before,
  .noc-barre-progression:hover .noc-barre-rempli { top: 4px; height: 4px; }
  .noc-barre-progression:focus-visible { outline: 2px solid var(--noc-focus); outline-offset: 2px; border-radius: 4px; }
  .noc-barre-transport {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-top: 6px;
  }
  .noc-t {
    position: relative;
    width: 32px;
    height: 32px;
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
    width: 37px;
    height: 37px;
    display: grid;
    place-items: center;
    padding-left: 2px;
    border: 0;
    border-radius: 50%;
    background: var(--noc-bouton-lecture);
    color: var(--noc-sur-bouton-lecture);
    cursor: pointer;
    transition: background var(--noc-duree);
  }
  .noc-t-principal:hover { background: var(--noc-texte); }
  .noc-barre-legende {
    display: flex;
    justify-content: center;
    margin-top: 6px;
  }
  .noc-barre-legende span {
    font-size: var(--noc-taille-micro);
    font-weight: var(--noc-graisse-forte);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--noc-ambre);
    opacity: 0.85;
  }
  .noc-barre-droite {
    display: flex;
    align-items: center;
    gap: 18px;
    padding-left: 22px;
    border-left: 1px solid var(--noc-ligne);
    height: 44px;
  }
  .noc-zone-ancre { position: relative; min-width: 0; }
  .noc-zone {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    max-width: 220px;
    height: 32px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--noc-texte-2);
    font: inherit;
    font-size: var(--noc-taille-petit);
    cursor: pointer;
  }
  .noc-zone .noc-zone-nom { color: var(--noc-texte); font-weight: var(--noc-graisse-forte); }
  .noc-zone:hover .noc-zone-nom { color: var(--noc-ambre); }
  .noc-zone-nom { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .noc-zone-pastille {
    flex: 0 0 6px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--noc-texte-4);
  }
  .noc-zone-pastille.joue { background: var(--noc-turquoise); }
  .noc-zone-menu {
    position: absolute;
    right: 0;
    bottom: 44px;
    z-index: 30;
    min-width: 250px;
    max-height: 50vh;
    overflow-y: auto;
    padding: 6px;
    border-radius: var(--noc-rayon-grand);
    border: 1px solid var(--noc-ligne);
    background: var(--noc-surface-2);
    box-shadow: var(--noc-carte-ombre);
  }
  .noc-zone-menu button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 9px 10px;
    border: 0;
    border-radius: var(--noc-rayon);
    background: none;
    color: var(--noc-texte);
    font: inherit;
    font-size: var(--noc-taille-texte);
    text-align: left;
    cursor: pointer;
  }
  .noc-zone-menu button:hover { background: var(--noc-surface-3); }
  .noc-zone-menu button[aria-checked='true'] { color: var(--noc-turquoise); }
  .noc-zone-menu .noc-zone-nom { flex: 1; }
  .noc-volume { display: inline-flex; align-items: center; gap: 8px; color: var(--noc-texte-2); }
  .noc-volume input {
    width: 90px;
    height: 2px;
    appearance: none;
    -webkit-appearance: none;
    border-radius: 1px;
    background: linear-gradient(to right, var(--noc-texte-2) var(--noc-volume-ratio), var(--noc-piste-progression) var(--noc-volume-ratio));
    cursor: pointer;
  }
  .noc-volume input::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: var(--noc-texte);
  }
  .noc-volume input::-moz-range-thumb {
    width: 11px;
    height: 11px;
    border: 0;
    border-radius: 50%;
    background: var(--noc-texte);
  }
  .noc-file-compte {
    position: absolute;
    top: -1px;
    right: -3px;
    min-width: 15px;
    height: 15px;
    padding: 0 4px;
    border-radius: var(--noc-rayon-pilule);
    background: var(--noc-ambre);
    color: var(--noc-sur-ambre);
    font-size: var(--noc-taille-badge-mini);
    font-weight: var(--noc-graisse-titre);
    line-height: 15px;
    text-align: center;
  }
  @media (max-width: 900px) {
    .noc-barre { grid-template-columns: var(--noc-pochette-barre) minmax(0, 1fr) auto; column-gap: 14px; }
    .noc-barre-temps, .noc-barre-legende, .noc-volume, .noc-zone-ancre { display: none; }
    .noc-barre-droite { border-left: 0; padding-left: 0; }
  }
</style>
