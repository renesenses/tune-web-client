<script lang="ts">
  /**
   * Fiche playlist du nouveau client (direction Levente). Ouvre par-dessus la
   * grille (la section hôte est `position:relative`). Gère deux natures :
   *   - locale    : pistes via getPlaylistTracks ; l'Expert peut renommer,
   *                 supprimer la playlist et retirer un titre.
   *   - streaming : pistes du service (lecture seule), lues via son id source.
   * Détail technique (fréquence/profondeur) réservé à l'Expert, comme ailleurs.
   */
  import * as api from '../../lib/api';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { lireListeAleatoire } from '../../lib/lectureEnMasse';
  import { t as tr } from '../../lib/i18n';
  import { currentZoneId, playAndSync } from '../../lib/stores/zones';
  // Un échec de lecture DOIT se voir : ces appels finissaient tous par un
  // `.catch(() => {})` (#3732). Le message du serveur — qui nomme l'appareil
  // manquant — n'atteignait jamais l'écran.
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import { formatDuration, errText } from '../../lib/utils';
  import type { Track, Playlist, StreamingPlaylist } from '../../lib/types';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import ListePistesV2 from './ListePistesV2.svelte';
  import { lireListe } from '../../lib/lectureEnMasse';
  import { lireChoix, ecrireChoix } from '../../lib/preferencesEcran';
  import { CLES_TRI_PISTES, LIBELLES_TRI_PISTES, trierPistes, type CleTriPistes, type SensTriPistes } from '../../lib/trierPistes';
  import { favoritePlaylistIds, favoriteStreamingKeys, streamingFavKey } from '../../lib/stores/profile';
  import { basculerFavoriLocal } from '../../lib/favorisLocaux';
  import { toggleStreamingFavorite } from '../../lib/streamingFavorites';
  import { notifications } from '../../lib/stores/notifications';
  import { cibleDeService, type CibleEtiquette } from '../../lib/cibleEtiquette';
  import { rangsApresDeplacement } from '../../lib/playlistService';
  import { corpsDeFileListe, estPisteLocale } from '../../lib/pisteFile';

  type Item =
    | { kind: 'local'; pl: Playlist }
    | { kind: 'streaming'; service: string; pl: StreamingPlaylist };

  let { item, onClose, onChanged }: { item: Item; onClose: () => void; onChanged?: () => void } = $props();

  let tracks = $state<Track[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let renaming = $state(false);
  let draft = $state('');
  /**
   * MODE ÉDITION. Bertrand, 05/09/2026 : « il faudrait aussi un bouton éditer
   * playlist pour modifier son titre et le contenu ».
   *
   * Renommer, supprimer et retirer une piste existaient — mais tous derrière
   * le niveau EXPERT, et sans rien pour les annoncer. Modifier sa propre
   * playlist n'est pas une opération d'expert : c'est le geste ordinaire de
   * qui en tient une.
   *
   * Un mode, et non trois boutons permanents : la suppression et les croix de
   * retrait sont destructrices, elles n'ont pas leur place dans l'écran de
   * lecture. On y entre, on modifie, on en sort.
   */
  let edition = $state(false);

  /* ---------------- Favori ---------------- */
  /**
   * Bertrand, 05/09/2026 : « ET bouton favori sur la playlist ?? ». Il n'y en
   * avait pas — ni pour une playlist locale, ni pour une playlist de service,
   * alors que les deux tables savent les stocker.
   */
  const cleService = $derived(
    item.kind === 'streaming'
      ? streamingFavKey('playlist', item.service, String(item.pl.source_id))
      : null,
  );
  const enFavori = $derived(
    item.kind === 'local' && item.pl.id != null
      ? $favoritePlaylistIds.has(item.pl.id)
      : cleService != null && $favoriteStreamingKeys.has(cleService),
  );
  let bascule = $state(false);
  async function basculerFavori() {
    if (bascule) return;
    bascule = true;
    try {
      if (item.kind === 'local' && item.pl.id != null) {
        await basculerFavoriLocal({ playlistId: item.pl.id });
      } else if (item.kind === 'streaming') {
        await toggleStreamingFavorite({
          itemType: 'playlist', service: item.service, serviceId: String(item.pl.source_id),
          title: item.pl.name, coverUrl: item.pl.cover_path ?? undefined,
        });
      }
    } catch { /* le cœur reprend son état au prochain relevé */ }
    bascule = false;
  }

  /* ---------------- Export ---------------- */
  let exportEnCours = $state(false);
  async function exporter() {
    if (item.kind !== 'local' || item.pl.id == null || exportEnCours) return;
    exportEnCours = true;
    try {
      const nom = await api.exportPlaylist(item.pl.id, 'm3u');
      notifications.success($tr('v2.pl.exported' as any).replace('{file}', nom));
    } catch {
      notifications.error($tr('v2.pl.exportError' as any));
    }
    exportEnCours = false;
  }
  const isLocal = $derived(item.kind === 'local');
  const title = $derived(item.pl.name);

  /**
   * ÉTIQUETER LA PLAYLIST DEPUIS SA FICHE — le même trou que la fiche album.
   *
   * La vignette de `PlaylistsV2` porte le bouton depuis #1238 (`pl.id != null`) ;
   * la fiche, elle, n'avait ni bouton ni panneau. `playlist` fait partie des
   * quatre `TAGGABLE_ITEM_TYPES` du serveur, pour les DEUX espaces.
   *
   * Locale → son identifiant. De service → la paire `source` + `source_id`,
   * par l'aide partagée. `source` retombe sur le service de l'item : une
   * `StreamingPlaylist` le porte, mais le laisser deviner évite le cas où la
   * liste vient d'une réponse qui ne l'a pas recopié.
   *
   * `null` — donc pas de bouton — pour une playlist locale sans identifiant :
   * il n'y a alors rien à désigner.
   */
  const cibleEtiquettes = $derived<CibleEtiquette | null>(
    item.kind === 'local'
      ? item.pl.id != null
        ? { itemType: 'playlist', itemId: item.pl.id }
        : null
      : cibleDeService('playlist', {
          ...(item.pl as any),
          source: item.pl.source ?? item.service,
          source_id: item.pl.source_id,
        }),
  );
  let etiquettesOuvertes = $state(false);

  function load() {
    loading = true; error = null;
    const p = item.kind === 'local'
      ? api.getPlaylistTracks(item.pl.id as number)
      : api.getStreamingPlaylistTracks(item.service, item.pl.source_id);
    p.then((t) => { tracks = t; })
      .catch((e) => { error = errText(e) ?? 'Chargement impossible'; })
      .finally(() => { loading = false; });
  }
  $effect(() => { load(); });

  /** La liste mêle-t-elle des provenances ? (#4889 : Tune + services.) */
  const mixte = $derived(new Set(tracks.map((t) => (estPisteLocale(t) ? 'local' : String(t.source ?? '')))).size > 1);
  const totalMs = $derived(tracks.reduce((s, t) => s + (t.duration_ms ?? 0), 0));

  /**
   * TRI des pistes — Bertrand, 17/09/2026 (voir `lib/trierPistes`). Mémorisé
   * par écran. `ordre` = l'ordre de la playlist, le seul où déplacer une piste
   * a un sens : hors de lui, les flèches de déplacement sont désactivées.
   */
  let triPistes = $state<CleTriPistes>(lireChoix<CleTriPistes>('v2.playlist.pistes.tri', CLES_TRI_PISTES, 'ordre'));
  let sensPistes = $state<SensTriPistes>(lireChoix<SensTriPistes>('v2.playlist.pistes.sens', ['asc', 'desc'], 'asc'));
  $effect(() => { ecrireChoix('v2.playlist.pistes.tri', triPistes); });
  $effect(() => { ecrireChoix('v2.playlist.pistes.sens', sensPistes); });
  const pistesVues = $derived(trierPistes(tracks, triPistes, sensPistes));
  const ordreNaturel = $derived(triPistes === 'ordre' && sensPistes === 'asc');
  /** L'index d'une piste AFFICHÉE dans la liste réelle — les routes d'écriture
   *  parlent en rangs de la playlist, pas en rangs d'affichage. */
  const rangReel = (t: Track) => tracks.indexOf(t);

  /**
   * « Lecture aleatoire » de la liste — #1947.
   *
   * Aucune portee serveur ici : `api.shuffleAll` connait album, artiste, genre
   * et repertoire, pas les listes de lecture. On melange donc la liste qu'on a,
   * avec le SEUL melange du depot (`lib/shuffle`, Fisher-Yates), et on l'envoie.
   * Le drapeau `shuffle` de la zone n'est pas touche.
   */
  let melangeEnCours = $state(false);
  async function lireAleatoire() {
    const zid = zoneRequise();
    if (zid == null) return;
    melangeEnCours = true;
    try {
      const n = await lireListeAleatoire(tracks, {
        lire: (c: any) => playAndSync(zid, c),
        enfiler: (c: any) => api.addToQueue(zid, c),
      });
      if (!n) notifications.error($tr('library.noTracks'));
    } catch (e) {
      notifications.error(errText(e) ?? $tr('common.error'));
    }
    melangeEnCours = false;
  }
  function playFrom(startIndex = 0) {
    const zid = zoneRequise();
    if (zid == null) return;
    // Liste TRIÉE : « lire depuis ici » suit l'ordre affiché, pas celui de la
    // playlist — `start_index` du serveur ne connaît que ce dernier.
    if (!ordreNaturel) {
      void lireListe(pistesVues.slice(startIndex), {
        lire: (c: any) => playAndSync(zid, c),
        enfiler: (c: any) => api.addToQueue(zid, c),
      }).catch(signalerEchecLecture);
      return;
    }
    if (item.kind === 'local') {
      playAndSync(zid, { playlist_id: item.pl.id as number, start_index: startIndex }).catch(signalerEchecLecture);
    } else {
      // `item.service`, PAS `item.pl.source` : les playlists rendues par
      // `/streaming/{service}/playlists` ne portent aucun champ `source` —
      // mesure sur le .18 le 02/09/2026, les clefs sont exactement
      // `cover_path, description, name, owner, source_id, track_count`.
      //
      // `JSON.stringify` supprime la clef valant `undefined` : le corps partait
      // avec le seul `streaming_playlist_id`, que le serveur n'apparie qu'AVEC
      // `source`. Aucune source reconnue, il retombait sur « reprendre la
      // lecture en cours » — cliquer Lire relançait le morceau du moment.
      // Bertrand, 02/09/2026. Le service est deja celui avec lequel on a
      // charge les pistes deux lignes plus haut.
      playAndSync(zid, { streaming_playlist_id: item.pl.source_id, source: item.service as any, start_index: startIndex }).catch(signalerEchecLecture);
    }
  }
  function addQueue() {
    const zid = zoneRequise();
    if (zid == null) return;
    // #4889 — une playlist Tune peut porter des titres de SERVICE (id nul) :
    // filtrer les `id` les laissait hors de la file. Le corps partagé désigne
    // chaque ligne, par son id ou par sa paire service + identifiant.
    const corps = corpsDeFileListe(tracks);
    if (corps) api.addToQueue(zid, corps).catch(() => {});
  }
  function commitRename() {
    if (item.kind !== 'local' || item.pl.id == null) { renaming = false; return; }
    const name = draft.trim();
    if (!name || name === item.pl.name) { renaming = false; return; }
    api.updatePlaylist(item.pl.id, { name })
      .then(() => { item.pl.name = name; onChanged?.(); })
      .catch(() => {})
      .finally(() => { renaming = false; });
  }
  function removeAt(i: number) {
    if (item.kind !== 'local' || item.pl.id == null) return;
    api.removePlaylistTrackAt(item.pl.id, i)
      .then(() => { tracks = tracks.filter((_, k) => k !== i); onChanged?.(); })
      .catch(() => {});
  }

  /** Un déplacement est en cours : on n'en accepte pas un second par-dessus. */
  let deplacement = $state(false);

  /**
   * Déplace une piste d'un rang, et enregistre le nouvel ordre.
   *
   * ## Pourquoi des boutons et pas un glisser-déposer
   *
   * L'écran hérité réordonne par glisser-déposer, qui n'est atteignable ni au
   * clavier ni au lecteur d'écran. Deux boutons font le même travail, sont
   * utilisables par tout le monde, et ne demandent rien à `ListePistesV2` —
   * que six écrans partagent. Le glisser-déposer pourra s'ajouter par-dessus ;
   * l'inverse — rendre accessible un glisser-déposer déjà écrit — coûte plus.
   *
   * ## Optimiste, mais jamais menteur
   *
   * La liste bouge tout de suite, puis le serveur est prévenu. En cas d'échec,
   * l'écran hérité recharge EN SILENCE (`console.error`) : l'utilisateur voit
   * sa piste revenir à sa place sans comprendre. Ici l'échec est DIT, et la
   * liste rechargée — un écran qui ment est pire qu'un écran qui refuse.
   */
  async function deplacer(de: number, versLeBas: boolean) {
    if (item.kind !== 'local' || item.pl.id == null || deplacement) return;
    const vers = de + (versLeBas ? 1 : -1);
    if (vers < 0 || vers >= tracks.length) return;
    const avant = tracks;
    // #4889 — le nouvel ordre en RANGS ACTUELS, pas en identifiants : une
    // ligne de SERVICE (id nul) se déplace aussi, et une piste présente deux
    // fois reste deux lignes distinctes. Réassigné, jamais muté en place.
    const positions = rangsApresDeplacement(avant.length, de, vers);
    tracks = positions.map((k) => avant[k]);
    deplacement = true;
    try {
      await api.reorderPlaylistTracks(item.pl.id, positions);
      onChanged?.();
    } catch (e) {
      tracks = avant;
      notifications.error(errText(e) ?? $tr('common.error'));
    } finally {
      deplacement = false;
    }
  }
  function trackTech(t: Track): string {
    const rate = t.sample_rate ? `${Math.round(t.sample_rate / 100) / 10} kHz` : '';
    const depth = t.bit_depth ? `${t.bit_depth}-bit` : '';
    return [t.format?.toUpperCase(), rate, depth].filter(Boolean).join(' · ');
  }
</script>

<div class="v2-pldetail tune-v2">
  <button class="close" onclick={onClose} aria-label="Fermer">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
  </button>

  <div class="head">
    <div class="art" class:stream={!isLocal}>
      {#if isLocal}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7h11M4 12h11M4 17h7M17 17V7l4 2"/></svg>
      {:else}
        <AlbumArt coverPath={item.kind === 'streaming' ? item.pl.cover_path : null} albumId={null} size={0} alt={title} fallbackInitials={title?.slice(0,1)} />
      {/if}
    </div>
    <div class="meta">
      <div class="kind">{isLocal ? 'Playlist' : (item.kind === 'streaming' ? item.service : '')}</div>
      {#if renaming}
        <input class="rn" bind:value={draft} onblur={commitRename} onkeydown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') renaming = false; }} />
      {:else}
        <h1>{title}</h1>
      {/if}
      {#if item.pl.description}<div class="desc">{item.pl.description}</div>{/if}
      <div class="facts">
        <span>{$tr((tracks.length > 1 ? 'v2.common.trackCountMany' : 'v2.common.trackCountOne') as any).replace('{n}', String(tracks.length))}</span>
        {#if totalMs}<span>{formatDuration(totalMs)}</span>{/if}
      </div>
      <div class="actions">
        <button class="play" onclick={() => playFrom(0)}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8V4z"/></svg>{$tr('common.play' as any)}
        </button>
        <button class="ghost" onclick={lireAleatoire} disabled={melangeEnCours}
          title={$tr('library.shuffle')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>{$tr('library.shuffle')}
        </button>
        <button class="ghost" onclick={addQueue}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h13M4 11h13M4 16h8M18 15l3 2-3 2z"/></svg>{$tr('v2.ms.addToQueue' as any)}
        </button>
        <!-- Le CŒUR d'abord : il vaut pour les deux sortes de playlist, la
             locale par son identifiant, celle d'un service par la paire
             service + `source_id`. Deux tables, deux chemins. -->
        <button class="ghost sm coeur" class:on={enFavori} onclick={basculerFavori} disabled={bascule}
          aria-pressed={enFavori}
          title={$tr(enFavori ? 'favorites.removeAlbum' : 'favorites.addAlbum')}>
          <svg viewBox="0 0 24 24" fill={enFavori ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          {$tr(enFavori ? 'favorites.inFavorites' : 'favorites.addAlbum')}
        </button>

        <!-- ÉTIQUETTES — vaut pour les deux sortes de playlist, la locale par
             son identifiant, celle d'un service par la paire. Absent quand il
             n'y a rien à désigner : voir `cibleEtiquettes`. -->
        {#if cibleEtiquettes}
          <button class="ghost sm" onclick={() => (etiquettesOuvertes = true)}
            aria-haspopup="dialog" aria-expanded={etiquettesOuvertes}
            title={$tr('v2.cover.tags' as any)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.42 0l8.58-8.58a1 1 0 0 0 0-1.42z"/><circle cx="6.5" cy="6.5" r="1.2" fill="currentColor"/></svg>
            {$tr('v2.cover.tags' as any)}
          </button>
        {/if}

        <!-- EXPORT : la route ne connaît que les playlists locales, une playlist
             de service n'ayant pas d'identifiant chez nous. -->
        {#if isLocal}
          <button class="ghost sm" onclick={exporter} disabled={exportEnCours}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
            {$tr('v2.pl.export' as any)}
          </button>
        {/if}

        <!-- Une playlist de SERVICE ne s'édite pas : elle vit chez Qobuz ou
             Tidal, et nos routes d'écriture ne la connaissent pas. -->
        {#if isLocal}
          <button class="ghost sm" class:on={edition} onclick={() => { edition = !edition; renaming = false; }}
            aria-pressed={edition}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
            {$tr(edition ? 'v2.pl.editDone' as any : 'v2.pl.edit' as any)}
          </button>
        {/if}
        {#if edition && isLocal}
          <button class="ghost sm" onclick={() => { draft = item.pl.name; renaming = true; }}>{$tr('v2.pl.rename' as any)}</button>
          <button class="ghost sm danger" onclick={() => { if (item.kind === 'local' && item.pl.id != null) api.deletePlaylist(item.pl.id).then(() => { onChanged?.(); onClose(); }).catch(() => {}); }}>{$tr('v2.pl.delete' as any)}</button>
        {/if}
        <!-- On DIT pourquoi il n'y a pas de bouton, au lieu de laisser chercher.
             Le client porte bien une fonction `importPlaylist`, mais elle vise
             `POST /playlists/import`, qui n'existe pas : le serveur n'a que
             `/import/m3u`, `/import/m3u-url` et `/import/linn`. Personne ne
             l'appelle. Proposer « Importer » serait un bouton mort. -->
        {#if !isLocal}
          <span class="chez">{$tr('v2.pl.remoteHint' as any).replace('{service}', item.kind === 'streaming' ? item.service : '')}</span>
        {/if}
      </div>
    </div>
  </div>

  <div class="tracks">
    {#if loading}
      <div class="state">{$tr('v2.common.loadingTracks' as any)}</div>
    {:else if error}
      <div class="state err">{error}</div>
    {:else if !tracks.length}
      <div class="state">{$tr('v2.pl.empty' as any)}</div>
    {:else}
      <!-- Fabien, fil 1780 (point 12, issue #1057) : la vignette des titres
           manquait sur une playlist Qobuz en mode tableau — même règle que
           l'Historique (#3823). -->
      <div class="tri">
        <label class="tricol">
          <span>{$tr('v2.fav.sortBy' as any)}</span>
          <select bind:value={triPistes} aria-label={$tr('v2.fav.sortBy' as any)}>
            {#each CLES_TRI_PISTES as k (k)}<option value={k}>{$tr(LIBELLES_TRI_PISTES[k] as any)}</option>{/each}
          </select>
          <button class="sens" type="button" onclick={() => (sensPistes = sensPistes === 'asc' ? 'desc' : 'asc')}
            title={$tr((sensPistes === 'asc' ? 'common.ascending' : 'common.descending') as any)}
            aria-label={$tr((sensPistes === 'asc' ? 'common.ascending' : 'common.descending') as any)}>
            {#if sensPistes === 'asc'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M6 13l6 6 6-6"/></svg>
            {/if}
          </button>
        </label>
      </div>
      <!-- #4889 — le RANG pour clé : une playlist Tune mêle désormais des
           lignes de service (id nul) et de bibliothèque. La clé par défaut
           (`id ?? rang`) pouvait faire coïncider l'id 3 d'une piste locale et
           le rang 3 d'un titre Bandcamp — `each_key_duplicate`. Même règle que
           `PlaylistManagerView`. `sourceEnTableau` : la liste est MIXTE, on
           dit d'où vient chaque ligne (#1113). -->
      <ListePistesV2 pistes={pistesVues} pochetteEnTableau clef={(_p, i) => i} sourceEnTableau={mixte} onLire={(_p, i) => playFrom(i)} onLireDepuis={(_p, i) => playFrom(i)} apres={suffixe} largeurApres="100px" />
      {#snippet suffixe(_t: any, i: number)}
        <!-- Les boutons deviennent une COLONNE de la ligne. Le fragment est
             compilé ici : ses styles le suivent.

             100px est une LITTÉRALE, pas une expression conditionnelle, même
             si la colonne reste vide hors édition. Une largeur qui change
             selon l'état se résoudrait différemment dans l'en-tête et dans
             les lignes, et les colonnes ne tomberaient plus en face —
             `colonnesPistes` garde précisément cela. -->
        {#if edition && isLocal}
          <button class="rm mv" onclick={() => deplacer(i, false)} disabled={!ordreNaturel || i === 0 || deplacement}
            aria-label={$tr('playlist.moveUp')} title={$tr('playlist.moveUp')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
          </button>
          <button class="rm mv" onclick={() => deplacer(i, true)} disabled={!ordreNaturel || i === tracks.length - 1 || deplacement}
            aria-label={$tr('playlist.moveDown')} title={$tr('playlist.moveDown')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
          </button>
          <button class="rm" onclick={() => removeAt(rangReel(_t))} aria-label={$tr('v2.pl.remove' as any)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>
          </button>
        {/if}
      {/snippet}
    {/if}
  </div>
</div>

<!-- Le PANNEAU partagé, chargé à la demande — celui des vignettes. -->
{#if etiquettesOuvertes && cibleEtiquettes}
  {#await import('./EtiquettesPanneau.svelte') then m}
    <m.default cible={cibleEtiquettes} nom={title}
      onClose={() => (etiquettesOuvertes = false)} />
  {/await}
{/if}

<style>
  .v2-pldetail{position:absolute; inset:0; z-index:30; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow-y:auto; padding:26px 34px 40px}
  .close{position:sticky; top:0; margin-bottom:8px; width:40px; height:40px; border-radius:12px; cursor:pointer;
    border:1px solid var(--v2-line2); background:var(--v2-surface2); color:var(--v2-txt2); display:grid; place-items:center}
  .close:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .close svg{width:18px; height:18px}

  .head{display:flex; gap:30px; padding:6px 0 26px}
  .art{width:240px; height:240px; border-radius:8px; overflow:hidden; flex:0 0 auto; box-shadow:var(--v2-sh-lg);
    display:grid; place-items:center; color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .art.stream{background:none; color:inherit; box-shadow:var(--v2-sh-lg)}
  .art > svg{width:96px; height:96px}
  .meta{display:flex; flex-direction:column; gap:12px; padding-top:8px; min-width:0}
  .kind{font:700 11px var(--v2-mono); letter-spacing:.12em; text-transform:uppercase; color:var(--v2-acc-tint)}
  .meta h1{font-size:38px; font-weight:800; letter-spacing:-.01em; line-height:1.05}
  .rn{font-size:32px; font-weight:800; background:var(--v2-surface2); border:1px solid var(--v2-acc2); border-radius:8px;
    color:var(--v2-txt); padding:4px 10px; outline:none}
  .desc{font-size:14px; color:var(--v2-txt2); max-width:60ch}
  .facts{display:flex; gap:16px; font:12px var(--v2-mono); color:var(--v2-txt3)}
  .actions{display:flex; gap:12px; margin-top:8px; flex-wrap:wrap}
  .play,.ghost{display:inline-flex; align-items:center; gap:9px; height:44px; padding:0 20px; border-radius:var(--v2-r-pill);
    font:700 14px var(--v2-sans); cursor:pointer; border:0}
  .play{color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); box-shadow:0 6px 18px var(--v2-glow-strong)}
  .ghost{color:var(--v2-txt); background:transparent; border:1px solid var(--v2-line2)}
  .ghost:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  /* Le mode ÉDITION se voit : sinon on ne sait pas pourquoi des croix sont
     apparues au bout des lignes. */
  .ghost.on{color:var(--v2-acc-tint); border-color:var(--v2-acc2); background:var(--v2-acc-soft)}
  .coeur.on{color:var(--v2-danger); border-color:var(--v2-danger-bd)}
  .coeur.on:hover{color:var(--v2-danger); border-color:var(--v2-danger-bd)}
  .chez{align-self:center; font:11.5px var(--v2-mono); color:var(--v2-txt3); max-width:44ch; line-height:1.4}
  .ghost.sm{height:44px; padding:0 14px; font-size:13px}
  .ghost.danger:hover{border-color:var(--v2-danger-bd); color:var(--v2-danger)}
  .play svg,.ghost svg{width:16px; height:16px}

  .tracks{display:flex; flex-direction:column; gap:1px}
  .tri{display:flex; justify-content:flex-end; padding:0 0 10px}
  .tricol{display:inline-flex; align-items:center; gap:8px; font-size:12.5px; color:var(--v2-txt2)}
  .tricol select{height:32px; border-radius:9px; border:1px solid var(--v2-line2); background:var(--v2-surface2);
    color:var(--v2-txt); font:13px var(--v2-sans); padding:0 8px}
  .tricol .sens{width:32px; height:32px; border-radius:9px; border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt2); cursor:pointer; display:grid; place-items:center}
  .tricol .sens svg{width:15px; height:15px}
  .state{padding:24px 6px; color:var(--v2-txt3)} .state.err{color:var(--v2-danger)}
  /* La ligne est PARTAGEE : cette enveloppe ne fait que lui adjoindre le
     bouton « retirer », propre a la playlist. */
  .lp{display:grid; grid-template-columns:1fr auto; align-items:center; gap:6px}
  .trk:hover{background:var(--v2-surface2); color:var(--v2-txt)}
  .trk.np{color:var(--v2-acc1)}
  .trk .pl{display:grid; grid-template-columns:34px 1fr; align-items:center; gap:14px; border:0; background:transparent;
    color:inherit; cursor:pointer; text-align:left; padding:11px 0}
  .trk .n{font:12px var(--v2-mono); color:var(--v2-txt3); text-align:right}
  .trk.np .n{color:var(--v2-acc1)}
  .trk .ti{min-width:0; font-size:14px; font-weight:500; display:flex; flex-direction:column; gap:2px;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .trk .ti em{font:11px var(--v2-sans); font-style:normal; color:var(--v2-txt3); overflow:hidden; text-overflow:ellipsis}
  .trk .tk{font:10px var(--v2-mono); color:var(--v2-acc2)}
  .trk .dur{font:12px var(--v2-mono); color:var(--v2-txt3)}
  .rm{width:30px; height:30px; border-radius:8px; border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt3); cursor:pointer; display:grid; place-items:center}
  .rm:hover{border-color:var(--v2-danger-bd); color:var(--v2-danger)}
  .rm svg{width:15px; height:15px}
  .mv:disabled{opacity:.3; cursor:default}
</style>
