<script lang="ts">
  /**
   * Le bouton « … » d'une ligne de piste, POSABLE PARTOUT — client actuel.
   *
   * 🔴 `renesenses/tune-server-rust#1848`, Dominique Comet : « le menu
   * contextuel n'existe que dans la bibliothèque, jamais sur une piste de
   * service ». Vérifié sur la tête de `main` au 07/09/2026 : `TrackContextMenu`
   * n'était monté que dans `LibraryView.svelte`, trois fois. Le streaming, la
   * recherche, la file d'attente, les listes de lecture et les favoris
   * n'ouvraient AUCUN menu — leurs lignes n'avaient que deux ou trois icônes,
   * différentes d'un écran à l'autre.
   *
   * Ce composant est ce qui manquait pour uniformiser sans recopier : une
   * balise par ligne, l'état du menu, les gestes, les panneaux. Les écrans qui
   * l'accueillent ne gagnent qu'une ligne de balisage chacun.
   *
   * ## Il ne DÉCIDE de rien
   *
   * Le contenu vient de `lib/menuPiste`, l'apparence de `TrackContextMenu` :
   * les deux clients rendent la même liste, dans le même ordre, sous les mêmes
   * libellés. C'est tout l'objet du ticket.
   *
   * ## Ce qu'il sait faire seul, et ce qu'il demande à l'écran
   *
   * Lire, lire ensuite, mettre en file, « plus comme ça », les autres versions,
   * les étiquettes et l'ajout à une liste : il les tient seul, par les mêmes
   * routes que `PisteActions`.
   *
   * Aller à l'artiste et aller à l'album se décident à TROIS niveaux, dans cet
   * ordre : le relais de l'écran (`onAller…`, quand il sait mieux), puis
   * l'identifiant de BIBLIOTHÈQUE de la piste, puis — #869, famille C — sa
   * désignation CHEZ SON SERVICE, à condition que la coquille ait armé
   * `gestesNavigationService`. Aucun des trois : l'entrée disparaît, elle n'est
   * jamais grisée ni muette.
   */
  import { get } from 'svelte/store';
  import * as api from '../lib/api';
  import { corpsDeFile, corpsDeLecture, estPisteLocale } from '../lib/pisteFile';
  import { currentZoneId, playAndSync } from '../lib/stores/zones';
  import { queuePosition } from '../lib/stores/queue';
  import { notifications } from '../lib/stores/notifications';
  import { activeView, gestesNavigationService, pendingLibraryAlbum, pendingLibraryArtist } from '../lib/stores/navigation';
  import { destinationAlbum } from '../lib/routageAlbum';
  import { t as tr } from '../lib/i18n';
  import TrackContextMenu from './TrackContextMenu.svelte';
  import type { Track } from '../lib/types';
  interface Props {
    piste: Track;
    /**
     * Aller à l'artiste, quand l'écran sait le faire pour CETTE piste. Omis,
     * l'entrée disparaît. Une piste de la bibliothèque n'a pas besoin de ce
     * relais : le composant retombe sur `pendingLibraryArtist`.
     */
    onAllerArtiste?: () => void;
    /** Idem pour l'album. */
    onAllerAlbum?: () => void;
  }
  let { piste, onAllerArtiste, onAllerAlbum }: Props = $props();
  let ouvert = $state(false);
  /**
   * La boîte ÉCRAN du bouton, prise AU CLIC.
   *
   * #872 : le panneau est porté à la racine du document pour échapper à la
   * contention de peinture de la ligne. Il faut donc lui dire où était le
   * bouton — et le lui dire au moment du clic, pas plus tard : la ligne aura
   * pu défiler entre-temps.
   */
  let ancre = $state<DOMRect | null>(null);
  let occupe = $state(false);
  let panneauVersions = $state(false);
  let panneauEtiquettes = $state(false);
  let modalePlaylist = $state(false);
  const local = $derived(estPisteLocale(piste));
  /**
   * Les trois routes de bibliothèque — voisins acoustiques, autres versions,
   * étiquettes — prennent un `i64`. Une piste de service n'en a pas : les
   * entrées correspondantes sont ABSENTES, pas grisées.
   */
  const idBibliotheque = $derived(local && piste.id != null ? piste.id : null);
  const jouable = $derived(corpsDeLecture(piste) != null);
  /**
   * L'album et l'artiste de la piste CHEZ SON SERVICE — #869, famille C.
   *
   * Une piste de service n'a ni `artist_id` ni `album_id` numérique : les deux
   * entrées « Aller à… » disparaissaient, et le menu d'un titre Qobuz tombait à
   * trois entrées contre neuf (FabienM, fil 1739, point 2). Elles ne dépendaient
   * pourtant que des identifiants de BIBLIOTHÈQUE, alors que la piste porte de
   * quoi se désigner chez son service.
   *
   * 🔴 Repris mot pour mot de `v2/PisteActions.svelte:251-266`, qui le tient
   * depuis #3777 — mêmes champs, même module de décision (`routageAlbum`), même
   * garde. Recopier la RÈGLE aurait fait diverger les deux menus, ce qui est
   * exactement le reproche d'origine (#1848).
   *
   * `null` dès que la coquille ne sait pas les ouvrir : l'entrée est alors
   * ABSENTE plutôt qu'ouvrant sur rien.
   */
  const albumDeService = $derived.by(() => {
    if (local || !$gestesNavigationService) return null;
    const d = destinationAlbum({
      source: piste.source ?? null,
      album_id: (piste as any).album_id,
      album_title: piste.album_title ?? null,
    });
    return d?.type === 'album-service'
      ? { service: d.service, albumId: d.albumId, titre: d.titre }
      : null;
  });
  const artisteDeService = $derived.by(() => {
    if (local || !$gestesNavigationService) return null;
    const nom = (piste.artist_name ?? '').trim();
    return piste.source && nom ? { service: piste.source as string, nom } : null;
  });
  /** Aller à l'artiste : le relais de l'écran, la fiche de bibliothèque, ou le service. */
  const allerArtiste = $derived(
    onAllerArtiste ?? (piste.artist_id != null
      ? () => { pendingLibraryArtist.set(piste.artist_id!); activeView.set('library'); }
      : artisteDeService
        ? () => { $gestesNavigationService?.ouvrirArtiste(artisteDeService!); }
        : undefined),
  );
  const allerAlbum = $derived(
    // 🔴 L'identifiant de BIBLIOTHÈQUE d'abord, et SEULEMENT s'il est numérique.
    // `album_id` d'une piste de service est une CHAÎNE : `!= null` était vrai
    // pour elle et l'envoyait dans `pendingLibraryAlbum`, où rien ne l'attend.
    // `v2/PisteActions.svelte:280` tranche déjà comme ça.
    onAllerAlbum ?? (typeof piste.album_id === 'number' && piste.album_id > 0
      ? () => { pendingLibraryAlbum.set(piste.album_id as number); activeView.set('library'); }
      : albumDeService
        ? () => { $gestesNavigationService?.ouvrirAlbum(albumDeService!); }
        : undefined),
  );
  const capacites = $derived({
    jouable,
    idBibliotheque,
    // Une capacité qui ne tient que si quelqu'un sait la faire : voir plus haut.
    artistId: allerArtiste ? 1 : null,
    albumId: allerAlbum ? 1 : null,
    albumDeService,
    artisteDeService,
  });
  function lire() {
    const zid = get(currentZoneId);
    const corps = corpsDeLecture(piste);
    if (zid == null || !corps) return;
    playAndSync(zid, corps as any).catch(() => notifications.error($tr('v2.pa.playError' as any)));
  }
  /**
   * « Lire ensuite » insère au rang SUIVANT celui qui joue. Sans rang, la
   * route ajoute à la fin — ce serait l'entrée d'à côté, pas celle-ci.
   */
  async function enfiler(position: number | undefined, cle: string) {
    const zid = get(currentZoneId);
    const corps = corpsDeFile(piste, position);
    if (zid == null || !corps || occupe) return;
    occupe = true;
    try {
      await api.addToQueue(zid, corps);
      notifications.success($tr(cle as any).replace('{title}', piste.title ?? ''));
    } catch {
      notifications.error($tr('v2.pa.queueError' as any));
    }
    occupe = false;
  }
  /**
   * « Plus comme ça » — le rapprochement est le SERVEUR qui le fait
   * (`/library/tracks/{id}/similar`). Sans empreinte audio calculée la réponse
   * est VIDE : on le dit, plutôt que de ne rien faire en silence.
   */
  async function plusCommeCa() {
    const zid = get(currentZoneId);
    if (zid == null || idBibliotheque == null) return;
    try {
      const res = await api.getSimilarTracks(idBibliotheque, 50);
      const ids = (res.items ?? [])
        .map((x: any) => x.id)
        .filter((x: any): x is number => typeof x === 'number');
      if (ids.length === 0) { notifications.info($tr('library.noSimilar' as any)); return; }
      await playAndSync(zid, { track_ids: ids } as any);
    } catch {
      notifications.error($tr('library.similarError' as any));
    }
  }
