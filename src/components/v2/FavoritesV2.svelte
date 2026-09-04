<script lang="ts">
  /**
   * Favoris — nouveau client (direction Levente).
   *
   * Niveau Avancé. Les favoris sont attachés à un PROFIL : sans profil actif
   * il n'y a rien à afficher, et l'écran le dit au lieu de faire croire à une
   * liste vide. Le profil est chargé par l'amorçage v2 (voir lib/v2Bootstrap) —
   * `loadProfiles()` ne vit que dans App.svelte, que `?v2` ne monte jamais.
   *
   * Densité :
   *   Avancé → Albums, Titres, Artistes ; lecture, mise en file, retrait.
   *   Expert → ligne technique sur les titres.
   */
  import * as api from '../../lib/api';
  import { currentZoneId } from '../../lib/stores/zones';
  import { currentTrackId } from '../../lib/stores/nowPlaying';
  import { currentProfileId, loadFavoriteIds, favoriteStreamingKeys } from '../../lib/stores/profile';
  import { favoriExterneService } from '../../lib/streamingFavorites';
  import {
    trierEtFiltrer, sourcesPresentes, SOURCE_BIBLIOTHEQUE, type TriFavoris,
  } from '../../lib/favorisTriFiltre';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { fold, formatDuration, getQualityTier } from '../../lib/utils';
  import type { Album, Track, Artist } from '../../lib/types';
  import AlbumArt from '../AlbumArt.svelte';
  import PochetteActions from './PochetteActions.svelte';
  import AlbumDetailV2 from './AlbumDetailV2.svelte';
  import AlbumEditModal from '../AlbumEditModal.svelte';
  import RenommerModale from './RenommerModale.svelte';
  import { dialogs } from '../../lib/stores/dialogs';
  import { t } from '../../lib/i18n';
  import '../../styles/tune-v2.css';

  const level = $derived($preferences.settingsLevel);
  const showExpert = $derived(atLeast(level, 'expert'));

  /**
   * RADIO rejoint les Favoris — demandé par Bertrand le 02/09/2026.
   *
   * Ce sont les titres CAPTÉS pendant l'écoute d'une radio : on aime un
   * morceau qui passe, il se range là. C'est une sélection de l'utilisateur au
   * même titre que les albums et les artistes, et son écran séparé du client
   * actuel n'était atteignable que par une entrée de barre latérale qui
   * n'existe pas en v2 — donc invisible.
   */
  type Tab = 'albums' | 'tracks' | 'artists' | 'radio';
  let tab = $state<Tab>('albums');
  let q = $state('');

  let albums = $state<Album[]>([]);
  let tracks = $state<Track[]>([]);
  let artists = $state<Artist[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let opened = $state<Album | null>(null);
  /**
   * Édition depuis les favoris. Le commentaire de la vignette annonçait déjà
   * l'édition parmi les cinq gestes, mais `onEditer` n'était pas passé : le
   * crayon manquait, ici comme sur l'accueil et la recherche.
   *
   * Seuls les objets de la BIBLIOTHÈQUE s'éditent — `id != null`. Les favoris
   * de service arrivent d'une autre table et n'ont pas d'identifiant numérique
   * à donner à `PUT /library/albums/{id}`.
   */
  /**
   * Calcule EN DEHORS de la boucle : `{#each vTracks as t}` masque le store
   * `t`, et `$t(…)` dans le corps de la boucle ne s'abonne plus a rien.
   * Svelte le refuse — « Cannot subscribe to stores that are not declared at
   * the top level of the component ».
   */
  const labelRetirerFavori = $derived($t('v2.fav.remove' as any));
  let albumEnEdition = $state<Album | null>(null);
  let artisteEnEdition = $state<Artist | null>(null);

  /**
   * Un favori de SERVICE, dans la forme que rendent déjà les trois onglets.
   *
   * Bertrand, 03/09/2026 : « Sidebar Favoris et ceux des services de
   * streaming ?? ». L'écran n'appelait que `getFavorites`, c'est-à-dire les
   * favoris de la BIBLIOTHÈQUE. Les cœurs posés sur une pochette Qobuz ou
   * Tidal partent, eux, dans `streaming_favorites` — une autre table, un autre
   * appel. Ils s'enregistraient donc bien et ne réapparaissaient nulle part :
   * mesure sur le .18 le 03/09/2026, deux favoris de service rangés (un Qobuz,
   * un Tidal) et zéro affiché ici.
   *
   * Pas de deuxième grille ni de quatrième onglet : un album aimé est un album
   * aimé. On le convertit dans la forme locale, `id` à `null` et `source` /
   * `source_id` renseignés — c'est ce couple que la lecture et la fiche
   * savent déjà suivre, et la pastille du service se dessine toute seule.
   */
  // `created_at` est REPORTE : c'est la seule date que porte un favori de
   // service, et le tri par date n'aurait sinon rien a lire de ce cote.
  const versAlbum = (f: api.StreamingFavorite) => ({
    id: null, title: f.title ?? '', artist_name: f.artist ?? '',
    cover_path: f.cover_url ?? null, source: f.service, source_id: f.service_id,
    created_at: f.created_at ?? null,
  }) as unknown as Album;
  const versPiste = (f: api.StreamingFavorite) => ({
    id: null, title: f.title ?? '', artist_name: f.artist ?? '', album_title: f.album ?? '',
    cover_path: f.cover_url ?? null, source: f.service, source_id: f.service_id, duration_ms: 0,
    created_at: f.created_at ?? null,
  }) as unknown as Track;
  const versArtiste = (f: api.StreamingFavorite) => ({
    id: null, name: f.title ?? f.artist ?? '', image_path: f.cover_url ?? null,
    source: f.service, source_id: f.service_id, created_at: f.created_at ?? null,
  }) as unknown as Artist;

  /** Clé de liste : `id` est NUL sur tout objet de service, et deux `null` se
   *  disputeraient la même clé — Svelte s'arrête sur `each_key_duplicate` et
   *  l'écran entier disparaît. */
  const clef = (o: any, i: number) =>
    o?.id ?? (o?.source && o?.source_id ? `${o.source}:${o.source_id}` : `#${i}`);

  /** Le cœur d'un objet de service, ou `null` s'il est de la bibliothèque. */
  const coeurService = (o: any, itemType: 'track' | 'album' | 'artist') =>
    o?.id != null
      ? null
      : favoriExterneService($favoriteStreamingKeys, {
          itemType,
          service: o?.source ?? '',
          serviceId: String(o?.source_id ?? ''),
          title: o?.title ?? o?.name ?? undefined,
          artist: o?.artist_name ?? undefined,
          coverUrl: o?.cover_path ?? o?.image_path ?? undefined,
        });

  async function reload() {
    const pid = $currentProfileId;
    if (pid == null) { loading = false; return; }
    loading = true;
    try {
      // Les deux sources en PARALLÈLE, et celle des services au mieux : un
      // serveur plus ancien ne sert pas la route, et cela ne doit pas vider
      // les favoris de la bibliothèque.
      const [f, s] = await Promise.all([
        api.getFavorites(pid),
        api.getProfileStreamingFavorites(pid).catch(() => [] as api.StreamingFavorite[]),
      ]);
      albums = [...(f.albums ?? []), ...s.filter((x) => x.item_type === 'album').map(versAlbum)];
      tracks = [...(f.tracks ?? []), ...s.filter((x) => x.item_type === 'track').map(versPiste)];
      artists = [...(f.artists ?? []), ...s.filter((x) => x.item_type === 'artist').map(versArtiste)];
      error = null;
    } catch {
      error = 'Favoris indisponibles.';
    }
    loading = false;
  }
  // Rechargé si le profil change : les favoris sont personnels.
  $effect(() => { void $currentProfileId; reload(); });

  function match(s: string | null | undefined): boolean {
    return !q || fold(s).includes(fold(q));
  }
  /**
   * Filtre par SOURCE et tri — demandes par Bertrand le 04/09/2026.
   *
   * Le filtre porte sur l'onglet COURANT : les sources presentes ne sont pas
   * les memes d'un onglet a l'autre (on peut n'avoir aucun artiste Bandcamp
   * et beaucoup d'albums). Proposer une puce qui ne rendrait rien laisserait
   * croire que les favoris ont disparu.
   *
   * Une source qui disparait de l'onglet courant retombe sur « toutes »,
   * sinon la grille resterait vide sans qu'aucune puce ne paraisse active.
   */
  let sourceFiltre = $state<string | null>(null);
  let tri = $state<TriFavoris>('recent');

  const fAlbums = $derived(albums.filter((a) => match(a.title) || match(a.artist_name)));
  const fTracks = $derived(tracks.filter((t) => match(t.title) || match(t.artist_name)));
  const fArtists = $derived(artists.filter((a) => match(a.name)));

  const sourcesOnglet = $derived(
    sourcesPresentes(
      tab === 'albums' ? fAlbums : tab === 'tracks' ? fTracks : tab === 'artists' ? fArtists : [],
    ),
  );
  $effect(() => {
    if (sourceFiltre && !sourcesOnglet.includes(sourceFiltre)) sourceFiltre = null;
  });

  const vAlbums = $derived(trierEtFiltrer(fAlbums, sourceFiltre, tri));
  const vTracks = $derived(trierEtFiltrer(fTracks, sourceFiltre, tri));
  const vArtists = $derived(trierEtFiltrer(fArtists, sourceFiltre, tri));

  /** Nom lisible d'une source : la bibliotheque se traduit, un service porte son nom. */
  function nomSource(s: string): string {
    return s === SOURCE_BIBLIOTHEQUE ? $t('v2.fav.sourceLibrary' as any) : s;
  }

  // ── Favoris RADIO : les titres captés à l'antenne ────────────────────────
  let radio = $state<any[]>([]);
  let radioCharge = false;
  let radioLoading = $state(false);
  let creationPlaylist = $state(false);
  let nomPlaylist = $state('');
  let creation = $state(false);

  const vRadio = $derived(radio.filter((f) => match(f.title) || match(f.artist)));

  $effect(() => {
    if (tab !== 'radio' || radioCharge) return;
    radioCharge = true;
    radioLoading = true;
    api
      .apiFetch('/radio-favorites?limit=500')
      .then((r: any) => {
        radio = r?.items ?? r ?? [];
      })
      .catch(() => {
        error = 'Favoris radio indisponibles.';
        radio = [];
      })
      .finally(() => {
        radioLoading = false;
      });
  });

  async function retirerRadio(fav: any) {
    try {
      await api.apiDelete(`/radio-favorites/${fav.id}`);
      radio = radio.filter((x) => x.id !== fav.id);
    } catch {
      error = 'Suppression impossible.';
    }
  }

  async function viderRadio() {
    // ⚠️ Irréversible, et sur une liste qu'on a mise des mois à constituer :
    // on DEMANDE. Pas de `window.confirm` — les dialogues natifs sont bannis
    // dans les vues embarquées.
    if (!(await dialogs.confirm($t('v2.fav.radioClearAsk' as any), { danger: true }))) return;
    try {
      await api.apiDelete('/radio-favorites');
      radio = [];
    } catch {
      error = 'Suppression impossible.';
    }
  }

  async function creerPlaylistRadio() {
    const n = nomPlaylist.trim();
    if (!n || creation) return;
    creation = true;
    try {
      // `local` : la playlist se crée sur le serveur, pas chez un service.
      // Les titres captés sont rapprochés de la bibliothèque, et ceux qui n'y
      // sont pas ne peuvent pas entrer — c'est le serveur qui en décide.
      await api.createPlaylistFromRadioFavorites('local', n, radio.length);
      nomPlaylist = '';
      creationPlaylist = false;
    } catch (e: any) {
      error = e?.message ?? 'Création impossible.';
    }
    creation = false;
  }

  const TABS: { id: Tab; label: string; n: number }[] = $derived([
    { id: 'albums', label: 'Albums', n: vAlbums.length },
    { id: 'tracks', label: 'Titres', n: vTracks.length },
    { id: 'artists', label: 'Artistes', n: vArtists.length },
    { id: 'radio', label: 'Radio', n: vRadio.length },
  ]);



  /**
   * Lecture d'un album, de la bibliothèque OU d'un service.
   *
   * 🔴 `source` va TOUJOURS avec `streaming_album_id` : le serveur n'apparie
   * les deux qu'ensemble, et un identifiant seul le fait retomber sur
   * « reprendre la lecture en cours ».
   */
  function playAlbum(a: any) {
    const zid = $currentZoneId;
    if (zid == null) return;
    const corps = a?.id != null
      ? { album_id: a.id }
      : a?.source && a?.source_id
      ? { streaming_album_id: String(a.source_id), source: a.source as any }
      : null;
    if (!corps) return;
    api.play(zid, corps).catch(() => { error = 'Lecture impossible.'; });
  }
  function playTrack(t: any) {
    const zid = $currentZoneId;
    if (zid == null) return;
    const corps = t?.id != null
      ? { track_id: t.id }
      : t?.source && t?.source_id
      ? { source: t.source as any, source_id: String(t.source_id) }
      : null;
    if (!corps) return;
    api.play(zid, corps).catch(() => { error = 'Lecture impossible.'; });
  }
  // `e` optionnel : appelee depuis la carte historique (qui propage) ET depuis
  // le menu de `PochetteActions`, qui a deja arrete le geste.
  function queueAlbum(id: number | null | undefined, e?: MouseEvent) {
    e?.stopPropagation();
    const zid = $currentZoneId;
    if (zid == null || id == null) return;
    api.addToQueue(zid, { album_id: id }).catch(() => { error = 'Mise en file impossible.'; });
  }

  /** Retrait d'un favori. On recharge aussi les ENSEMBLES d'identifiants du
   *  store : sans ça, les boutons cœur des autres écrans continueraient
   *  d'afficher l'élément comme favori jusqu'au prochain rechargement. */
  /**
   * Retrait d'un titre, quelle que soit la table qui le porte.
   *
   * Une piste de service n'a pas d'`id` local : `removeFavorite({track_id:
   * undefined})` ne retirerait rien et n'en dirait rien. Le cœur passe donc
   * par l'unique `toggleStreamingFavorite`, celui-là même qui l'avait posé.
   */
  async function retirerPiste(t: any, e: MouseEvent) {
    if (t?.id != null) { await unfav({ track_id: t.id }, e); return; }
    e.stopPropagation();
    const c = coeurService(t, 'track');
    if (!c || busy) return;
    busy = true;
    try { await c.basculer(); await reload(); } catch { error = 'Retrait impossible.'; }
    busy = false;
  }

  async function unfav(body: { track_id?: number; album_id?: number; artist_id?: number }, e: MouseEvent) {
    e.stopPropagation();
    const pid = $currentProfileId;
    if (pid == null || busy) return;
    busy = true;
    try {
      await api.removeFavorite(pid, body);
      await reload();
      await loadFavoriteIds(pid);
    } catch { error = 'Retrait impossible.'; }
    busy = false;
  }

  function tech(t: Track): string {
    if (getQualityTier(t) === 'dsd') return 'DSD';
    const r = t.sample_rate ? `${Math.round(t.sample_rate / 100) / 10} kHz` : '';
    return [t.format?.toUpperCase(), r].filter(Boolean).join(' · ');
  }
</script>

<section class="v2-fav tune-v2">
  <header class="top">
    <div>
      <div class="eyebrow">{$t('v2.fav.eyebrow' as any)}</div>
      <h1>Favoris</h1>
    </div>
    <nav class="tabs">
      {#each TABS as t (t.id)}
        <button class:on={tab === t.id} onclick={() => (tab = t.id)}>{t.label}<span>{t.n}</span></button>
      {/each}
    </nav>
    <div class="search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <input placeholder={$t('v2.tool.filter' as any)} bind:value={q} />
    </div>
  </header>

  <!--
    Filtres et tri. Absents de l'onglet Radio : ses titres captes ne viennent
    pas de deux tables, et n'ont pas de source a departager.

    Les puces de source n'apparaissent qu'a partir de DEUX sources : avec une
    seule, le filtre ne peut rien retirer — c'est un bouton qui ne fait rien.
  -->
  {#if tab !== 'radio'}
    <div class="barre">
      {#if sourcesOnglet.length > 1}
        <div class="puces">
          <button class:on={sourceFiltre === null} onclick={() => (sourceFiltre = null)}>{$t('v2.fav.allSources' as any)}</button>
          {#each sourcesOnglet as s (s)}
            <button class:on={sourceFiltre === s} onclick={() => (sourceFiltre = s)}>{nomSource(s)}</button>
          {/each}
        </div>
      {/if}
      <label class="tris">
        <span>{$t('v2.fav.sortBy' as any)}</span>
        <select class="sel" bind:value={tri}>
          <option value="recent">{$t('v2.fav.sortRecent' as any)}</option>
          <option value="ancien">{$t('v2.fav.sortOldest' as any)}</option>
          <option value="alpha">{$t('v2.fav.sortAlpha' as any)}</option>
          <option value="alphaInverse">{$t('v2.fav.sortAlphaDesc' as any)}</option>
        </select>
      </label>
    </div>
  {/if}

  {#if error}<div class="err">{error}<button onclick={() => (error = null)} aria-label="Fermer">×</button></div>{/if}

  <div class="scroll">
    {#if $currentProfileId == null}
      <div class="state">{$t('v2.fav.noProfile' as any)}</div>
    {:else if loading}
      <div class="state">{$t('v2.fav.loading' as any)}</div>
    {:else if tab === 'albums'}
      {#if !vAlbums.length}
        <div class="state">{albums.length ? 'Aucun album ne correspond.' : 'Aucun album en favori.'}</div>
      {:else}
        <div class="grid">
          {#each vAlbums as a, i (clef(a, i))}
            <!--
              La MEME surcouche que partout ailleurs (Bertrand, 03/09/2026).

              Cette carte avait la sienne : un bouton d'ouverture plein cadre,
              puis lire / mettre en file / retirer des favoris dans un coin.
              Trois gestes sur cinq, dessines autrement, avec un coeur qui ne
              RETIRAIT que — il ne disait meme pas l'etat, puisqu'on est deja
              dans les favoris.

              `PochetteActions` porte le coeur (qui bascule dans les deux
              sens), les etiquettes, l'edition, le menu et la lecture. « Ajouter
              a la file » passe dans le MENU : c'est une action secondaire, et
              elle n'a pas d'icone dediee dans la maquette.
            -->
            <div class="card">
              <span class="cv">
                <PochetteActions
                  favori={a.id != null ? { albumId: a.id } : null}
                  favoriExterne={coeurService(a, 'album')}
                  etiquettes={a.id != null ? { itemType: 'album', itemId: a.id } : null}
                  onEditer={a.id != null ? () => (albumEnEdition = a) : null}
                  onLire={() => playAlbum(a)}
                  onOuvrir={() => (opened = a)}
                  menu={a.id != null ? [{ libelle: $t('queue.addToQueue' as any), faire: () => queueAlbum(a.id) }] : []}
                  nom={a.title}
                >
                  <AlbumArt coverPath={a.cover_path} albumId={a.id} size={0} alt={a.title} source={a.source} fallbackInitials={a.title?.slice(0,1)} />
                </PochetteActions>
              </span>
              <span class="ct">{a.title}</span>
              <span class="ca">{a.artist_name ?? ''}</span>
            </div>
          {/each}
        </div>
      {/if}

    {:else if tab === 'tracks'}
      {#if !vTracks.length}
        <div class="state">{tracks.length ? 'Aucun titre ne correspond.' : 'Aucun titre en favori.'}</div>
      {:else}
        <div class="list">
          {#each vTracks as t, i (clef(t, i))}
            <div class="row" class:np={t.id != null && t.id === $currentTrackId}>
              <button class="play" onclick={() => playTrack(t)}>
                <span class="cv sm"><AlbumArt coverPath={t.cover_path} albumId={t.album_id ?? null} size={0} alt={t.title} source={t.source} fallbackInitials={t.title?.slice(0,1)} /></span>
                <span class="ti">{t.title}<em>{t.artist_name ?? ''}{t.album_title ? ' · ' + t.album_title : ''}</em></span>
              </button>
              {#if showExpert && tech(t)}<span class="tk">{tech(t)}</span>{/if}
              <span class="dur">{formatDuration(t.duration_ms ?? 0)}</span>
              <!--
                Le retrait passe par la table qui PORTE le favori : une piste
                de la bibliothèque par `removeFavorite`, une piste de service
                par le chemin unique de `toggleStreamingFavorite`. Le premier
                sur la seconde ne retirerait rien, en silence.
              -->
              <button class="hot flat" onclick={(e) => retirerPiste(t, e)} disabled={busy} aria-label={labelRetirerFavori}>
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20s-6.5-4-9-8C1 9 3 5.5 6.2 5.5c1.8 0 3 1 3.8 2 .8-1 2-2 3.8-2C17 5.5 19 9 17 12c-2.5 4-9 8-9 8z"/></svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}

    {:else if tab === 'artists'}
      {#if !vArtists.length}
        <div class="state">{artists.length ? 'Aucun artiste ne correspond.' : 'Aucun artiste en favori.'}</div>
      {:else}
        <div class="arow">
          {#each vArtists as a, i (clef(a, i))}
            <div class="art">
              <span class="acv">
                <PochetteActions
                  favori={a.id != null ? { artistId: a.id } : null}
                  favoriExterne={coeurService(a, 'artist')}
                  etiquettes={a.id != null ? { itemType: 'artist', itemId: a.id } : null}
                  onEditer={a.id != null ? () => (artisteEnEdition = a) : null}
                  nom={a.name}
                >
                  <AlbumArt coverPath={a.image_path ?? null} albumId={null} size={0} alt={a.name}
                    source={(a as any).source} fallbackInitials={a.name?.slice(0,1)} />
                </PochetteActions>
              </span>
              <span class="an">{a.name}</span>
            </div>
          {/each}
        </div>
      {/if}

    {:else}
      <!-- FAVORIS RADIO : les titres captés à l'antenne. Les quatre gestes de
           l'écran actuel — créer une playlist, exporter en CSV, tout effacer,
           retirer un titre. -->
      {#if radioLoading}
        <div class="state">{$t('v2.fav.radioLoading' as any)}</div>
      {:else if !radio.length}
        <div class="state">
          {$t('v2.fav.radioEmpty' as any)}
        </div>
      {:else}
        <div class="rf-actions">
          <span class="rf-cpt">{radio.length} titre{radio.length > 1 ? 's' : ''}</span>
          <button class="rf-btn accent" onclick={() => (creationPlaylist = true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            {$t('v2.fav.radioMakePlaylist' as any)}
          </button>
          <!-- Un lien, pas un bouton : c'est le navigateur qui télécharge, et
               le serveur rend déjà le CSV tout fait. -->
          <a class="rf-btn" href="/api/v1/radio-favorites/export" download="radio_favorites.csv">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {$t('v2.fav.radioExport' as any)}
          </a>
          <button class="rf-btn danger" onclick={viderRadio}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            {$t('v2.fav.radioClear' as any)}
          </button>
        </div>

        {#if !vRadio.length}
          <div class="state">{$t('v2.fav.radioNoMatch' as any)}</div>
        {:else}
          <div class="rows">
            {#each vRadio as f (f.id)}
              <div class="lrow">
                <span class="lcv"><AlbumArt coverPath={f.cover_url ?? null} albumId={null} size={0} alt={f.title} fallbackInitials={f.title?.slice(0,1)} /></span>
                <span class="lt">{f.title}</span>
                <span class="la">{f.artist ?? ''}</span>
                <span class="lst">{f.station ?? ''}</span>
                <button class="hot round" onclick={() => retirerRadio(f)} aria-label="Retirer">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20s-6.5-4-9-8C1 9 3 5.5 6.2 5.5c1.8 0 3 1 3.8 2 .8-1 2-2 3.8-2C17 5.5 19 9 17 12c-2.5 4-9 8-9 8z"/></svg>
                </button>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    {/if}
  </div>

  {#if creationPlaylist}
    <div class="rf-fond" role="presentation" onclick={() => (creationPlaylist = false)}>
      <form class="rf-modale" onclick={(e) => e.stopPropagation()}
        onsubmit={(e) => { e.preventDefault(); void creerPlaylistRadio(); }}>
        <h2>{$t('v2.fav.radioMakePlaylist' as any)}</h2>
        <p class="rf-sub">{$t('v2.fav.radioPlaylistHint' as any)}</p>
        <!-- svelte-ignore a11y_autofocus -->
        <input bind:value={nomPlaylist} placeholder={$t('v2.fav.radioPlaylistName' as any)} autofocus
          onkeydown={(e) => { if (e.key === 'Escape') creationPlaylist = false; }} />
        <div class="rf-pied">
          <button type="button" class="rf-btn" onclick={() => (creationPlaylist = false)}>{$t('common.cancel' as any)}</button>
          <button type="submit" class="rf-btn accent" disabled={creation || !nomPlaylist.trim()}>
            {creation ? $t('common.loading' as any) : $t('v2.fav.radioCreate' as any)}
          </button>
        </div>
      </form>
    </div>
  {/if}

  {#if opened}
    <!-- La fiche distingue local et service par CE drapeau : sans lui, elle
         chercherait les pistes d'un album distant par un `id` qui n'existe pas. -->
    <AlbumDetailV2 album={opened} service={opened.id == null ? ((opened as any).source ?? null) : null}
      onClose={() => (opened = null)} />
  {/if}

  {#if albumEnEdition}
    <AlbumEditModal
      album={albumEnEdition}
      onClose={() => (albumEnEdition = null)}
      onSaved={(maj) => {
        // La grille tire ses albums de cet état local, pas du magasin de la
        // bibliothèque : c'est LUI qu'il faut reporter, sinon le titre corrigé
        // ne réapparaîtrait qu'au prochain passage sur l'écran.
        albums = albums.map((x) => (x.id === maj.id ? { ...x, ...maj } : x));
        albumEnEdition = null;
      }}
    />
  {/if}

  {#if artisteEnEdition}
    {@const cible = artisteEnEdition}
    <RenommerModale
      titre={$t('v2.edit.artist' as any)}
      nom={cible.name}
      description={cible.bio ?? ''}
      enregistrer={async (v) => {
        // `PUT /library/artists/{id}` prend `bio`, pas `description` : la
        // modale est générique, la traduction se fait ici — comme dans
        // ArtistesV2, d'où ce bloc est repris à l'identique.
        await api.updateArtist(cible.id!, { name: v.name, bio: v.description });
        artists = artists.map((x) =>
          x.id === cible.id ? { ...x, name: v.name, bio: v.description } : x,
        );
      }}
      onClose={() => (artisteEnEdition = null)}
    />
  {/if}
</section>

<style>
  .barre{display:flex; align-items:center; justify-content:space-between; gap:18px;
    flex-wrap:wrap; padding:0 30px 12px}
  .puces{display:flex; gap:7px; flex-wrap:wrap}
  .puces button{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2);
    cursor:pointer; border-radius:999px; padding:5px 13px; font:600 11.5px var(--v2-sans);
    text-transform:capitalize}
  .puces button:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .puces button.on{border-color:var(--v2-acc1); color:var(--v2-acc1)}
  .tris{display:flex; align-items:center; gap:9px; margin-left:auto}
  .tris > span{font:600 10.5px var(--v2-mono); letter-spacing:.05em; color:var(--v2-txt3);
    text-transform:uppercase}
  .barre .sel{height:32px; border-radius:9px; border:1px solid var(--v2-line2);
    background:var(--v2-surface2); color:var(--v2-txt); font:12.5px var(--v2-sans);
    padding:0 10px; outline:none; cursor:pointer}
  .barre .sel:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .rf-actions{display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:0 0 14px}
  .rf-cpt{font:11px var(--v2-mono); color:var(--v2-txt3); margin-right:4px}
  .rf-btn{display:inline-flex; align-items:center; gap:7px; text-decoration:none; cursor:pointer;
    border:1px solid var(--v2-line2); border-radius:var(--v2-r-pill); background:transparent;
    color:var(--v2-txt2); font:600 12.5px var(--v2-sans); padding:7px 13px}
  .rf-btn:hover{color:var(--v2-txt); background:var(--v2-hover)}
  .rf-btn svg{width:14px; height:14px}
  .rf-btn.accent{border-color:transparent; background:var(--v2-acc1); color:var(--v2-on-acc)}
  .rf-btn.danger{color:var(--v2-danger); border-color:var(--v2-danger)}
  .rf-btn:disabled{opacity:.5; cursor:default}
  .lst{font:10.5px var(--v2-mono); color:var(--v2-txt3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .rf-fond{position:fixed; inset:0; z-index:900; background:rgba(0,0,0,.55); display:grid; place-items:center; padding:20px}
  .rf-modale{display:flex; flex-direction:column; gap:10px; width:min(400px,100%); padding:20px;
    background:var(--v2-surface); border:1px solid var(--v2-line2); border-radius:var(--v2-r-card)}
  .rf-modale h2{font-size:16px; font-weight:700}
  .rf-sub{color:var(--v2-txt2); font-size:12.5px}
  .rf-modale input{background:var(--v2-bg); border:1px solid var(--v2-line2); border-radius:8px;
    color:var(--v2-txt); font:inherit; font-size:13.5px; padding:9px 11px}
  .rf-pied{display:flex; justify-content:flex-end; gap:8px}
  .v2-fav{position:relative; display:flex; flex-direction:column; height:100%; background:var(--v2-bg);
    color:var(--v2-txt); font-family:var(--v2-sans); overflow:hidden}
  .top{display:flex; align-items:flex-end; gap:22px; padding:24px 30px 14px; padding-right:96px}
  .eyebrow{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em; margin-top:4px}
  .tabs{display:flex; gap:4px}
  .tabs button{display:inline-flex; align-items:center; gap:7px; border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt2); cursor:pointer; font:600 12px var(--v2-sans); padding:8px 14px; border-radius:var(--v2-r-pill); transition:.15s}
  .tabs button span{font:9.5px var(--v2-mono); color:var(--v2-txt3)}
  .tabs button:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .tabs button.on{color:var(--v2-on-acc); border-color:transparent; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .tabs button.on span{color:var(--v2-on-acc); opacity:.75}
  .search{position:relative; margin-left:auto; display:flex; align-items:center; width:240px; flex:0 0 auto}
  .search svg{position:absolute; left:14px; width:16px; height:16px; color:var(--v2-txt3); pointer-events:none}
  .search input{width:100%; height:40px; border-radius:var(--v2-r-pill); border:1px solid var(--v2-line2);
    background:var(--v2-surface2); color:var(--v2-txt); font:13px var(--v2-sans); padding:0 14px 0 38px; outline:none}
  .search input:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}

  .err{display:flex; align-items:center; gap:12px; margin:0 30px 10px; padding:9px 14px; border-radius:10px;
    font-size:12.5px; border:1px solid var(--v2-danger-bd); background:var(--v2-acc-soft)}
  .err button{margin-left:auto; border:0; background:transparent; color:inherit; font-size:16px; cursor:pointer}

  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:30px 0; color:var(--v2-txt3)}

  .grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:22px}
  .card{position:relative; display:flex; flex-direction:column}
  .open:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:2px}
  .cv{display:block; aspect-ratio:1; border-radius:var(--v2-r-card); overflow:hidden; box-shadow:var(--v2-sh-card); transition:.18s}
  .card:hover .cv{box-shadow:0 10px 24px var(--v2-glow)}
  .ct{margin-top:9px; font:600 13px var(--v2-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .ca{margin-top:2px; font:11px var(--v2-sans); color:var(--v2-txt2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .hot{color:var(--v2-acc1)}
  .hot:hover{background:var(--v2-danger-bd); color:#fff}
  .hot:disabled{opacity:.5; cursor:default}

  .list{display:flex; flex-direction:column; gap:1px}
  .row{display:grid; grid-template-columns:1fr auto auto auto; align-items:center; gap:14px; padding:0 8px;
    border-radius:9px; color:var(--v2-txt2)}
  .row:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .row.np{color:var(--v2-acc1)}
  .play{display:grid; grid-template-columns:40px 1fr; align-items:center; gap:13px; min-width:0; border:0;
    background:transparent; color:inherit; cursor:pointer; text-align:left; padding:7px 0; font-family:inherit}
  .cv.sm{width:40px; height:40px; aspect-ratio:auto; border-radius:6px; box-shadow:none}
  .ti{min-width:0; font-size:13.5px; font-weight:500; display:flex; flex-direction:column; gap:2px;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .ti em{font:11px var(--v2-sans); font-style:normal; color:var(--v2-txt3); overflow:hidden; text-overflow:ellipsis}
  .row .tk{font:10px var(--v2-mono); color:var(--v2-acc2)}
  .row .dur{font:11.5px var(--v2-mono); color:var(--v2-txt3)}
  .hot.flat{width:28px; height:28px; border:0; border-radius:8px; background:transparent; cursor:pointer;
    display:grid; place-items:center}
  .hot.flat svg{width:14px; height:14px}

  .arow{display:grid; grid-template-columns:repeat(auto-fill,minmax(128px,1fr)); gap:24px}
  .art{position:relative; display:flex; flex-direction:column; align-items:center; text-align:center}
  /* Carrée comme un album — voir `ArtistesV2`. */
  .acv{display:block; width:112px; height:112px; border-radius:var(--v2-r-card); overflow:hidden; box-shadow:var(--v2-sh-card)}
  .an{margin-top:10px; font:600 13px var(--v2-sans); max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .hot.round{position:absolute; top:2px; right:50%; transform:translateX(58px); width:28px; height:28px;
    border-radius:50%; border:0; background:rgba(0,0,0,.55); cursor:pointer; display:grid; place-items:center; opacity:0; transition:.16s}
  .art:hover .hot.round{opacity:1}
  .hot.round svg{width:14px; height:14px}

  /*
    Favoris RADIO — une liste de lignes.

    🔴 Ces règles manquaient entièrement : le balisage avait été écrit sans
    elles. `AlbumArt` en `size={0}` adopte la boîte de son parent — et un
    `<span>` sans largeur n'en impose aucune, alors la pochette prenait TOUTE
    la largeur du volet. Quatre favoris, une seule image plein cadre : c'est ce
    que Bertrand a capturé le 03/09/2026.

    La largeur de la pochette est donc posée ICI, comme pour `.acv`.
  */
  .rows{display:flex; flex-direction:column; gap:2px}
  .lrow{display:grid; grid-template-columns:44px minmax(0,2fr) minmax(0,1.4fr) minmax(0,1fr) 32px;
    align-items:center; gap:14px; padding:7px 10px; border-radius:var(--v2-r-card)}
  .lrow:hover{background:var(--v2-hover)}
  .lcv{display:block; width:44px; height:44px; border-radius:8px; overflow:hidden;
    background:var(--v2-surface); flex-shrink:0}
  .lcv :global(img){width:100%; height:100%; object-fit:cover; display:block}
  /* `min-width: 0` sur chaque cellule : sans lui, `minmax(0,…)` ne suffit pas
     à autoriser la coupure — le contenu impose sa largeur et la ligne déborde. */
  .lt{min-width:0; font:600 13px var(--v2-sans); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .la{min-width:0; font:12.5px var(--v2-sans); color:var(--v2-txt2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .lst{min-width:0; font:11px var(--v2-mono); color:var(--v2-txt3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  /* Le bouton de retrait de la LIGNE : `.hot.round` est positionné pour la
     vignette d'artiste (absolu, décalé de 58 px) et se serait posé de travers. */
  .lrow .hot.round{position:static; transform:none; opacity:0; width:28px; height:28px;
    background:transparent; color:var(--v2-acc1)}
  .lrow:hover .hot.round, .lrow .hot.round:focus-visible{opacity:1}
  .lrow .hot.round:hover{background:var(--v2-danger-bd); color:#fff}

  @media (max-width: 720px){
    /* La station passe à la ligne plutôt que d'écraser le titre. */
    .lrow{grid-template-columns:44px minmax(0,1fr) 32px}
    .la, .lst{display:none}
  }
</style>
