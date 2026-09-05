<script lang="ts">
  /**
   * Recherche du nouveau client (direction Levente). Cœur de nav : présente à
   * tous les niveaux. Densité par niveau :
   *   Essentiel  → bibliothèque locale : Albums + Titres.
   *   Avancé     → ajoute les Artistes et une section « Sur les services »
   *                (recherche fédérée streaming).
   *   Expert     → ajoute la recherche acoustique en langage naturel
   *                (« jazz analogique chaleureux ») quand le serveur l'embarque.
   *
   * L'ouverture d'un album réutilise l'overlay AlbumDetailV2 (la section est
   * `position:relative`). Un clic sur un artiste redéroule la recherche sur son
   * nom — tout reste dans cet écran, sans navigation cassée.
   */
  import * as api from '../../lib/api';
  import { get } from 'svelte/store';
  import { currentSearchCriteria, setSearchCriteria } from '../../lib/stores/shortcuts';
  import type { AcousticSearchResult } from '../../lib/api';
  import { currentZoneId } from '../../lib/stores/zones';
  import { currentTrackId } from '../../lib/stores/nowPlaying';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { formatDuration, getQualityTier } from '../../lib/utils';
  import type { Album, Track, SearchResult, FederatedSearchResult } from '../../lib/types';
  import AlbumArt from '../AlbumArt.svelte';
  import PochetteActions from './PochetteActions.svelte';
  import LignePisteV2 from './LignePisteV2.svelte';
  import AlbumDetailV2 from './AlbumDetailV2.svelte';
  import AlbumEditModal from '../AlbumEditModal.svelte';
  import RenommerModale from './RenommerModale.svelte';
  import { t } from '../../lib/i18n';
  import type { Artist, Playlist, StreamingPlaylist } from '../../lib/types';
  import { streamingServices } from '../../lib/stores/streaming';
  import {
    fusionnerParType,
    meilleurResultat,
    chargerRecherchesRecentes,
    retenirRecherche,
    oublierRecherche,
    viderRecherchesRecentes,
    type RechercheRecente,
  } from '../../lib/rechercheClassement';
  import '../../styles/tune-v2.css';

  const showExpert = $derived(atLeast($preferences.settingsLevel, 'expert'));

  let q = $state('');

  /**
   * Publier ce qu'on cherche, et repartir de ce qu'un raccourci a figé.
   *
   * Un raccourci sur une recherche doit RETENIR ses critères (Bertrand,
   * 02/09/2026) : sans cela il ramenait sur un écran vide et il fallait
   * retaper.
   */
  $effect(() => {
    const fige = get(currentSearchCriteria);
    if (fige?.q && !q) q = fige.q;
  });
  $effect(() => {
    setSearchCriteria(q.trim() ? { q } : null);
  });
  let local = $state<SearchResult | null>(null);
  let fed = $state<Record<string, SearchResult>>({});
  let acoustic = $state<AcousticSearchResult | null>(null);
  let acousticOn = $state(false);
  let acousticAvailable = $state(false);
  let busy = $state(false);
  let opened = $state<Album | null>(null);
  /**
   * Édition depuis les résultats. Le crayon existait dans Bibliothèque et pas
   * ici : le même disque changeait de gestes selon l'écran par lequel on
   * l'atteignait.
   *
   * Seuls les résultats LOCAUX s'éditent. Les résultats fédérés (Qobuz, Tidal)
   * n'ont pas d'identifiant de bibliothèque, et leur vignette ne porte déjà ni
   * cœur local ni étiquettes.
   */
  let albumEnEdition = $state<Album | null>(null);
  let artisteEnEdition = $state<Artist | null>(null);
  let seq = 0;

  // Disponibilité de la brique acoustique (Expert seulement, une fois).
  $effect(() => {
    if (!showExpert) return;
    api.getAcousticStatus()
      .then((s) => { acousticAvailable = !!(s.available && s.enabled); })
      .catch(() => { acousticAvailable = false; });
  });

  /**
   * Recherche débouncée sur la frappe.
   *
   * 🔴 Les SERVICES ne sont plus derrière un niveau d'interface (Bertrand,
   * 05/09/2026 : « Recherche ne travaille que sur la bibliothèque et pas sur
   * les streamings »). La recherche fédérée était réservée à Intermédiaire :
   * au niveau Essentiel, l'écran cherchait en silence dans la seule
   * bibliothèque locale, sans jamais dire qu'il laissait Qobuz et Tidal de
   * côté. Or il n'y a rien à protéger ici : un service non connecté ne rend
   * simplement rien, et qui a branché son abonnement veut ses résultats.
   */
  $effect(() => {
    const query = q.trim();
    if (query.length < 2) { local = null; fed = {}; acoustic = null; busy = false; return; }
    const mine = ++seq;
    busy = true;
    const t = setTimeout(() => {
      api.searchLibrary(query, 40)
        .then((r) => { if (mine === seq) local = r; })
        .catch(() => { if (mine === seq) local = null; })
        .finally(() => { if (mine === seq) busy = false; });
      api.federatedSearch(query)
        .then((r: FederatedSearchResult) => { if (mine === seq) fed = r.services ?? {}; })
        .catch(() => { if (mine === seq) fed = {}; });
      chercherPlaylists(query, mine);
      recentes = retenirRecherche(query);
    }, 240);
    return () => clearTimeout(t);
  });

  /* ---------------------------------------------------------------- */
  /* Playlists — absentes du nouvel écran, présentes dans l'actuel     */
  /* ---------------------------------------------------------------- */

  /** Une playlist trouvée, locale ou d'un service. */
  interface PlaylistTrouvee {
    nom: string;
    pistes: number;
    source: string;
    idLocal?: number;
    idService?: string;
    serviceSource?: string;
  }
  let playlists = $state<PlaylistTrouvee[]>([]);

  /**
   * Le serveur ne cherche pas dans les playlists : ni `/library/search` ni la
   * recherche fédérée ne les couvrent. On les liste et on filtre ici — c'est
   * ce que fait déjà l'écran du client actuel.
   */
  async function chercherPlaylists(query: string, mine: number) {
    const bas = query.toLowerCase();
    const trouvees: PlaylistTrouvee[] = [];
    const locales: Playlist[] = await api.getPlaylists().catch(() => [] as Playlist[]);
    for (const pl of locales) {
      if (pl.name?.toLowerCase().includes(bas)) {
        trouvees.push({ nom: pl.name, pistes: pl.track_count ?? 0, source: 'Local', idLocal: pl.id ?? undefined });
      }
    }
    // `get` et non `$store` : l'abonnement automatique n'existe qu'au premier
    // niveau du composant, et cette fonction n'y est pas.
    const services = get(streamingServices);
    await Promise.all(
      Object.entries(services)
        .filter(([, st]: [string, any]) => st?.authenticated)
        .map(([svc]) =>
          api.getStreamingPlaylists(svc)
            .then((pls: StreamingPlaylist[]) => {
              for (const pl of pls) {
                if (pl.name?.toLowerCase().includes(bas)) {
                  trouvees.push({
                    nom: pl.name, pistes: pl.track_count, source: svc.charAt(0).toUpperCase() + svc.slice(1),
                    idService: pl.source_id, serviceSource: pl.source,
                  });
                }
              }
            })
            .catch(() => {}),
        ),
    );
    if (mine === seq) playlists = trouvees;
  }

  /* ---------------------------------------------------------------- */
  /* Découverte — ce que montre l'écran AVANT la première frappe       */
  /* ---------------------------------------------------------------- */

  let recentes = $state<RechercheRecente[]>([]);
  let tetesAffiche = $state<any[]>([]);
  let ajoutsRecents = $state<Album[]>([]);

  $effect(() => {
    recentes = chargerRecherchesRecentes();
    // Les portraits d'artistes ne viennent pas de l'historique d'écoute : on
    // les récupère dans la bibliothèque, par NOM, sinon la rangée n'affiche
    // que des initiales.
    Promise.all([
      api.getTopArtists(12).catch(() => [] as any[]),
      api.getRecentAlbums(18).catch(() => [] as Album[]),
      api.getArtists(5000, 0).catch(() => [] as Artist[]),
    ]).then(([tetes, recents, tous]) => {
      const parNom = new Map<string, Artist>();
      for (const a of tous) if (a.name) parNom.set(a.name.toLowerCase(), a);
      tetesAffiche = (tetes ?? []).map((a: any) => {
        const nom = (a.artist_name || a.name || '');
        const fiche = parNom.get(nom.toLowerCase());
        return { nom, image_path: fiche?.image_path ?? null, id: fiche?.id ?? null, plays: a.plays ?? a.play_count ?? null };
      }).filter((a: any) => a.nom);
      ajoutsRecents = recents ?? [];
    });
  });

  function runAcoustic() {
    const query = q.trim();
    if (!query) return;
    const mine = ++seq;
    busy = true;
    api.searchAcoustic(query, 40)
      .then((r) => { if (mine === seq) acoustic = r; })
      .catch(() => { if (mine === seq) acoustic = null; })
      .finally(() => { if (mine === seq) busy = false; });
  }

  function lireAlbum(id: number) {
    const zid = $currentZoneId;
    if (zid == null) return;
    api.play(zid, { album_id: id }).catch(() => {});
  }

  /**
   * 🔴 `source` va TOUJOURS avec `streaming_album_id` : le serveur n'apparie que
   * la paire, et un identifiant seul le fait retomber sur « reprendre la
   * lecture en cours ».
   */
  function lireDistant(a: any) {
    const zid = $currentZoneId;
    if (zid == null || !a?.source || !a?.source_id) return;
    api.play(zid, { streaming_album_id: String(a.source_id), source: a.source }).catch(() => {});
  }

  function playTrack(t: Track) {
    const zid = $currentZoneId;
    if (zid == null || t.id == null) return;
    api.play(zid, { track_id: t.id }).catch(() => {});
  }
  function trackRate(t: Track): string {
    if (getQualityTier(t) === 'dsd') return 'DSD';
    return t.sample_rate ? `${Math.round(t.sample_rate / 100) / 10} kHz` : '';
  }

  /**
   * 🔴 Regroupé par TYPE, plus par source.
   *
   * L'écran rangeait les résultats locaux en trois sections et rejetait tout
   * le streaming dans un bloc « Sur les services », lui-même redécoupé par
   * service. C'est le découpage par source qu'on avait explicitement écarté :
   * chercher « Kind of Blue », c'est chercher un disque, pas un marchand.
   *
   * La provenance n'est pas perdue pour autant — chaque ligne garde sa
   * `source`, et la vignette porte son badge.
   */
  const groupes = $derived(fusionnerParType(local, fed));
  const meilleur = $derived(meilleurResultat(q, groupes));

  // Filtres par type. Rien n'est masqué par défaut : ils servent à ÉCARTER
  // quand une requête ramène trop, pas à révéler.
  let voirArtistes = $state(true);
  let voirAlbums = $state(true);
  let voirTitres = $state(true);
  let voirPlaylists = $state(true);

  const artistes = $derived(voirArtistes ? groupes.artistes : []);
  const albums = $derived(voirAlbums ? groupes.albums : []);
  const titres = $derived(voirTitres ? groupes.pistes : []);
  const lesPlaylists = $derived(voirPlaylists ? playlists : []);

  /** Une ligne locale porte un identifiant de bibliothèque ; une ligne de
   *  service n'en a pas — c'est ce qui décide du cœur, du crayon et du geste
   *  de lecture. */
  const estLocal = (x: any) => (x?.source ?? 'local') === 'local' && x?.id != null;

  const nothing = $derived(
    q.trim().length >= 2 && !busy && !groupes.albums.length && !groupes.pistes.length &&
    !groupes.artistes.length && !playlists.length && !(acoustic?.tracks.length)
  );

  function lirePlaylist(pl: PlaylistTrouvee) {
    const zid = $currentZoneId;
    if (zid == null) return;
    if (pl.idLocal != null) { api.play(zid, { playlist_id: pl.idLocal }).catch(() => {}); return; }
    if (pl.idService && pl.serviceSource) {
      api.play(zid, { streaming_playlist_id: pl.idService, source: pl.serviceSource as any }).catch(() => {});
    }
  }

  /** Lit une ligne d'album, locale ou de service — le geste diffère, pas l'intention. */
  function ouvrirOuLire(a: any) {
    if (estLocal(a)) lireAlbum(a.id);
    else lireDistant(a);
  }

  function lirePiste(t: any) {
    const zid = $currentZoneId;
    if (zid == null) return;
    if (estLocal(t)) { api.play(zid, { track_id: t.id }).catch(() => {}); return; }
    if (t?.source && t?.source_id) {
      api.play(zid, { source: t.source, source_id: String(t.source_id),
        title: t.title ?? null, artist_name: t.artist_name ?? null,
        album_title: t.album_title ?? null, cover_path: t.cover_path ?? null,
        duration_ms: t.duration_ms }).catch(() => {});
    }
  }
