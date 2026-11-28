<script lang="ts">
  /**
   * L'écran « Lecture en cours » du thème « Néomorphique » : la façade.
   *
   *   - l'afficheur en creux : titre, artiste · album, ligne de format ;
   *   - les VU-mètres (vraies mesures du serveur, voir `VuMetreNeomorphique`) ;
   *   - la barre d'avancement en creux ;
   *   - le transport en relief et la molette de volume ;
   *   - les touches de source et le sélecteur de zone.
   *
   * Monté par la coquille Salon à la place de l'écran « Lecture en cours » de
   * Tune quand ce jeu de jetons est actif. Aucun geste nouveau : ceux de
   * l'interface actuelle.
   */
  import '../../styles/neomorphique/relief.css';
  import { t } from '../../lib/i18n';
  import { bulleTexte } from '../../lib/infobulleTexte';
  import { currentZone } from '../../lib/stores/zones';
  import { currentTrack, playbackState, seekPositionMs } from '../../lib/stores/nowPlaying';
  import { togglePlayPause, skipNext, skipPrevious } from '../../lib/playback-controls';
  import { notifierErreur } from '../../lib/notifierErreur';
  import { allerA, pageSalon } from '../../lib/stores/salon';
  import { memePage, type PageSalon } from '../../lib/interfaceSalon';
  import { formatCompactQuality, getQualityTier, getQualityTierLabel } from '../../lib/utils';
  import SeekBar from '../partages/SeekBar.svelte';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import IconeSalon, { type NomIcone } from '../salon/IconeSalon.svelte';
  import MoletteNeomorphique from './MoletteNeomorphique.svelte';
  import VuMetreNeomorphique from './VuMetreNeomorphique.svelte';
  import ZonesNeomorphique from './ZonesNeomorphique.svelte';

  const piste = $derived($currentTrack);
  const enLecture = $derived($playbackState === 'playing');
  const actif = $derived($playbackState === 'playing' || $playbackState === 'paused');
  /** Un flux sans durée (radio en direct) : pas de barre d'avancement
   *  « 0:19 / 0:00 », la mention « En direct » à sa place. */
  const direct = $derived(!!piste && (piste.source === 'radio' || !((piste.duration_ms ?? 0) > 0)));
  const palier = $derived(piste ? getQualityTierLabel(getQualityTier(piste)) : '');
  const detail = $derived(piste ? formatCompactQuality(piste) : '');

  async function lirePause() {
    try { await togglePlayPause($currentZone, piste, $playbackState); }
    catch (e) { notifierErreur($t('library.playbackError' as any), e); }
  }

  /** Les touches de source : les mêmes entrées que la barre latérale. */
  const SOURCES: { cle: string; icone: NomIcone; page: PageSalon }[] = [
    { cle: 'roonLike.nav.albums', icone: 'albums', page: { page: 'albums' } },
    { cle: 'v2.nav.streaming', icone: 'services', page: { page: 'tune', vue: 'streaming' } },
    { cle: 'v2.nav.radios', icone: 'radio', page: { page: 'tune', vue: 'radios' } },
    { cle: 'v2.nav.podcasts', icone: 'podcasts', page: { page: 'tune', vue: 'podcasts' } },
  ];
</script>

