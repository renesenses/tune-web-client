<script lang="ts">
  /**
   * Barre de transport de Salon : le titre en cours à gauche, le transport et
   * la barre d'avancement au centre, la zone et le volume à droite.
   *
   * Les GESTES sont ceux de l'interface actuelle (`playback-controls`,
   * `SeekBar`, `VolumeControl`, `switchZone`) : seule la mise en page change.
   */
  import { t } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import { zones, currentZone, switchZone } from '../../lib/stores/zones';
  import { currentTrack, playbackState, seekPositionMs, shuffleEnabled } from '../../lib/stores/nowPlaying';
  import { togglePlayPause, skipNext, skipPrevious } from '../../lib/playback-controls';
  import { basculerAleatoire } from '../../lib/aleatoireFile';
  import { notifierErreur } from '../../lib/notifierErreur';
  import { allerA } from '../../lib/stores/salon';
  import SeekBar from '../partages/SeekBar.svelte';
  import VolumeControl from '../partages/VolumeControl.svelte';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import ZoneTypeIcon from '../partages/ZoneTypeIcon.svelte';
  import IconeSalon from './IconeSalon.svelte';

  const piste = $derived($currentTrack);
  const enLecture = $derived($playbackState === 'playing');
  const actif = $derived($playbackState === 'playing' || $playbackState === 'paused');
  const volume = $derived(Math.round(($currentZone?.volume ?? 0) * 100));

  let panneau = $state<'zones' | 'volume' | null>(null);
  function basculer(p: 'zones' | 'volume', e: MouseEvent) {
    e.stopPropagation();
    panneau = panneau === p ? null : p;
  }

  async function lirePause() {
    try { await togglePlayPause($currentZone, piste, $playbackState); }
    catch (e) { notifierErreur($t('library.playbackError' as any), e); }
  }
  async function aleatoire() {
    const z = $currentZone;
    if (z?.id == null) return;
    try { shuffleEnabled.set(await basculerAleatoire(z.id, !$shuffleEnabled)); }
    catch (e) { notifierErreur($t('library.playbackError' as any), e); }
  }
  async function toutEnPause() {
    panneau = null;
    await Promise.allSettled($zones.filter((z) => z.id != null && z.state === 'playing').map((z) => api.pause(z.id!)));
  }
  function choisirZone(id: number | null) {
    if (id == null) return;
    void switchZone(id);
    panneau = null;
  }
</script>

<svelte:window onclick={() => (panneau = null)} />

