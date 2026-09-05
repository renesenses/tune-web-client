<script lang="ts">
  /**
   * UNE ligne de piste, partout dans le nouveau client.
   *
   * Bertrand, 05/09/2026 : « Tous les écrans avec des pistes : reprendre le
   * design précédent » — puis, précisé : la richesse du client actuel PLUS la
   * barre d'actions révélée au survol.
   *
   * Le nouveau client avait des lignes plus sobres que l'ancien : ni pochette
   * sur certains écrans, ni puces de métadonnées, ni badge de qualité. Ce qui
   * se lisait d'un coup d'œil — un disque est-il en 24/96, en quel format,
   * de quelle année — demandait d'ouvrir la piste.
   *
   * ## Une ligne, quatre écrans
   *
   * Album, playlist, Bibliothèque et Recherche affichaient chacun leur propre
   * ligne, avec sa grille et ses variantes. Reprendre la richesse quatre fois
   * aurait fait quatre lignes qui divergent à la première correction — c'est
   * exactement ce qui était arrivé aux cœurs de streaming (#1478).
   *
   * ## Les puces suivent le RÉGLAGE, pas ce composant
   *
   * `displayFields` est choisi par l'utilisateur dans les Réglages, par
   * profil. La ligne n'en décide pas : elle rend ce qui est demandé. Un
   * utilisateur qui n'en veut aucune obtient une ligne nue, ce qui est le
   * comportement du client actuel.
   *
   * ## Ce qui reste à l'appelant
   *
   * Le geste de LECTURE. Une piste d'album se lit dans le contexte de son
   * album — `playAlbum(i)`, pas `play(track)` — et une piste de file saute au
   * rang. Ce composant ne peut pas le deviner, il le reçoit.
   */
  import AlbumArt from '../AlbumArt.svelte';
  import MetadataChips from '../MetadataChips.svelte';
  import QualityBadge from '../QualityBadge.svelte';
  import PisteActions from './PisteActions.svelte';
  import { displayFields } from '../../lib/stores/displayFields';
  import { champsUtiles } from '../../lib/champsLigne';
  import { currentTrackId } from '../../lib/stores/nowPlaying';
  import { formatTime } from '../../lib/utils';
  import type { Track } from '../../lib/types';

  interface Props {
    piste: Track;
    /** Ce que fait un clic sur la ligne. */
    onLire: () => void;
    /** Numéro affiché à gauche. Absent = pas de colonne de numéro. */
    numero?: number | null;
    /** Masque la pochette là où elle n'apporte rien — un album, où les vingt
     *  lignes porteraient la même image. */
    pochette?: boolean;
    /** Affiche l'album à côté de l'artiste. Faux sur un écran d'album. */
    avecAlbum?: boolean;
  }
  let { piste, onLire, numero = null, pochette = true, avecAlbum = true }: Props = $props();

  const enLecture = $derived(piste.id != null && piste.id === $currentTrackId);
  const sousTitre = $derived(
    [piste.artist_name, avecAlbum ? piste.album_title : null].filter(Boolean).join(' · '),
  );
  /**
   * 🔴 Les puces ne REDISENT pas ce que la ligne montre déjà.
   *
   * Bertrand, 05/09/2026 : « Évite la duplication d'info et cela doit résoudre
   * le problème ». Sur une piste réelle, sept des quinze puces répétaient
   * l'artiste, le numéro, le format, la fréquence, la durée, le genre en JSON
   * brut et le nom de fichier — tous déjà à l'écran, à quelques pixels de là.
   *
   * Ce n'est pas un plafond : rien n'est caché, rien n'est tronqué. Ce qui
   * reste apprend quelque chose.
   *
   * Les drapeaux décrivent CETTE ligne : si un jour elle cesse d'afficher le
   * badge de qualité, le format redeviendra une information utile et
   * reviendra tout seul.
   */
  const puces = $derived(
    champsUtiles($displayFields ?? [], {
      artiste: true,   // écrit sous le titre
      album: avecAlbum, // idem, quand on l'affiche
      duree: true,     // sa propre colonne, à droite
      qualite: true,   // le badge, juste avant la durée
      numero: numero != null,
    }),
  );
</script>

<div class="trk" class:np={enLecture}>
  <button class="tclick" onclick={onLire}>
    {#if numero != null}<span class="n">{numero}</span>{/if}
    {#if pochette}
      <span class="cvsm">
        <AlbumArt coverPath={piste.cover_path} albumId={piste.album_id ?? null} size={0}
          alt={piste.title} source={piste.source} fallbackInitials={piste.title?.slice(0, 1)} />
      </span>
    {/if}
    <span class="ti">
      <!-- `title` : ces deux lignes s'elident. Sans lui, un titre long est
           illisible et rien ne permet d'en lire la fin (Bilou, forum). -->
      <span class="tt" title={piste.title}>{piste.title}</span>
      {#if sousTitre}<em title={sousTitre}>{sousTitre}</em>{/if}
      {#if puces.length}
        <span class="puces"><MetadataChips track={piste} fields={puces} /></span>
      {/if}
    </span>
  </button>

  <span class="qb"><QualityBadge format={piste.format} sampleRate={piste.sample_rate}
    bitDepth={piste.bit_depth} source={piste.source} /></span>
  <span class="dur">{piste.duration_ms ? formatTime(piste.duration_ms) : ''}</span>
  <PisteActions {piste} />
</div>

<style>
  .trk{display:grid; grid-template-columns:1fr auto auto auto; align-items:center; gap:14px; width:100%;
    padding:0 10px; border-radius:9px; color:var(--v2-txt2)}
  .trk:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .trk.np{color:var(--v2-acc1)}

  /* Le clic de LECTURE porte la grille du titre : la ligne n'est plus un
     bouton depuis qu'elle accueille la barre d'actions, et un bouton dans un
     bouton est du balisage invalide. */
  .tclick{display:flex; align-items:center; gap:14px; min-width:0; width:100%;
    padding:8px 0; border:0; background:transparent; color:inherit; cursor:pointer;
    text-align:left; font-family:inherit}

  .n{flex:0 0 26px; font:11px var(--v2-mono); color:var(--v2-txt3); text-align:right}
  .trk.np .n{color:var(--v2-acc1)}
  .cvsm{flex:0 0 auto; width:44px; height:44px; border-radius:6px; overflow:hidden}

  .ti{min-width:0; flex:1; display:flex; flex-direction:column; gap:2px}
  .tt{font-size:13.5px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .ti em{font:11px var(--v2-sans); font-style:normal; color:var(--v2-txt3);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  /* Les puces vivent dans le client actuel avec leurs propres couleurs : on
     les laisse parler, on ne fait que leur donner leur ligne. */
  .puces{display:flex; flex-wrap:wrap; gap:5px; margin-top:2px}

  .qb{flex:0 0 auto}
  .dur{font:11.5px var(--v2-mono); color:var(--v2-txt3)}
</style>