<div class="lecture-neo" data-lecture-neo>
  <section class="facade neo-relief" aria-label={$t('nav.nowplaying' as any)}>
    <div class="haut">
      <div class="pochette">
        {#if piste}
          <AlbumArt coverPath={piste.cover_path} albumId={piste.album_id ?? null} size={0} alt={piste.album_title ?? piste.title} />
        {/if}
      </div>
      <div class="afficheur neo-creux">
        {#if piste}
          <h1 class="titre" use:bulleTexte>{piste.title}</h1>
          <p class="artiste" use:bulleTexte>
            {piste.artist_name ?? ''}{#if piste.album_title}<span class="sep" aria-hidden="true">·</span>{piste.album_title}{/if}
          </p>
          {#if palier || detail}
            <p class="format">
              {#if palier}<b>{palier}</b>{/if}
              {#if detail && detail.toUpperCase() !== palier.toUpperCase()}<span>{detail}</span>{/if}
              {#if $currentZone?.name}<span class="zone">→ {$currentZone.name}</span>{/if}
            </p>
          {/if}
        {:else}
          <p class="titre rien" use:bulleTexte>{$t('roonLike.transport.rien' as any)}</p>
        {/if}
        <div class="avance neo-jauge">
          {#if direct}<span class="direct" data-direct><span class="diode" aria-hidden="true"></span>{$t('v2.radio.fiche.live' as any)}</span>
          {:else}<SeekBar positionMs={$seekPositionMs} durationMs={piste?.duration_ms ?? 0} enabled={actif} />{/if}
        </div>
      </div>
      <VuMetreNeomorphique />
    </div>

    <div class="bas">
      <div class="transport">
        <button class="neo-bouton" onclick={() => skipPrevious($currentZone)} disabled={!actif}
          aria-label={$t('roonLike.transport.precedent' as any)} title={$t('roonLike.transport.precedent' as any)}>
          <IconeSalon nom="precedent" taille={20} />
        </button>
        <button class="neo-bouton grand" onclick={lirePause} aria-pressed={enLecture}
          aria-label={enLecture ? $t('roonLike.transport.pause' as any) : $t('roonLike.transport.lire' as any)}
          title={enLecture ? $t('roonLike.transport.pause' as any) : $t('roonLike.transport.lire' as any)}>
          <IconeSalon nom={enLecture ? 'pause' : 'lecture'} taille={26} plein trait={1} />
        </button>
        <button class="neo-bouton" onclick={() => skipNext($currentZone)} disabled={!actif}
          aria-label={$t('roonLike.transport.suivant' as any)} title={$t('roonLike.transport.suivant' as any)}>
          <IconeSalon nom="prochain" taille={20} />
        </button>
      </div>
      <MoletteNeomorphique />
    </div>
  </section>

  <section class="rangee">
    <h2 class="s-surtitre">{$t('roonLike.zones.choisir' as any)}</h2>
    <ZonesNeomorphique />
  </section>

  <nav class="rangee" aria-label={$t('roonLike.nav.titre' as any)}>
    <div class="touches">
      {#each SOURCES as s (s.cle)}
        <button type="button" class="neo-touche" aria-pressed={memePage(s.page, $pageSalon)} onclick={() => allerA(s.page)}>
          <IconeSalon nom={s.icone} taille={14} trait={1.8} />{$t(s.cle as any)}
        </button>
      {/each}
    </div>
  </nav>
</div>

<style>
  .lecture-neo {
    max-width: var(--s-largeur-colonne); margin: 0 auto;
    padding: 28px var(--s-marge-fiche) 48px;
    display: grid; gap: var(--neo-ecart-large);
  }
  .facade { padding: 26px; display: grid; gap: var(--neo-ecart-large); }
  .haut { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: var(--neo-ecart-large); align-items: center; }
  .pochette {
    width: 168px; height: 168px; padding: 8px; overflow: hidden;
    background: var(--neo-sol); border-radius: var(--neo-r-afficheur); box-shadow: var(--neo-creux-2);
  }
  .pochette :global(img) { border-radius: var(--rayon-2); width: 100%; height: 100%; object-fit: cover; }
  .afficheur { padding: 18px 20px; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .titre {
    margin: 0; font-size: var(--neo-t-titre); font-weight: var(--graisse-grasse); line-height: 1.15;
    color: var(--neo-encre); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .titre.rien { color: var(--neo-doux); font-weight: var(--graisse-normale); }
  .artiste { margin: 0; font-size: var(--neo-t-artiste); color: var(--neo-doux); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sep { margin: 0 6px; }
  .format {
    margin: 6px 0 0; display: flex; flex-wrap: wrap; gap: 10px;
    font-family: var(--neo-police-chiffres); font-size: var(--neo-t-format); color: var(--neo-doux);
  }
  .format b { color: var(--neo-etat); font-weight: var(--graisse-forte); }
  .avance { margin-top: 10px; }
  .avance :global(.time) { font-family: var(--neo-police-chiffres); font-size: var(--neo-t-format); color: var(--neo-doux); }
  .avance :global(.seek-track:not(.onde)),
  .avance :global(.seek-track:not(.onde):hover) {
    height: var(--neo-haut-jauge); background: var(--neo-sol); border-radius: var(--neo-r-jauge);
    box-shadow: var(--neo-creux-1);
  }
  /* La forme d'onde (« beaucoup trop fine », Bertrand, 28/11) : un rail en
     creux, assez haut pour lire l'enveloppe ; l'onde dessinée à l'intérieur. */
  .avance :global(.seek-track.onde),
  .avance :global(.seek-track.onde:hover) {
    height: var(--neo-haut-onde); padding: var(--neo-marge-onde) 10px; box-sizing: border-box;
    background: var(--neo-sol); border-radius: var(--neo-r-afficheur); box-shadow: var(--neo-creux-1);
  }
  .avance :global(.seek-track.onde .onde) { inset: var(--neo-marge-onde) 10px; }
  .avance :global(.seek-fill) { background: var(--neo-etat-fond); border-radius: var(--neo-r-jauge); }
  .direct {
    display: inline-flex; align-items: center; gap: 8px; justify-content: center; width: 100%;
    font-size: var(--neo-t-format); font-weight: var(--graisse-forte); color: var(--neo-etat);
  }
  .diode { width: 8px; height: 8px; border-radius: 50%; background: var(--pal-erreur); }
  .avance :global(.seek-thumb) { background: var(--neo-sol); box-shadow: var(--neo-relief-1); }
  .bas { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--neo-ecart-large); }
  .transport { display: flex; align-items: center; gap: 20px; }
  .rangee { display: grid; gap: 12px; }
  .rangee h2 { margin: 0; }
  .touches { display: flex; flex-wrap: wrap; gap: 12px; }
  @media (prefers-reduced-motion: reduce) {
    .avance :global(.seek-fill) { transition: none; }
  }
  /* Tablette : la pochette se retire, le VU reste à côté de l’afficheur. */
  @media (max-width: 1000px) {
    .haut { grid-template-columns: minmax(0, 1fr) auto; }
    .pochette { display: none; }
  }
  @media (max-width: 760px) {
    .lecture-neo { padding: 16px var(--s-marge-fiche) 32px; }
    .facade { padding: 18px; }
    .haut { grid-template-columns: minmax(0, 1fr); }
    .bas { justify-content: center; }
  }
</style>