<footer class="transport" data-transport-salon>
  <div class="gauche">
    {#if piste}
      <button class="en-cours" onclick={() => allerA({ page: 'tune', vue: 'nowplaying' })}>
        <span class="vignette"><AlbumArt coverPath={piste.cover_path} albumId={piste.album_id ?? null} size={0} vignette alt={piste.album_title ?? piste.title} /></span>
        <span class="textes">
          <span class="titre">{piste.title}</span>
          {#if piste.artist_name}<span class="artiste">{piste.artist_name}</span>{/if}
        </span>
      </button>
    {:else}
      <span class="rien">{$t('salon.transport.rien' as any)}</span>
    {/if}
  </div>

  <div class="centre">
    <div class="boutons">
      <button class="b petit" class:on={$shuffleEnabled} onclick={aleatoire} aria-pressed={$shuffleEnabled}
        aria-label={$t('salon.transport.aleatoire' as any)} title={$t('salon.transport.aleatoire' as any)}>
        <IconeSalon nom="aleatoire" taille={15} />
      </button>
      <button class="b" onclick={() => skipPrevious($currentZone)} disabled={!actif}
        aria-label={$t('salon.transport.precedent' as any)} title={$t('salon.transport.precedent' as any)}>
        <IconeSalon nom="precedent" taille={18} />
      </button>
      <button class="b lire" onclick={lirePause}
        aria-label={enLecture ? $t('salon.transport.pause' as any) : $t('salon.transport.lire' as any)}
        title={enLecture ? $t('salon.transport.pause' as any) : $t('salon.transport.lire' as any)}>
        <IconeSalon nom={enLecture ? 'pause' : 'lecture'} taille={22} plein trait={1} />
      </button>
      <button class="b" onclick={() => skipNext($currentZone)} disabled={!actif}
        aria-label={$t('salon.transport.suivant' as any)} title={$t('salon.transport.suivant' as any)}>
        <IconeSalon nom="prochain" taille={18} />
      </button>
      <button class="b" onclick={() => allerA({ page: 'file' })}
        aria-label={$t('nav.queue' as any)} title={$t('nav.queue' as any)}>
        <IconeSalon nom="file" taille={18} />
      </button>
    </div>
    <div class="avance">
      <!-- `SeekBar` porte ses propres temps (écoulé, total). -->
      <div class="barre"><SeekBar positionMs={$seekPositionMs} durationMs={piste?.duration_ms ?? 0} enabled={actif} /></div>
    </div>
  </div>

  <div class="droite">
    <div class="ancre">
      <button class="zone" onclick={(e) => basculer('zones', e)} aria-haspopup="dialog" aria-expanded={panneau === 'zones'}
        title={$t('salon.zones.choisir' as any)}>
        <IconeSalon nom="enceinte" taille={24} trait={1.3} />
        <span class="legende">{$currentZone?.name ?? $t('salon.zones.aucune' as any)}</span>
      </button>
      {#if panneau === 'zones'}
        <div class="pop zones" role="dialog" aria-label={$t('salon.zones.choisir' as any)} onclick={(e) => e.stopPropagation()}>
          {#each $zones as z (z.id)}
            <button class="ligne" class:courante={z.id === $currentZone?.id} onclick={() => choisirZone(z.id)}>
              <span class="ic"><ZoneTypeIcon type={z.output_type ?? null} size={26} /></span>
              <span class="noms">
                <span class="nom">{z.name}</span>
                {#if z.current_track?.title}<span class="sous">{z.current_track.title}</span>{/if}
              </span>
              {#if z.state === 'playing'}<span class="joue" aria-label={$t('salon.zones.enLecture' as any)}></span>{/if}
            </button>
          {:else}
            <p class="vide">{$t('salon.zones.aucune' as any)}</p>
          {/each}
          <div class="pied">
            <button class="lien" onclick={toutEnPause}><IconeSalon nom="pause" taille={13} />{$t('salon.zones.toutEnPause' as any)}</button>
            <button class="lien" onclick={() => { panneau = null; allerA({ page: 'tune', vue: 'zonemanager' }); }}>
              <IconeSalon nom="lien" taille={14} />{$t('salon.zones.groupe' as any)}</button>
          </div>
        </div>
      {/if}
    </div>
    <div class="ancre">
      <button class="zone" onclick={(e) => basculer('volume', e)} aria-haspopup="dialog" aria-expanded={panneau === 'volume'}
        title={$t('salon.transport.volume' as any)} disabled={!$currentZone}>
        <IconeSalon nom="volume" taille={22} trait={1.4} />
        <span class="legende">{volume}</span>
      </button>
      {#if panneau === 'volume'}
        <div class="pop volume" role="dialog" aria-label={$t('salon.transport.volume' as any)} onclick={(e) => e.stopPropagation()}>
          <VolumeControl />
        </div>
      {/if}
    </div>
  </div>
</footer>

<style>
  .transport {
    flex: none; height: var(--s-haut-transport);
    display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 840px) minmax(0, 1fr);
    align-items: center; gap: 24px; padding: 0 20px;
    background: var(--s-transport); border-top: 1px solid var(--s-line);
  }
  button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
  .gauche { min-width: 0; }
  .rien { font-size: var(--s-t-texte); color: var(--s-txt); }
  .en-cours { display: flex; align-items: center; gap: 12px; min-width: 0; text-align: left; padding: 0; }
  .vignette { width: var(--s-vignette-transport); height: var(--s-vignette-transport); flex: none; }
  .textes { display: flex; flex-direction: column; min-width: 0; }
  .titre, .artiste { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .titre { font-size: var(--s-t-texte); color: var(--s-txt); }
  .artiste { font-size: var(--s-t-petit); color: var(--s-txt2); }
  .centre { display: flex; flex-direction: column; align-items: stretch; gap: 8px; }
  .boutons { display: flex; justify-content: center; align-items: center; gap: 30px; }
  .b { color: var(--s-txt2); width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; }
  .b:hover:not(:disabled) { color: var(--s-txt); background: var(--s-survol); }
  .b:disabled { opacity: .45; cursor: default; }
  .b.on { color: var(--s-acc); }
  .b.lire { color: var(--s-txt); }
  .avance { display: block; }
  .barre { min-width: 0; }
  .barre :global(*) { --v2-acc1: var(--s-acc); }
  .droite { display: flex; justify-content: flex-end; gap: 28px; }
  .ancre { position: relative; }
  .zone { display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--s-txt2); padding: 4px 6px; border-radius: var(--s-r-item); max-width: 160px; }
  .zone:hover:not(:disabled) { color: var(--s-txt); background: var(--s-survol); }
  .legende { font-size: var(--s-t-micro); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; }
  .pop {
    position: absolute; right: 0; bottom: calc(100% + 18px); z-index: 60;
    background: var(--s-bg); color: var(--s-txt);
    border: 1px solid var(--s-line); border-radius: var(--s-r-pop); box-shadow: var(--s-ombre);
  }
  .pop.zones { width: var(--s-largeur-pop); padding-top: 6px; }
  .pop.volume { width: var(--s-largeur-pop); padding: 16px; }
  .ligne { width: 100%; display: flex; align-items: center; gap: 14px; padding: 12px 18px; text-align: left; }
  .ligne:hover { background: var(--s-survol); }
  .ligne.courante { background: var(--s-acc-doux); }
  .ic { color: var(--s-txt2); display: grid; place-items: center; width: 34px; }
  .noms { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .nom { font-size: var(--s-t-corps); }
  .sous { font-size: var(--s-t-mini); color: var(--s-txt2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .joue { width: 8px; height: 8px; border-radius: 50%; background: var(--s-acc); }
  .vide { padding: 14px 18px; color: var(--s-txt3); margin: 0; }
  .pied { display: flex; justify-content: space-between; padding: 12px 18px; border-top: 1px solid var(--s-line); }
  .lien { display: inline-flex; align-items: center; gap: 7px; color: var(--s-txt2); font-size: var(--s-t-petit); }
  .lien:hover { color: var(--s-txt); }
</style>