</script>
<div class="track-more-wrap">
  <button class="track-more-btn" aria-haspopup="menu" aria-expanded={ouvert}
    title={$tr('library.moreOptions')} aria-label={$tr('library.moreOptions')}
    onclick={(e) => {
      e.stopPropagation(); e.preventDefault();
      ancre = (e.currentTarget as HTMLElement).getBoundingClientRect();
      ouvert = !ouvert;
    }}>
    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
      <circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>
    </svg>
  </button>
  {#if ouvert && ancre}
    <TrackContextMenu
      {ancre}
      {capacites}
      onClose={() => (ouvert = false)}
      onPlay={lire}
      onPlayNext={() => void enfiler(get(queuePosition) + 1, 'v2.pa.queuedNext')}
      onAddToQueue={() => void enfiler(undefined, 'v2.pa.queued')}
      onPlaySimilar={() => void plusCommeCa()}
      onOtherVersions={() => (panneauVersions = true)}
      onAddToPlaylist={() => (modalePlaylist = true)}
      onGoToArtist={allerArtiste}
      onGoToAlbum={allerAlbum}
      onTag={() => (panneauEtiquettes = true)}
    />
  {/if}
</div>
{#if panneauVersions && idBibliotheque != null}
  {#await import('./v2/VersionsPistePanneau.svelte') then m}
    <m.default trackId={idBibliotheque} titre={piste.title}
      onClose={() => (panneauVersions = false)} />
  {/await}
{/if}
{#if panneauEtiquettes && idBibliotheque != null}
  {#await import('./v2/EtiquettesPanneau.svelte') then m}
    <m.default itemType="track" itemId={idBibliotheque} nom={piste.title}
      onClose={() => (panneauEtiquettes = false)} />
  {/await}
{/if}
{#if modalePlaylist}
  {#await import('./AddToPlaylistModal.svelte') then m}
    <m.default track={piste} onClose={() => (modalePlaylist = false)} />
  {/await}
{/if}
<style>
  .track-more-wrap {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
  }
  .track-more-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--tune-text-secondary);
    cursor: pointer;
  }
  .track-more-btn:hover {
    background: var(--tune-surface-hover);
    color: var(--tune-text);
  }
</style>