</script>

<section class="v2-search tune-v2">
  <header class="top">
    <div class="field">
      <svg class="mag" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="search"
        placeholder={$t('v2.sc.searchPlaceholder' as any)}
        bind:value={q}
        autofocus
        onkeydown={(e) => { if (e.key === 'Enter' && acousticOn) runAcoustic(); }}
      />
      {#if busy}<span class="spin" aria-hidden="true"></span>{/if}
    </div>

    {#if showExpert && acousticAvailable}
      <button class="acoustic" class:on={acousticOn} onclick={() => { acousticOn = !acousticOn; if (acousticOn) runAcoustic(); else acoustic = null; }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18M6 8v8M18 8v8M3 11v2M21 11v2"/></svg>
        Acoustique
      </button>
    {/if}
  </header>

  {#if q.trim().length >= 2}
    <div class="pills">
      <span class="pl">{$t('v2.rech.show' as any)}</span>
      <button class="pill" class:on={voirArtistes} onclick={() => (voirArtistes = !voirArtistes)}
        >{$t('v2.rech.artists' as any)} <b>{groupes.artistes.length}</b></button>
      <button class="pill" class:on={voirAlbums} onclick={() => (voirAlbums = !voirAlbums)}
        >{$t('v2.rech.albums' as any)} <b>{groupes.albums.length}</b></button>
      <button class="pill" class:on={voirTitres} onclick={() => (voirTitres = !voirTitres)}
        >{$t('v2.rech.tracks' as any)} <b>{groupes.pistes.length}</b></button>
      <button class="pill" class:on={voirPlaylists} onclick={() => (voirPlaylists = !voirPlaylists)}
        >{$t('v2.rech.playlists' as any)} <b>{playlists.length}</b></button>
    </div>
  {/if}

  <div class="scroll">
    {#if q.trim().length < 2}
      <!-- DÉCOUVERTE : un écran de recherche vide ne doit pas être une page
           blanche. Trois entrées — ce qu'on a déjà cherché, ce qu'on écoute le
           plus, ce qui vient d'arriver. Le client actuel les a, le nouveau
           n'avait qu'une loupe grise (Bertrand, 05/09/2026). -->
      {#if recentes.length}
        <section class="grp">
          <h2>{$t('v2.rech.recent' as any)}
            <button class="lnk" onclick={() => (recentes = viderRecherchesRecentes())}>{$t('v2.rech.clearRecent' as any)}</button>
          </h2>
          <div class="chips">
            {#each recentes as r (r.query)}
              <span class="chip">
                <button class="chq" onclick={() => (q = r.query)}>{r.query}</button>
                <button class="chx" onclick={() => (recentes = oublierRecherche(r.query))}
                  aria-label={$t('v2.rech.forget' as any)} title={$t('v2.rech.forget' as any)}>&times;</button>
              </span>
            {/each}
          </div>
        </section>
      {/if}

      {#if tetesAffiche.length}
        <section class="grp">
          <h2>{$t('search.topArtists')}</h2>
          <div class="arow">
            {#each tetesAffiche as a (a.nom)}
              <div class="artile">
                <span class="acv">
                  <AlbumArt coverPath={a.image_path} albumId={null} size={0} alt={a.nom} fallbackInitials={a.nom?.slice(0,1)} />
                </span>
                <button class="meta" onclick={() => (q = a.nom)}><span class="an" title={a.nom}>{a.nom}</span></button>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if ajoutsRecents.length}
        <section class="grp">
          <h2>{$t('v2.rech.recentAdds' as any)}</h2>
          <div class="grid">
            {#each ajoutsRecents as a (a.id)}
              <div class="card">
                <span class="cv">
                  <PochetteActions
                    favori={a.id != null ? { albumId: a.id } : null}
                    etiquettes={a.id != null ? { itemType: 'album', itemId: a.id } : null}
                    onEditer={a.id != null ? () => (albumEnEdition = a) : null}
                    onLire={a.id != null ? () => lireAlbum(a.id!) : null}
                    onOuvrir={() => (opened = a)}
                    nom={a.title}
                  >
                    <AlbumArt coverPath={a.cover_path} albumId={a.id} size={0} alt={a.title} source={a.source} fallbackInitials={a.title?.slice(0,1)} />
                  </PochetteActions>
                </span>
                <button class="meta" onclick={() => (opened = a)}>
                  <span class="ct" title={a.title}>{a.title}</span>
                  <span class="ca" title={a.artist_name ?? ''}>{a.artist_name ?? ''}</span>
                </button>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if !recentes.length && !tetesAffiche.length && !ajoutsRecents.length}
        <div class="hint">
          <div class="glyph">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          </div>
          <p>{$t('v2.rech.hint' as any)}</p>
          {#if showExpert && acousticAvailable}<p class="sub">{$t('v2.sc.acousticHintA' as any)} <b>{$t('v2.sc.acousticHintBold' as any)}</b> {$t('v2.sc.acousticHintB' as any)}</p>{/if}
        </div>
      {/if}
    {:else if nothing}
      <div class="hint"><p>{$t('v2.rech.none' as any).replace('{q}', q.trim())}</p></div>
    {:else}
      {#if showExpert && acoustic && acoustic.tracks.length}
        <section class="grp">
          <h2>Ambiance <span class="tag">acoustique</span></h2>
          <div class="list">
            {#each acoustic.tracks as t, i (t.id ?? i)}
              <!-- L'AMBIANCE garde son pourcentage de proximite : c'est la
                   seule colonne que la ligne partagee ne connait pas. -->
              <div class="lp">
                <LignePisteV2 piste={t as any} avecAlbum={false} onLire={() => playTrack(t)} />
                {#if t.similarity != null}<span class="sim">{Math.round(t.similarity * 100)}%</span>{/if}
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- BANDEAU DE TÊTE : le meilleur résultat à gauche, les artistes en
           rangée à droite. Un point focal, puis le balayage — c'est la mise en
           page validée pour la recherche, et elle manquait ici. -->
      {#if meilleur || artistes.length}
        <section class="grp tete">
          {#if meilleur}
            <div class="best">
              <h2>{$t('v2.rech.best' as any)}</h2>
              {#if meilleur.genre === 'artiste'}
                {@const a = meilleur.artiste}
                <button class="bcard" onclick={() => (q = a.name)}>
                  <span class="bcv rond"><AlbumArt coverPath={a.image_path ?? null} albumId={null} size={0} alt={a.name} fallbackInitials={a.name?.slice(0,1)} /></span>
                  <span class="bt">{a.name}</span>
                  <span class="bk">{$t('v2.rech.kindArtist' as any)}</span>
                </button>
              {:else if meilleur.genre === 'album'}
                {@const a = meilleur.album}
                <button class="bcard" onclick={() => (estLocal(a) ? (opened = a) : ouvrirOuLire(a))}>
                  <span class="bcv"><AlbumArt coverPath={a.cover_path} albumId={estLocal(a) ? a.id : null} size={0} alt={a.title} source={a.source as any} fallbackInitials={a.title?.slice(0,1)} /></span>
                  <span class="bt">{a.title}</span>
                  <span class="bk">{$t('v2.rech.kindAlbum' as any)} · {a.artist_name ?? ''}</span>
                </button>
              {:else}
                {@const pi = meilleur.piste}
                <button class="bcard" onclick={() => lirePiste(pi)}>
                  <span class="bcv"><AlbumArt coverPath={pi.cover_path} albumId={estLocal(pi) ? (pi.album_id ?? null) : null} size={0} alt={pi.title} source={pi.source as any} fallbackInitials={pi.title?.slice(0,1)} /></span>
                  <span class="bt">{pi.title}</span>
                  <span class="bk">{$t('v2.rech.kindTrack' as any)} · {pi.artist_name ?? ''}</span>
                </button>
              {/if}
            </div>
          {/if}

          {#if artistes.length}
            <div class="basartistes">
              <h2>{$t('v2.rech.artists' as any)}</h2>
              <div class="arow">
                {#each artistes.slice(0, 12) as ar, i (String(ar.id ?? '') + ':' + ar.name + ':' + i)}
                  <div class="artile">
                    <span class="acv">
                      <PochetteActions
                        favori={estLocal(ar) ? { artistId: ar.id! } : null}
                        etiquettes={estLocal(ar) ? { itemType: 'artist', itemId: ar.id! } : null}
                        onEditer={estLocal(ar) ? () => (artisteEnEdition = ar) : null}
                        onOuvrir={() => (q = ar.name)}
                        nom={ar.name}
                      >
                        <AlbumArt coverPath={ar.image_path ?? null} albumId={null} size={0} alt={ar.name} fallbackInitials={ar.name?.slice(0,1)} />
                      </PochetteActions>
                    </span>
                    <button class="meta" onclick={() => (q = ar.name)}><span class="an" title={ar.name}>{ar.name}</span></button>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </section>
      {/if}

      {#if albums.length}
        <section class="grp">
          <h2>{$t('v2.rech.albums' as any)}</h2>
          <div class="grid">
            {#each albums as a, i (String(a.source ?? 'local') + ':' + String(a.id ?? a.source_id ?? i))}
              {@const local_ = estLocal(a)}
              <div class="card" class:static={!local_}>
                <span class="cv">
                  <!-- Un album de SERVICE n'a ni coeur ni etiquettes : les deux
                       sont adosses a un identifiant de bibliotheque qu'il n'a
                       pas. Il se LIT, avec la paire service + identifiant. -->
                  <PochetteActions
                    favori={local_ ? { albumId: a.id! } : null}
                    etiquettes={local_ ? { itemType: 'album', itemId: a.id! } : null}
                    onEditer={local_ ? () => (albumEnEdition = a) : null}
                    onLire={local_ || (a.source && a.source_id) ? () => ouvrirOuLire(a) : null}
                    onOuvrir={local_ ? () => (opened = a) : null}
                    nom={a.title}
                  >
                    <AlbumArt coverPath={a.cover_path} albumId={local_ ? a.id : null} size={0} alt={a.title} source={a.source as any} fallbackInitials={a.title?.slice(0,1)} />
                  </PochetteActions>
                </span>
                {#if local_}
                  <button class="meta" onclick={() => (opened = a)}>
                    <span class="ct" title={a.title}>{a.title}</span>
                    <span class="ca" title={a.artist_name ?? ''}>{a.artist_name ?? ''}</span>
                  </button>
                {:else}
                  <span class="ct" title={a.title}>{a.title}</span>
                  <span class="ca" title={(a.artist_name ?? '') + (a.source ? ' · ' + a.source : '')}>{a.artist_name ?? ''}{a.source ? ' · ' + a.source : ''}</span>
                {/if}
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if titres.length}
        <section class="grp">
          <h2>{$t('v2.rech.tracks' as any)}</h2>
          <div class="list">
            {#each titres.slice(0, 40) as t, i (String(t.source ?? 'local') + ':' + String(t.id ?? t.source_id ?? i))}
              <LignePisteV2 piste={t as any} onLire={() => lirePiste(t)} />
            {/each}
          </div>
        </section>
      {/if}

      {#if lesPlaylists.length}
        <section class="grp">
          <h2>{$t('v2.rech.playlists' as any)}</h2>
          <div class="list">
            {#each lesPlaylists as pl, i (pl.source + ':' + (pl.idLocal ?? pl.idService ?? i))}
              <button class="trk pl-row" onclick={() => lirePlaylist(pl)}>
                <span class="plg" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 7h11M4 12h11M4 17h7M18 15V8l3 .6"/></svg>
                </span>
                <span class="ti">{pl.nom}<em>{pl.source}</em></span>
                <span class="dur">{String(pl.pistes)}</span>
              </button>
            {/each}
          </div>
        </section>
      {/if}
    {/if}
  </div>

  {#if opened}
    <AlbumDetailV2 album={opened} onClose={() => (opened = null)} />
  {/if}

  {#if albumEnEdition}
    <AlbumEditModal
      album={albumEnEdition}
      onClose={() => (albumEnEdition = null)}
      onSaved={(maj) => {
        // La grille lit `local.albums` : sans ce report, le titre corrigé ne
        // reviendrait qu'en relançant la recherche.
        if (local) local = { ...local, albums: local.albums.map((x) => (x.id === maj.id ? { ...x, ...maj } : x)) };
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
        // `PUT /library/artists/{id}` prend `bio`, pas `description`.
        await api.updateArtist(cible.id!, { name: v.name, bio: v.description });
        if (local) local = { ...local, artists: local.artists.map((x) => (x.id === cible.id ? { ...x, name: v.name, bio: v.description } : x)) };
      }}
      onClose={() => (artisteEnEdition = null)}
    />
  {/if}
</section>

<style>
  .v2-search{position:relative; display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}

  .top{display:flex; align-items:center; gap:14px; padding:24px 30px 12px; padding-right:96px}
  .field{position:relative; flex:1; max-width:640px; display:flex; align-items:center}
  .field .mag{position:absolute; left:16px; width:19px; height:19px; color:var(--v2-txt3); pointer-events:none}
  .field input{width:100%; height:50px; border-radius:var(--v2-r-pill); border:1px solid var(--v2-line2);
    background:var(--v2-surface2); color:var(--v2-txt); font:15px var(--v2-sans); padding:0 18px 0 46px; outline:none}
  .field input::placeholder{color:var(--v2-txt3)}
  .field input:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .field input::-webkit-search-cancel-button{-webkit-appearance:none}
  .spin{position:absolute; right:16px; width:15px; height:15px; border:2px solid var(--v2-line2);
    border-top-color:var(--v2-acc1); border-radius:50%; animation:sp .7s linear infinite}
  @keyframes sp{to{transform:rotate(360deg)}}

  .acoustic{display:inline-flex; align-items:center; gap:8px; height:44px; padding:0 16px; border-radius:var(--v2-r-pill);
    border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); font:600 13px var(--v2-sans); cursor:pointer}
  .acoustic svg{width:16px; height:16px}
  .acoustic:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .acoustic.on{color:var(--v2-on-acc); border-color:transparent; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}

  .scroll{flex:1; overflow-y:auto; padding:8px 0 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}

  .hint{display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; text-align:center;
    padding:70px 30px; color:var(--v2-txt2)}
  .hint .glyph{width:64px; height:64px; border-radius:20px; display:grid; place-items:center; color:var(--v2-txt3);
    border:1px solid var(--v2-line); background:var(--v2-surface2)}
  .hint .glyph svg{width:28px; height:28px}
  .hint p{max-width:440px; font-size:15px; line-height:1.5}
  .hint .sub{font-size:13px; color:var(--v2-txt3)}
  .hint b{color:var(--v2-acc-tint); font-weight:700}

  .grp{padding:14px 30px 8px}
  .grp h2{font-size:18px; font-weight:700; padding-bottom:12px; display:flex; align-items:center; gap:10px}
  .grp h2 .tag{font:600 10px var(--v2-mono); letter-spacing:.12em; text-transform:uppercase; color:var(--v2-acc-tint);
    border:1px solid var(--v2-acc2); border-radius:999px; padding:3px 9px}

  .arow{display:flex; gap:22px; overflow-x:auto; padding-bottom:8px; scrollbar-width:none}
  .arow::-webkit-scrollbar{display:none}
  .artile{flex:0 0 auto; width:112px; border:0; background:transparent; color:inherit; cursor:pointer; text-align:center; padding:0}
  /* Carrée comme un album — voir `ArtistesV2`. */
  .acv{display:block; width:112px; height:112px; border-radius:var(--v2-r-card); overflow:hidden; box-shadow:var(--v2-sh-card)}
  .artile .an{display:block; margin-top:9px; font:600 13px var(--v2-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .artile:hover .an{color:var(--v2-acc-tint)}

  .grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:20px}
  .card{border:0; background:transparent; color:inherit; cursor:pointer; text-align:left; padding:0; display:flex; flex-direction:column}
  /* Le TEXTE garde son bouton : la carte n'en est plus un depuis que la
     surcouche en pose cinq sur la pochette (un bouton dans un bouton est du
     balisage invalide). Il herite du style de la carte pour que rien ne
     bouge a l'ecran. */
  .card .meta, .artile .meta{border:0; background:transparent; color:inherit; cursor:pointer;
    padding:0; display:flex; flex-direction:column; text-align:inherit; width:100%; min-width:0}
  .card.static{cursor:default}
  .cv{display:block; aspect-ratio:1; border-radius:var(--v2-r-card); overflow:hidden; box-shadow:var(--v2-sh-card); transition:.18s}
  .card:not(.static):hover .cv{box-shadow:0 10px 24px var(--v2-glow)}
  .ct{margin-top:9px; font:600 13px var(--v2-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .ca{margin-top:2px; font:11px var(--v2-sans); color:var(--v2-txt2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}

  /* Pastilles de filtre par type — elles ECARTENT, elles ne revelent pas :
     tout est allume au depart. */
  .pills{display:flex; align-items:center; gap:9px; flex-wrap:wrap; padding:2px 30px 10px}
  .pl{font:600 10px var(--v2-mono); letter-spacing:.14em; text-transform:uppercase; color:var(--v2-txt3)}
  .pill{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt3); cursor:pointer;
    border-radius:var(--v2-r-pill); padding:6px 13px; font:600 12px var(--v2-sans)}
  .pill b{font:700 10px var(--v2-mono); margin-left:5px; opacity:.75}
  .pill:hover{color:var(--v2-txt)}
  .pill.on{color:var(--v2-acc-tint); border-color:var(--v2-acc2); background:var(--v2-acc-soft)}

  /* Recherches recentes */
  .grp h2 .lnk{margin-left:auto; border:0; background:transparent; color:var(--v2-txt3); cursor:pointer;
    font:600 11px var(--v2-sans)}
  .grp h2 .lnk:hover{color:var(--v2-danger)}
  .chips{display:flex; flex-wrap:wrap; gap:9px}
  .chip{display:inline-flex; align-items:center; border:1px solid var(--v2-line2); border-radius:var(--v2-r-pill);
    background:var(--v2-surface2); overflow:hidden}
  .chq{border:0; background:transparent; color:var(--v2-txt2); cursor:pointer; font:13px var(--v2-sans); padding:7px 4px 7px 14px}
  .chip:hover .chq{color:var(--v2-txt)}
  .chx{border:0; background:transparent; color:var(--v2-txt3); cursor:pointer; font-size:15px; line-height:1; padding:7px 12px 8px 6px}
  .chx:hover{color:var(--v2-danger)}

  /* Bandeau de tete : point focal a gauche, balayage a droite. */
  .tete{display:grid; grid-template-columns:minmax(240px,1fr) 2fr; gap:26px; align-items:start}
  @media (max-width:900px){ .tete{grid-template-columns:1fr} }
  .basartistes{min-width:0}
  .best h2, .basartistes h2{font-size:18px; font-weight:700; padding-bottom:12px}
  .bcard{display:flex; flex-direction:column; gap:4px; width:100%; text-align:left; cursor:pointer;
    border:1px solid var(--v2-line); border-radius:var(--v2-r-card); background:var(--v2-surface2); padding:18px; color:inherit}
  .bcard:hover{border-color:var(--v2-acc2); background:var(--v2-acc-soft)}
  .bcv{display:block; width:132px; height:132px; border-radius:10px; overflow:hidden; box-shadow:var(--v2-sh-card); margin-bottom:12px}
  .bcv.rond{border-radius:50%}
  .bt{font-size:21px; font-weight:800; letter-spacing:-.01em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .bk{font:600 11px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}

  .pl-row{grid-template-columns:44px 1fr auto; padding:8px 10px; border:0; background:transparent;
    cursor:pointer; text-align:left; font-family:inherit; color:inherit}
  .plg{width:44px; height:44px; border-radius:6px; display:grid; place-items:center;
    border:1px solid var(--v2-line2); background:var(--v2-surface2); color:var(--v2-txt3)}
  .plg svg{width:19px; height:19px}

  .list{display:flex; flex-direction:column; gap:1px}
  /* Enveloppe : la ligne partagee, plus le pourcentage de proximite propre a
     l'ambiance acoustique. */
  .lp{display:grid; grid-template-columns:1fr auto; align-items:center; gap:10px}
  .lp .sim{font:11px var(--v2-mono); color:var(--v2-acc-tint); padding-right:10px}
  /* Le clic de LECTURE : c'est lui qui porte la grille du titre, la ligne
     n'etant plus qu'un conteneur depuis qu'elle accueille la barre d'actions. */
  .tclick{display:grid; grid-template-columns:44px 1fr; align-items:center; gap:14px; min-width:0;
    padding:8px 0; border:0; background:transparent; color:inherit; cursor:pointer; text-align:left; font-family:inherit}
  .trk:hover{background:var(--v2-surface2); color:var(--v2-txt)}
  .trk.np{color:var(--v2-acc1)}
  .cvsm{width:44px; height:44px; border-radius:6px; overflow:hidden}
  .trk .ti{min-width:0; font-size:14px; font-weight:500; display:flex; flex-direction:column; gap:2px;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .trk .ti em{font:11px var(--v2-sans); font-style:normal; color:var(--v2-txt3); overflow:hidden; text-overflow:ellipsis}
  .trk .tk{font:10px var(--v2-mono); color:var(--v2-acc2)}
  .trk .sim{font:11px var(--v2-mono); color:var(--v2-acc-tint)}
  .trk .dur{font:12px var(--v2-mono); color:var(--v2-txt3)}
</style>
