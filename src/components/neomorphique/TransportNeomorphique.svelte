<script lang="ts">
  /**
   * La barre de transport du thème « Néomorphique » : précédent, lecture /
   * pause et suivant en relief (lecture enfoncée pendant la lecture), la
   * barre d'avancement en creux, la zone en touche et une petite molette de
   * volume.
   *
   * Remplace `TransportSalon` dans la coquille Salon quand ce jeu de jetons
   * est actif. Les GESTES sont ceux de l'interface actuelle
   * (`playback-controls`, `SeekBar`, `switchZone`, envoi du volume).
   */
  import '../../styles/neomorphique/relief.css';
  import { bulleTexte } from '../../lib/infobulleTexte';
  import { t } from '../../lib/i18n';
  import { currentZone } from '../../lib/stores/zones';
  import { currentTrack, playbackState, seekPositionMs } from '../../lib/stores/nowPlaying';
  import { togglePlayPause, skipNext, skipPrevious } from '../../lib/playback-controls';
  import { notifierErreur } from '../../lib/notifierErreur';
  import { allerA } from '../../lib/stores/salon';
  import SeekBar from '../partages/SeekBar.svelte';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import IconeSalon from '../salon/IconeSalon.svelte';
  import IconeZone from '../partages/IconeZone.svelte';
  import MoletteNeomorphique from './MoletteNeomorphique.svelte';
  import ZonesNeomorphique from './ZonesNeomorphique.svelte';

  const piste = $derived($currentTrack);
  const enLecture = $derived($playbackState === 'playing');
  const actif = $derived($playbackState === 'playing' || $playbackState === 'paused');

  let zonesOuvertes = $state(false);

  async function lirePause() {
    try { await togglePlayPause($currentZone, piste, $playbackState); }
    catch (e) { notifierErreur($t('library.playbackError' as any), e); }
  }
</script>

<svelte:window onclick={() => (zonesOuvertes = false)} />

