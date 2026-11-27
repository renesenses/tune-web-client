<script lang="ts">
  /**
   * « Lecture en cours » du thème Roon-like (itération 8, 27/11/2026).
   *
   * Une vraie page, et plus l'écran de Tune habillé : grande pochette à
   * gauche, titre en serif, artiste, album, la qualité du signal et la zone,
   * puis « À suivre » (la file). Le reste — paroles, crédits, minuterie,
   * VU-mètres — vit dans l'écran complet de Tune, ouvert par « Vue détaillée ».
   *
   * Les commandes de lecture restent dans la barre de transport, comme dans
   * les captures de référence.
   */
  import { t } from '../../lib/i18n';
  import { bulleTexte } from '../../lib/infobulleTexte';
  import { currentZone } from '../../lib/stores/zones';
  import { playbackState, seekPositionMs } from '../../lib/stores/nowPlaying';
  import SeekBar from '../partages/SeekBar.svelte';
  import { queueTracks, queuePosition } from '../../lib/stores/queue';
  import { favoriteTrackIds } from '../../lib/stores/profile';
  import { basculerFavoriLocal } from '../../lib/favorisLocaux';
  import { allerA } from '../../lib/stores/salon';
  import { duree, qualiteDeLaPiste, etatDuSignal } from '../../lib/interfaceSalon';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import IconeZone from '../partages/IconeZone.svelte';
  import IconeSalon from './IconeSalon.svelte';

  const zone = $derived($currentZone);
  const piste = $derived(zone?.current_track ?? null);
  const pisteId = $derived(piste?.track_id ?? piste?.id ?? null);
  const actif = $derived($playbackState === 'playing' || $playbackState === 'paused');
  const qualite = $derived(qualiteDeLaPiste(piste));
  const signal = $derived(etatDuSignal(zone?.signal_path ?? null));
  /** Les cinq titres qui suivent, dans l'ordre de la file. */
  const suivants = $derived(($queueTracks ?? []).slice(($queuePosition ?? 0) + 1, ($queuePosition ?? 0) + 6));
</script>

<div class="lecture" data-page-salon="lecture">
  {#if piste}
    <!-- Le fond : la pochette, floue et très atténuée (décor). -->
    <div class="fond" aria-hidden="true">
      <AlbumArt coverPath={piste.cover_path ?? null} albumId={piste.album_id ?? null} size={0} alt="" />
    </div>
    <div class="grille">
      <div class="pochette">
        <AlbumArt coverPath={piste.cover_path ?? null} albumId={piste.album_id ?? null} size={0} alt={piste.album_title ?? piste.title} />
      </div>
      <div class="infos">
        <p class="s-surtitre">{$t('nav.nowplaying' as any)}</p>
        <h1 class="titre" use:bulleTexte>{piste.title}</h1>
        {#if piste.artist_name}
          {#if piste.artist_id != null}
            <button class="artiste" onclick={() => allerA({ page: 'artiste', id: piste.artist_id! })}>{piste.artist_name}</button>
          {:else}<p class="artiste">{piste.artist_name}</p>{/if}
        {/if}
        {#if piste.album_title}
          <p class="album">
            {#if piste.album_id != null}
              <button class="lien-album" onclick={() => allerA({ page: 'album', id: piste.album_id! })}>{piste.album_title}</button>
            {:else}{piste.album_title}{/if}
            {#if piste.year}<span class="annee">· {piste.year}</span>{/if}
          </p>
        {/if}

        <div class="signal">
          {#if qualite}<span class="qualite" data-qualite-lecture>{qualite}</span>{/if}
          {#if signal}
            <span class="etat" class:parfait={signal === 'bitPerfect'} data-signal-lecture={signal}>
              <span class="point" aria-hidden="true"></span>{$t(`roonLike.lecture.${signal}` as any)}
            </span>
          {/if}
          {#if zone}
            <span class="zone"><IconeZone zone={zone} taille={15} />{zone.name}</span>
          {/if}
        </div>

        <!-- Retouche démo : la progression sur la page, comme la référence —
             temps écoulé, barre déplaçable, durée (`SeekBar`, la même que la
             barre de transport : mêmes gestes, même envoi au serveur). -->
        <div class="progression" data-progression-lecture>
          <SeekBar positionMs={$seekPositionMs} durationMs={piste.duration_ms ?? 0} enabled={actif} />
        </div>

        <div class="gestes">
          {#if pisteId != null}
            <button class="s-rond coeur" aria-pressed={$favoriteTrackIds.has(pisteId)} onclick={() => basculerFavoriLocal({ trackId: pisteId })}
              aria-label={$t('roonLike.favori' as any)} title={$t('roonLike.favori' as any)}>
              <IconeSalon nom="favoris" taille={17} plein={$favoriteTrackIds.has(pisteId)} />
            </button>
          {/if}
          <button class="detail" onclick={() => allerA({ page: 'tune', vue: 'nowplaying' })} data-vue-detaillee>
            {$t('roonLike.lecture.vueDetaillee' as any)}
          </button>
        </div>

        <section class="a-suivre">
          <div class="tete-suivre">
            <h2>{$t('roonLike.lecture.aSuivre' as any)}</h2>
            <button class="lien" onclick={() => allerA({ page: 'file' })}>{$t('roonLike.lecture.voirFile' as any)}</button>
          </div>
          {#each suivants as p, i (`${p.id ?? p.title}-${i}`)}
            <div class="ligne">
              <span class="vignette"><AlbumArt coverPath={p.cover_path ?? null} albumId={p.album_id ?? null} size={0} vignette alt="" /></span>
              <span class="noms">
                <span class="nom" use:bulleTexte>{p.title}</span>
                {#if p.artist_name}<span class="sous" use:bulleTexte>{p.artist_name}</span>{/if}
              </span>
              <span class="duree">{duree(p.duration_ms)}</span>
            </div>
          {:else}
            <p class="s-vide">{$t('roonLike.lecture.rienApres' as any)}</p>
          {/each}
        </section>
      </div>
    </div>
  {:else}
    <p class="s-vide rien">{$t('roonLike.transport.rien' as any)}</p>
  {/if}
</div>

<style>
  .lecture { position: relative; min-height: 100%; overflow: hidden; }
  .fond { position: absolute; inset: 0; z-index: 0; opacity: var(--s-opacite-fond-lecture); filter: blur(var(--s-flou-fond-lecture)); transform: scale(1.15); pointer-events: none; }
  .fond :global(.album-art), .fond :global(img) { width: 100%; height: 100%; object-fit: cover; border-radius: 0; }
  .grille {
    position: relative; z-index: 1;
    display: grid; grid-template-columns: var(--s-pochette-lecture) minmax(0, 1fr); gap: var(--s-ecart-lecture);
    align-items: start;
    max-width: var(--s-largeur-bandeau); margin: 0 auto;
    padding: var(--s-marge-fiche) var(--s-marge-page);
  }
  .pochette { width: var(--s-pochette-lecture); aspect-ratio: 1; box-shadow: var(--s-ombre); border-radius: var(--s-r-pochette); overflow: hidden; }
  .pochette :global(.album-art), .pochette :global(img) { width: 100%; height: 100%; border-radius: var(--s-r-pochette); }
  .infos { min-width: 0; padding-top: 8px; }
  .titre {
    margin: 6px 0 10px; font-family: var(--s-police-titre); font-weight: var(--s-graisse-titre);
    font-size: var(--s-t-titre-album); line-height: 1.05; letter-spacing: -.01em; color: var(--s-txt);
    display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
  }
  .artiste {
    display: inline-block; margin: 0; padding: 0; border: 0; background: none; cursor: pointer; font: inherit;
    font-size: var(--s-t-sous-titre); color: var(--s-acc-texte); text-align: left;
  }
  p.artiste { cursor: default; color: var(--s-txt2); }
  .album { margin: 8px 0 0; font-size: var(--s-t-section); color: var(--s-txt2); }
  .lien-album { padding: 0; border: 0; background: none; font: inherit; color: inherit; cursor: pointer; text-align: left; }
  .lien-album:hover, .artiste:hover { text-decoration: underline; }
  .annee { margin-left: 4px; color: var(--s-txt3); }
  .signal { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; margin-top: 22px; font-size: var(--s-t-petit); color: var(--s-txt2); }
  .qualite { padding: 4px 10px; border-radius: var(--s-r-pilule); background: var(--s-puce); color: var(--s-puce-txt); letter-spacing: var(--s-interlettre-capitales); font-size: var(--s-t-mini); text-transform: uppercase; }
  .etat { display: inline-flex; align-items: center; gap: 6px; }
  .point { width: 8px; height: 8px; border-radius: 50%; background: var(--s-txt3); }
  .etat.parfait .point { background: var(--s-acc); }
  .etat.parfait { color: var(--s-acc-texte); }
  .zone { display: inline-flex; align-items: center; gap: 6px; }
  .progression { margin-top: 18px; max-width: var(--s-largeur-colonne); color: var(--s-txt2); font-size: var(--s-t-petit); }
  .progression :global(.seek-track) { height: var(--s-haut-avance); }
  /* Le cœur et « Vue détaillée » : même hauteur, même filet contrasté (≥ 3:1
     pour le contour, texte ≥ 4.5:1), alignés au centre. */
  .gestes { display: flex; align-items: center; gap: 10px; margin-top: 20px; }
  .gestes .coeur { width: var(--s-rond); height: var(--s-rond); border-color: var(--s-txt3); color: var(--s-txt); }
  .detail {
    display: inline-flex; align-items: center; box-sizing: border-box;
    height: var(--s-rond); padding: 0 18px; border-radius: var(--s-r-pilule); cursor: pointer;
    border: 1px solid var(--s-txt3); background: var(--s-tuile); color: var(--s-txt);
    font: inherit; font-size: var(--s-t-texte); font-weight: var(--s-graisse-moyenne); line-height: 1;
  }
  .detail:hover { background: var(--s-survol); }
  .detail:focus-visible, .gestes .coeur:focus-visible { outline: 2px solid var(--s-acc); outline-offset: 2px; }
  .a-suivre { margin-top: 40px; max-width: var(--s-largeur-colonne); }
  .tete-suivre { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--s-line); padding-bottom: 8px; }
  h2 { margin: 0; font-size: var(--s-t-section); font-weight: var(--s-graisse-moyenne); color: var(--s-txt); }
  .lien { padding: 0; border: 0; background: none; cursor: pointer; font: inherit; font-size: var(--s-t-petit); color: var(--s-acc-texte); }
  .ligne { display: grid; grid-template-columns: var(--s-vignette-file) minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--s-line); }
  .vignette { width: var(--s-vignette-file); height: var(--s-vignette-file); display: block; border-radius: var(--s-r-pochette); overflow: hidden; }
  .noms { display: flex; flex-direction: column; min-width: 0; }
  .nom { font-size: var(--s-t-texte); font-weight: var(--s-graisse-moyenne); color: var(--s-txt); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sous { font-size: var(--s-t-petit); color: var(--s-txt2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .duree { font-size: var(--s-t-petit); color: var(--s-txt3); font-variant-numeric: tabular-nums; }
  .rien { padding: var(--s-marge-fiche) var(--s-marge-page); }
  @media (max-width: 760px) {
    .grille { grid-template-columns: 1fr; gap: 20px; }
    .pochette { width: 100%; }
  }
</style>