<footer class="transport" data-transport-salon data-transport-neo>
  <div class="gauche">
    {#if piste}
      <button class="en-cours" onclick={() => allerA({ page: 'lecture' })}
        title={$t('nav.nowplaying' as any)}>
        <span class="vignette"><AlbumArt coverPath={piste.cover_path} albumId={piste.album_id ?? null} size={0} vignette alt={piste.album_title ?? piste.title} /></span>
        <span class="textes">
          <span class="titre" use:bulleTexte>{piste.title}</span>
          {#if piste.artist_name}<span class="artiste" use:bulleTexte>{piste.artist_name}</span>{/if}
        </span>
      </button>
    {:else}
      <span class="rien">{$t('roonLike.transport.rien' as any)}</span>
    {/if}
  </div>

  <div class="centre">
    <div class="boutons">
      <button class="neo-bouton prec" onclick={() => skipPrevious($currentZone)} disabled={!actif}
        aria-label={$t('roonLike.transport.precedent' as any)} title={$t('roonLike.transport.precedent' as any)}>
        <IconeSalon nom="precedent" taille={18} />
      </button>
      <!-- Enfoncée pendant la lecture : le creux ET l'orange d'état. -->
      <button class="neo-bouton grand lire" onclick={lirePause} aria-pressed={enLecture}
        aria-label={enLecture ? $t('roonLike.transport.pause' as any) : $t('roonLike.transport.lire' as any)}
        title={enLecture ? $t('roonLike.transport.pause' as any) : $t('roonLike.transport.lire' as any)}>
        <IconeSalon nom={enLecture ? 'pause' : 'lecture'} taille={22} plein trait={1} />
      </button>
      <button class="neo-bouton" onclick={() => skipNext($currentZone)} disabled={!actif}
        aria-label={$t('roonLike.transport.suivant' as any)} title={$t('roonLike.transport.suivant' as any)}>
        <IconeSalon nom="prochain" taille={18} />
      </button>
    </div>
    <div class="avance neo-jauge">
      <SeekBar positionMs={$seekPositionMs} durationMs={piste?.duration_ms ?? 0} enabled={actif} />
    </div>
  </div>

  <div class="droite">
    <div class="ancre">
      <button class="neo-touche zone" onclick={(e) => { e.stopPropagation(); zonesOuvertes = !zonesOuvertes; }}
        aria-haspopup="dialog" aria-expanded={zonesOuvertes} aria-pressed={zonesOuvertes}
        title={$t('roonLike.zones.choisir' as any)}>
        {#if $currentZone}<IconeZone zone={$currentZone} taille={18} />{:else}<IconeSalon nom="enceinte" taille={16} trait={1.6} />{/if}
        <span class="legende">{$currentZone?.name ?? $t('roonLike.zones.aucune' as any)}</span>
      </button>
      {#if zonesOuvertes}
        <div class="pop neo-relief" role="dialog" aria-label={$t('roonLike.zones.choisir' as any)} onclick={(e) => e.stopPropagation()}>
          <ZonesNeomorphique onChoix={() => (zonesOuvertes = false)} />
        </div>
      {/if}
    </div>
    <div class="volume"><MoletteNeomorphique petite legende={false} /></div>
  </div>
</footer>

<style>
  .transport {
    flex: none; height: var(--s-haut-transport);
    display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, var(--s-largeur-avance)) minmax(0, 1fr);
    align-items: center; gap: var(--neo-ecart-large); padding: 0 24px;
    background: var(--neo-sol); color: var(--neo-encre);
  }
  button { font: inherit; }
  .gauche { min-width: 0; }
  .rien { font-size: var(--s-t-petit); color: var(--neo-doux); }
  .en-cours {
    display: flex; align-items: center; gap: 14px; min-width: 0; text-align: left; padding: 0;
    background: none; border: 0; color: inherit; cursor: pointer;
  }
  .vignette { width: var(--s-vignette-transport); height: var(--s-vignette-transport); flex: none; padding: 4px; border-radius: var(--neo-r-touche); overflow: hidden;
    background: var(--neo-sol); box-shadow: var(--neo-creux-1); }
  .vignette :global(img) { border-radius: var(--rayon-1); }
  .textes { display: flex; flex-direction: column; min-width: 0; }
  .titre, .artiste { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .titre { font-size: var(--s-t-texte); font-weight: var(--graisse-forte); color: var(--neo-encre); }
  .artiste { font-size: var(--s-t-petit); color: var(--neo-doux); }
  .centre { display: flex; flex-direction: column; gap: 10px; }
  .boutons { display: flex; justify-content: center; align-items: center; gap: 22px; }
  /* La barre d'avancement : une rainure en creux, l'avancé à l'orange vif. */
  .avance { display: block; }
  .avance :global(.time) { font-family: var(--s-police-texte); font-variant-numeric: tabular-nums; font-size: var(--s-t-mini); color: var(--neo-doux); }
  .avance :global(.seek-track),
  .avance :global(.seek-track:hover) {
    height: var(--neo-haut-jauge); background: var(--neo-sol); border-radius: var(--neo-r-jauge);
    box-shadow: var(--neo-creux-1);
  }
  .avance :global(.seek-fill) { background: var(--neo-etat-fond); border-radius: var(--neo-r-jauge); }
  .avance :global(.seek-thumb) { background: var(--neo-sol); box-shadow: var(--neo-relief-1); }
  .droite { display: flex; justify-content: flex-end; align-items: center; gap: var(--neo-ecart-large); }
  .ancre { position: relative; }
  .legende { max-width: 14ch; overflow: hidden; text-overflow: ellipsis; }
  .pop {
    position: absolute; right: 0; bottom: calc(100% + 22px); z-index: 60;
    width: var(--s-largeur-pop); padding: 18px;
  }
  @media (prefers-reduced-motion: reduce) {
    .avance :global(.seek-fill) { transition: none; }
  }
  /* Fenêtres étroites : titre, lecture/pause, suivant, zone ; la rainure en haut. */
  @media (max-width: 760px) {
    .transport { grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; padding: 0 12px; position: relative; }
    .centre { display: contents; }
    .boutons { gap: 12px; }
    .prec, .volume { display: none; }
    .avance { position: absolute; left: 12px; right: 12px; top: 4px; }
    .avance :global(.time) { display: none; }
    .legende { display: none; }
    .droite { gap: 8px; }
  }
</style>
