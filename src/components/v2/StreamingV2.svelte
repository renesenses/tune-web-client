<script lang="ts">
  /**
   * Streaming — nouveau client (direction Levente).
   *
   * Entrée du NOYAU (Bertrand, 28/08) : pour qui écoute surtout en ligne,
   * c'est la porte d'entrée principale.
   *
   * TROIS RÈGLES POSÉES PAR BERTRAND :
   *
   *  1. Seuls les services CONNECTÉS ont un onglet. Un service désactivé ou
   *     non authentifié n'a rien à montrer ; lui donner un onglet, c'était
   *     promettre du contenu et livrer un message d'erreur. La connexion se
   *     fait dans Réglages → Accès et jetons, et l'écran y renvoie quand il
   *     n'y a aucun service utilisable.
   *
   *  2. Deux vues par service : ÉDITORIAL (ce que le service met en avant) et
   *     MON <SERVICE> (mes playlists et mes favoris). C'est la distinction
   *     que font les applications natives, et elle correspond à deux gestes
   *     différents : découvrir, ou retrouver.
   *
   *  3. BANDCAMP est un service comme les autres ici. Il n'est PAS
   *     authentifié comme les autres (c'est une extension serveur) : on teste
   *     donc s'il répond réellement, et on ne l'affiche que dans ce cas.
   *     Son éditorial est la découverte par tag, son « chez moi » est la
   *     collection d'achats.
   */
  import * as api from '../../lib/api';
  import { currentZoneId } from '../../lib/stores/zones';
  import { activeView } from '../../lib/stores/navigation';
  import type { StreamingServiceStatus, StreamingPlaylist, SearchResult } from '../../lib/types';
  import AlbumArt from '../AlbumArt.svelte';
  import '../../styles/tune-v2.css';

  const BANDCAMP = '__bandcamp__';

  let services = $state<Record<string, StreamingServiceStatus>>({});
  let bandcampLive = $state(false);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let active = $state<string | null>(null);
  // « Mon <service> » chargeait playlists ET favoris d'un bloc — 286 cartes
  // sur Qobuz. Deux gestes differents, deux onglets (Bertrand, 28/08).
  // Bandcamp garde deux entrees seulement : il n'a pas de playlists, sa
  // « collection » EST l'ensemble de ce qu'on y possede.
  type Sub = 'editorial' | 'playlists' | 'favorites' | 'mine';
  let sub = $state<Sub>('editorial');

  let q = $state('');
  let results = $state<SearchResult | null>(null);
  let bcSearch = $state<any | null>(null);
  let searching = $state(false);
  let seq = 0;

  // Éditorial
  //
  // TIDAL RENDAIT UN ÉDITORIAL VIDE (Bertrand, 28/08). Mesure sur le serveur
  // local, Tidal authentifié (PREMIUM) :
  //   /streaming/tidal/featured                 -> []
  //   /streaming/tidal/featured/sections        -> []
  //   /streaming/tidal/featured-playlists/by-tag-> []
  //   /streaming/tidal/new-releases             -> 50 albums
  //   /streaming/tidal/genres                   -> Pop, Rock, Hip Hop…
  //   /streaming/tidal/genres/Pop/albums        -> albums
  // Côté serveur, `get_featured` interroge `/featured/playlists`, une route
  // héritée que Tidal ne sert plus ; `api_get` ne contrôle pas le code HTTP
  // (hors 401), si bien qu'un corps d'erreur devient un tableau vide silencieux.
  // C'est un défaut SERVEUR, et nous sommes en gel : il n'est pas corrigé ici.
  //
  // Mais l'éditorial n'a jamais eu de raison de se réduire aux playlists mises
  // en avant. Les nouveautés et les genres sont servis, richement, par les DEUX
  // services. On construit donc l'éditorial des trois sources, et chaque
  // section n'apparaît que si elle a de la matière — Qobuz garde ses playlists,
  // Tidal cesse d'être vide, et le jour où le serveur réparera `featured`,
  // la section reviendra d'elle-même.
  let featured = $state<any[]>([]);
  let newRel = $state<any[]>([]);
  let genres = $state<any[]>([]);
  let genreId = $state<string>('');
  let genreAlbums = $state<any[]>([]);
  let genreLoading = $state(false);
  // Genres Bandcamp : le serveur rend `genres` (libelle + sous-genres) ET
  // `tags` (liste plate) — on prend le premier, on retombe sur le second pour
  // les serveurs qui ne servent que lui.
  let bcGenres = $state<{ slug: string; label: string; sous: { slug: string; label: string }[] }[]>([]);
  let bcTag = $state<string>('');
  let bcSub = $state<string>('');
  let bcItems = $state<any[]>([]);
  // Collection : le serveur repond 428 tant qu'aucun compte n'est relie.
  // C'est un NOM D'UTILISATEUR public, pas un identifiant de connexion.
  let bcNeedsLink = $state(false);
  let bcUser = $state('');
  let bcLinking = $state(false);
  // Chez moi
  let myPlaylists = $state<StreamingPlaylist[]>([]);
  let favAlbums = $state<any[]>([]);
  let favArtists = $state<any[]>([]);
  let favTracks = $state<any[]>([]);
  let bcCollection = $state<any[]>([]);
  let paneLoading = $state(false);

  /** Un service n'entre dans les onglets que s'il est ACTIVÉ ET CONNECTÉ. */
  const connected = $derived(
    Object.entries(services).filter(([, v]) => v.enabled && v.authenticated).map(([k]) => k)
  );
  const tabs = $derived([...connected, ...(bandcampLive ? [BANDCAMP] : [])]);
  const isBc = $derived(active === BANDCAMP);
  const SUBS = $derived<{ id: Sub; label: string }[]>(
    isBc
      ? [{ id: 'editorial', label: 'Découvrir' }, { id: 'mine', label: 'Ma collection' }]
      : [{ id: 'editorial', label: 'Éditorial' },
         { id: 'playlists', label: 'Playlists' },
         { id: 'favorites', label: 'Favoris' }]
  );
  const label = (k: string) => (k === BANDCAMP ? 'Bandcamp' : k.charAt(0).toUpperCase() + k.slice(1));

  $effect(() => {
    Promise.allSettled([
      api.getStreamingServices(),
      // Sonde FONCTIONNELLE : l'extension peut être installée sans être
      // chargée (elle exige un redémarrage du serveur). Seule une réponse
      // réelle prouve qu'elle est utilisable.
      api.bandcampTags(),
    ]).then(([svc, bc]) => {
      if (svc.status === 'fulfilled') services = svc.value ?? {};
      else error = 'Services indisponibles.';
      if (bc.status === 'fulfilled') {
        bandcampLive = true;
        const v: any = bc.value ?? {};
        if (Array.isArray(v.genres) && v.genres.length) {
          bcGenres = v.genres.map((g: any) => ({
            slug: g.slug, label: g.label ?? g.slug,
            sous: Array.isArray(g.sous_genres) ? g.sous_genres : [],
          }));
        } else if (Array.isArray(v.tags)) {
          bcGenres = v.tags.map((t: string) => ({ slug: t, label: t, sous: [] }));
        }
        bcTag = bcGenres[0]?.slug ?? '';
      }
      const first = Object.entries(services).find(([, v]) => v.enabled && v.authenticated)?.[0];
      active = first ?? (bandcampLive ? BANDCAMP : null);
    }).finally(() => { loading = false; });
  });

  /** Charge la vue courante. Rien ne part pour un onglet qu'on ne regarde pas. */
  $effect(() => {
    const svc = active, view = sub, tag = bcTag, sg = bcSub;
    if (!svc) return;
    paneLoading = true;
    featured = []; newRel = []; genres = []; myPlaylists = []; favAlbums = []; favArtists = []; favTracks = []; bcItems = []; bcCollection = [];
    const done = () => { paneLoading = false; };

    if (svc === BANDCAMP) {
      if (view === 'editorial') {
        if (!tag) { done(); return; }
        api.bandcampDiscover(tag, 'top', 0, sg || undefined)
          .then((d: any) => { bcItems = d?.items ?? []; }).catch(() => { bcItems = []; }).finally(done);
      } else {
        bcNeedsLink = false;
        api.bandcampCollection()
          .then((d: any) => { bcCollection = d?.items ?? d?.collection ?? []; })
          .catch((e: any) => {
            // 428 : aucun compte relie. Ce n'est pas une panne, c'est une
            // etape a franchir — on le dit au lieu d'afficher « rien ».
            bcCollection = [];
            bcNeedsLink = e?.status === 428 || /lié|link/i.test(e?.message ?? '');
          })
          .finally(done);
      }
      return;
    }

    if (view === 'editorial') {
      // Les trois sources partent ensemble et echouent separement : une route
      // morte ne doit plus vider tout l'ecran, seulement sa propre section.
      genreId = ''; genreAlbums = [];
      Promise.allSettled([
        api.getStreamingFeaturedPlaylists(svc),
        api.getStreamingNewReleases(svc, 30),
        api.getStreamingGenres(svc),
      ]).then(([f, n, g]) => {
        featured = f.status === 'fulfilled' ? ((f.value as any) ?? []) : [];
        newRel = n.status === 'fulfilled' ? ((n.value as any) ?? []) : [];
        genres = g.status === 'fulfilled' ? ((g.value as any) ?? []) : [];
      }).finally(done);

    } else if (view === 'playlists') {
      api.getStreamingPlaylists(svc)
        .then((p) => { myPlaylists = p ?? []; }).catch(() => { myPlaylists = []; }).finally(done);

    } else {
      // Les trois natures de favoris partent ensemble : elles vivent sur le
      // meme ecran, et les separer encore ferait trois allers-retours pour
      // une seule question — « qu'est-ce que j'ai aime ? ».
      Promise.allSettled([
        api.getStreamingFavorites(svc, 'albums'),
        api.getStreamingFavorites(svc, 'artists'),
        api.getStreamingFavorites(svc, 'tracks'),
      ]).then(([a, ar, tr]) => {
        favAlbums = a.status === 'fulfilled' ? ((a.value as any)?.albums ?? []) : [];
        favArtists = ar.status === 'fulfilled' ? ((ar.value as any)?.artists ?? []) : [];
        favTracks = tr.status === 'fulfilled' ? ((tr.value as any)?.tracks ?? []) : [];
      }).finally(done);
    }
  });

  /** Albums d'un genre. Effet SEPARE du chargement du volet : le remettre
   *  dans l'autre ferait repartir les trois requetes editoriales a chaque
   *  changement de puce. */
  $effect(() => {
    const svc = active, gid = genreId;
    if (!svc || svc === BANDCAMP || sub !== 'editorial' || !gid) { genreAlbums = []; return; }
    genreLoading = true;
    api.getStreamingGenreAlbums(svc, gid, 40)
      .then((a: any) => { if (genreId === gid) genreAlbums = a ?? []; })
      .catch(() => { if (genreId === gid) genreAlbums = []; })
      .finally(() => { if (genreId === gid) genreLoading = false; });
  });

  // Recherche dans le service courant.
  $effect(() => {
    const svc = active, needle = q.trim();
    if (!svc || needle.length < 2) { results = null; bcSearch = null; searching = false; return; }
    const mine = ++seq;
    searching = true;
    const t = setTimeout(() => {
      if (svc === BANDCAMP) {
        api.bandcampSearch(needle).then((r) => { if (mine === seq) bcSearch = r; })
          .catch(() => { if (mine === seq) bcSearch = null; })
          .finally(() => { if (mine === seq) searching = false; });
      } else {
        api.searchStreaming(svc, needle).then((r) => { if (mine === seq) results = r; })
          .catch(() => { if (mine === seq) results = null; })
          .finally(() => { if (mine === seq) searching = false; });
      }
    }, 260);
    return () => clearTimeout(t);
  });

  function playAlbum(a: any) {
    const zid = $currentZoneId;
    if (zid == null || !active || active === BANDCAMP) return;
    const sid = a?.source_id ?? a?.id;
    if (sid) api.play(zid, { streaming_album_id: String(sid), source: active as any }).catch(() => { error = 'Lecture impossible.'; });
  }
  function playPlaylist(p: any) {
    const zid = $currentZoneId;
    if (zid == null) return;
    api.play(zid, { streaming_playlist_id: String(p.source_id ?? p.id), source: (p.source ?? active) as any })
      .catch(() => { error = 'Lecture impossible.'; });
  }
  /** Bandcamp ne sert qu'un extrait mp3-128 : on le lit tel quel. */
  function playBc(it: any) {
    const zid = $currentZoneId;
    if (zid == null) return;
    if (!it?.extrait) { error = 'Aucun extrait disponible pour ce titre.'; return; }
    api.play(zid, { file_path: it.extrait, title: it.titre, artist_name: it.artiste ?? null, cover_path: it.pochette ?? null })
      .catch(() => { error = 'Lecture impossible.'; });
  }

  async function linkBandcamp() {
    const u = bcUser.trim();
    if (!u || bcLinking) return;
    bcLinking = true;
    try {
      await api.bandcampLink(u);
      bcNeedsLink = false;
      const d: any = await api.bandcampCollection();
      bcCollection = d?.items ?? d?.collection ?? [];
    } catch { error = "Compte introuvable — vérifiez le nom d'utilisateur Bandcamp."; }
    bcLinking = false;
  }
  const currentSous = $derived(bcGenres.find((g) => g.slug === bcTag)?.sous ?? []);

  const pTitle = (p: any) => p?.name ?? p?.title ?? p?.titre ?? 'Sans titre';
  const pCover = (p: any) => p?.cover_path ?? p?.image ?? p?.picture ?? p?.pochette ?? null;
  const pSub = (p: any) => p?.artist_name ?? p?.artiste ?? (p?.track_count != null ? `${p.track_count} titres` : '');
</script>

<section class="v2-str tune-v2">
  <header class="top">
    <div>
      <div class="eyebrow">Services</div>
      <h1>Streaming</h1>
    </div>
    {#if active}
      <div class="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input placeholder={`Rechercher dans ${label(active)}`} bind:value={q} />
        {#if searching}<span class="spin" aria-hidden="true"></span>{/if}
      </div>
    {/if}
  </header>

  {#if error}<div class="err">{error}<button onclick={() => (error = null)} aria-label="Fermer">×</button></div>{/if}

  {#if tabs.length}
    <nav class="svcs">
      {#each tabs as name (name)}
        <button class:on={active === name} onclick={() => { active = name; sub = 'editorial'; q = ''; results = null; bcSearch = null; }}>
          {label(name)}
          {#if name !== BANDCAMP && services[name]?.username}<span class="who">{services[name].username}</span>{/if}
        </button>
      {/each}
    </nav>

    {#if active}
      <nav class="subs">
        {#each SUBS as sb (sb.id)}
          <button class:on={sub === sb.id} onclick={() => (sub = sb.id)}>{sb.label}</button>
        {/each}
      </nav>
    {/if}
  {/if}

  <div class="scroll">
    {#if loading}
      <div class="state">Chargement des services…</div>

    {:else if !tabs.length}
      <!-- Aucun service utilisable : on le dit et on emmene la ou ca se regle,
           plutot que d'afficher des onglets qui ne montreront rien. -->
      <div class="notice">
        <p>Aucun service de streaming connecté.</p>
        <p class="sub">
          La connexion se fait dans <b>Réglages → Accès et jetons</b>. Les services
          désactivés ou non connectés n'apparaissent pas ici.
        </p>
        <button class="lnk" onclick={() => activeView.set('settings')}>Ouvrir les réglages</button>
      </div>

    {:else if results || bcSearch}
      {#if bcSearch}
        {#if bcSearch.albums?.length}
          <section class="sec"><h2>Albums</h2>
            <div class="grid">{#each bcSearch.albums as a, i (a.url ?? i)}{@render tile(a, () => playBc(a))}{/each}</div>
          </section>
        {/if}
        {#if bcSearch.pistes?.length}
          <section class="sec"><h2>Titres</h2>
            <div class="grid">{#each bcSearch.pistes as a, i (a.url ?? i)}{@render tile(a, () => playBc(a))}{/each}</div>
          </section>
        {/if}
        {#if !bcSearch.albums?.length && !bcSearch.pistes?.length}
          <div class="state">Aucun résultat sur Bandcamp.</div>
        {/if}
      {:else if results}
        {#if results.albums?.length}
          <section class="sec"><h2>Albums</h2>
            <div class="grid">{#each results.albums as a (a.source_id ?? a.id)}{@render tile(a, () => playAlbum(a))}{/each}</div>
          </section>
        {/if}
        {#if results.artists?.length}
          <section class="sec"><h2>Artistes</h2>
            <div class="arow">
              {#each results.artists.slice(0, 14) as ar (ar.source_id ?? ar.name)}
                <div class="art">
                  <span class="acv"><AlbumArt coverPath={ar.image_path ?? null} albumId={null} size={0} alt={ar.name} fallbackInitials={ar.name?.slice(0,1)} /></span>
                  <span class="an">{ar.name}</span>
                </div>
              {/each}
            </div>
          </section>
        {/if}
        {#if !results.albums?.length && !results.artists?.length}
          <div class="state">Aucun résultat dans {label(active ?? '')}.</div>
        {/if}
      {/if}

    {:else if paneLoading}
      <div class="state">Chargement…</div>

    {:else if sub === 'editorial'}
      {#if isBc}
        {#if bcGenres.length}
          <div class="chips">
            {#each bcGenres as g (g.slug)}
              <button class="chip" class:active={bcTag === g.slug}
                onclick={() => { bcTag = g.slug; bcSub = ''; }}>{g.label}</button>
            {/each}
          </div>
          {#if currentSous.length}
            <div class="chips sous">
              <button class="chip" class:active={!bcSub} onclick={() => (bcSub = '')}>Tout</button>
              {#each currentSous as sg2 (sg2.slug)}
                <button class="chip" class:active={bcSub === sg2.slug} onclick={() => (bcSub = sg2.slug)}>{sg2.label}</button>
              {/each}
            </div>
          {/if}
        {/if}
        {#if bcItems.length}
          <div class="grid">{#each bcItems as it, i (it.url ?? i)}{@render tile(it, () => playBc(it))}{/each}</div>
        {:else}
          <div class="state">Rien à découvrir pour ce genre.</div>
        {/if}
      {:else if featured.length || newRel.length || genres.length}
        {#if featured.length}
          <section class="sec"><h2>Mis en avant par {label(active ?? '')}</h2>
            <div class="grid">{#each featured.slice(0, 40) as p, i ((p.source_id ?? p.id ?? i))}{@render tile(p, () => playPlaylist(p))}{/each}</div>
          </section>
        {/if}
        {#if newRel.length}
          <section class="sec"><h2>Nouveautés</h2>
            <div class="grid">{#each newRel.slice(0, 30) as a, i ((a.source_id ?? a.id ?? i))}{@render tile(a, () => playAlbum(a))}{/each}</div>
          </section>
        {/if}
        {#if genres.length}
          <section class="sec"><h2>Explorer par genre</h2>
            <div class="chips">
              {#each genres as g (g.id)}
                <button class="chip" class:active={genreId === g.id}
                  onclick={() => (genreId = genreId === g.id ? '' : g.id)}>{g.name}</button>
              {/each}
            </div>
            {#if genreId}
              {#if genreLoading}
                <div class="state">Chargement…</div>
              {:else if genreAlbums.length}
                <div class="grid">{#each genreAlbums as a, i ((a.source_id ?? a.id ?? i))}{@render tile(a, () => playAlbum(a))}{/each}</div>
              {:else}
                <div class="state">Aucun album dans ce genre.</div>
              {/if}
            {/if}
          </section>
        {/if}
      {:else}
        <div class="state">{label(active ?? '')} ne propose aucune sélection éditoriale pour l'instant. Utilisez la recherche.</div>
      {/if}

    {:else if sub === 'mine'}
      <!-- Bandcamp : la collection EST ce qu'on y possede. -->
      {#if bcNeedsLink}
        <div class="notice">
          <p>Aucun compte Bandcamp relié.</p>
          <p class="sub">
            Indiquez votre <b>nom d'utilisateur Bandcamp</b> — celui de l'adresse
            <code>bandcamp.com/<b>votrenom</b></code>. C'est un identifiant public :
            aucun mot de passe n'est demandé.
          </p>
          <div class="inline">
            <input class="txt" type="text" placeholder="votrenom" bind:value={bcUser} disabled={bcLinking}
              onkeydown={(e) => { if (e.key === 'Enter') linkBandcamp(); }} />
            <button class="lnk" disabled={bcLinking || !bcUser.trim()} onclick={linkBandcamp}>
              {bcLinking ? 'Liaison…' : 'Relier'}
            </button>
          </div>
        </div>
      {:else if bcCollection.length}
        <div class="grid">{#each bcCollection as it, i (it.url ?? i)}{@render tile(it, () => playBc(it))}{/each}</div>
      {:else}
        <div class="state">Votre collection Bandcamp est vide.</div>
      {/if}

    {:else if sub === 'playlists'}
      {#if myPlaylists.length}
        <div class="grid">{#each myPlaylists as p (p.source_id)}{@render tile(p, () => playPlaylist(p))}{/each}</div>
      {:else}
        <div class="state">Aucune playlist dans votre compte {label(active ?? '')}.</div>
      {/if}

    {:else}
      {#if favAlbums.length}
        <section class="sec"><h2>Albums</h2>
          <div class="grid">{#each favAlbums as a, i ((a.source_id ?? a.id ?? i))}{@render tile(a, () => playAlbum(a))}{/each}</div>
        </section>
      {/if}
      {#if favArtists.length}
        <section class="sec"><h2>Artistes</h2>
          <div class="arow">
            {#each favArtists as ar, i ((ar.source_id ?? ar.name ?? i))}
              <div class="art">
                <span class="acv"><AlbumArt coverPath={ar.image_path ?? ar.picture ?? null} albumId={null} size={0} alt={ar.name} fallbackInitials={ar.name?.slice(0,1)} /></span>
                <span class="an">{ar.name}</span>
              </div>
            {/each}
          </div>
        </section>
      {/if}
      {#if favTracks.length}
        <section class="sec"><h2>Titres</h2>
          <div class="grid">{#each favTracks as tr, i ((tr.source_id ?? tr.id ?? i))}{@render tile(tr, () => playAlbum(tr))}{/each}</div>
        </section>
      {/if}
      {#if !favAlbums.length && !favArtists.length && !favTracks.length}
        <div class="state">Aucun favori dans votre compte {label(active ?? '')}.</div>
      {/if}
    {/if}
  </div>
</section>

{#snippet tile(p: any, onPlay: () => void)}
  <div class="card">
    <button class="open" onclick={onPlay} aria-label={`Lire ${pTitle(p)}`}></button>
    <span class="cv"><AlbumArt coverPath={pCover(p)} albumId={null} size={0} alt={pTitle(p)} source={p?.source} fallbackInitials={pTitle(p).slice(0,1)} /></span>
    <span class="ct">{pTitle(p)}</span>
    {#if pSub(p)}<span class="ca">{pSub(p)}</span>{/if}
  </div>
{/snippet}

<style>
  .v2-str{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .top{display:flex; align-items:flex-end; justify-content:space-between; gap:20px; padding:24px 30px 12px; padding-right:96px}
  .eyebrow{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em; margin-top:4px}
  .search{position:relative; display:flex; align-items:center; width:320px; flex:0 0 auto}
  .search > svg{position:absolute; left:14px; width:16px; height:16px; color:var(--v2-txt3); pointer-events:none}
  .search input{width:100%; height:40px; border-radius:var(--v2-r-pill); border:1px solid var(--v2-line2);
    background:var(--v2-surface2); color:var(--v2-txt); font:13px var(--v2-sans); padding:0 34px 0 38px; outline:none}
  .search input:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .spin{position:absolute; right:13px; width:13px; height:13px; border:2px solid var(--v2-line2);
    border-top-color:var(--v2-acc1); border-radius:50%; animation:sp .7s linear infinite}
  @keyframes sp{to{transform:rotate(360deg)}}

  .err{display:flex; align-items:center; gap:12px; margin:0 30px 10px; padding:9px 14px; border-radius:10px;
    font-size:12.5px; border:1px solid var(--v2-danger-bd); background:var(--v2-acc-soft)}
  .err button{margin-left:auto; border:0; background:transparent; color:inherit; font-size:16px; cursor:pointer}

  .svcs{display:flex; gap:6px; flex-wrap:wrap; padding:4px 30px 0}
  .svcs button{display:inline-flex; align-items:baseline; gap:9px; border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt2); cursor:pointer; font:600 13px var(--v2-sans); padding:9px 16px;
    border-radius:var(--v2-r-pill); transition:.15s}
  .svcs button:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .svcs button.on{color:var(--v2-on-acc); border-color:transparent; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .svcs .who{font:9.5px var(--v2-mono); color:var(--v2-txt3)}
  .svcs button.on .who{color:var(--v2-on-acc); opacity:.75}

  .subs{display:flex; gap:2px; padding:14px 30px 10px; border-bottom:1px solid var(--v2-line); margin:0 0 4px}
  .subs button{position:relative; border:0; background:transparent; color:var(--v2-txt2); cursor:pointer;
    font:600 13px var(--v2-sans); padding:8px 14px 12px}
  .subs button:hover{color:var(--v2-txt)}
  .subs button.on{color:var(--v2-txt)}
  .subs button.on::after{content:""; position:absolute; left:10px; right:10px; bottom:-1px; height:2px; border-radius:2px;
    background:linear-gradient(90deg,var(--v2-acc1),var(--v2-acc2))}

  .scroll{flex:1; overflow-y:auto; padding:8px 30px 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:30px 0; color:var(--v2-txt3)}
  .notice{display:flex; flex-direction:column; align-items:flex-start; gap:12px; margin-top:20px; padding:20px 22px;
    border-radius:13px; border:1px solid var(--v2-line2); background:var(--v2-surface2); max-width:640px}
  .notice p{font-size:15px; color:var(--v2-txt)}
  .notice .sub{font-size:13px; line-height:1.6; color:var(--v2-txt2)}
  .notice b{color:var(--v2-txt)}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:var(--v2-r-pill); padding:9px 17px; font:600 12.5px var(--v2-sans)}
  .lnk:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}

  .chips{display:flex; gap:7px; flex-wrap:wrap; padding:0 0 16px}
  .chip{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    font:600 11.5px var(--v2-sans); padding:6px 13px; border-radius:var(--v2-r-pill); text-transform:capitalize}
  .chip:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .chip.active{color:var(--v2-on-acc); border-color:transparent; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .chips.sous{padding-top:0; margin-top:-8px}
  .chips.sous .chip{font-size:11px; padding:5px 11px; opacity:.9}
  .inline{display:flex; align-items:center; gap:9px; flex-wrap:wrap}
  .txt{height:38px; border-radius:var(--v2-r-pill); border:1px solid var(--v2-line2); background:var(--v2-bg);
    color:var(--v2-txt); font:13px var(--v2-sans); padding:0 15px; outline:none; width:240px}
  .txt:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .notice code{font:11.5px var(--v2-mono); color:var(--v2-acc2)}

  .sec{padding:4px 0 22px}
  .sec h2{font-size:17px; font-weight:700; padding-bottom:14px}
  .grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:20px}
  .card{position:relative; display:flex; flex-direction:column}
  .open{position:absolute; inset:0; z-index:1; border:0; background:transparent; cursor:pointer; border-radius:var(--v2-r-card)}
  .open:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:2px}
  .cv{display:block; aspect-ratio:1; border-radius:var(--v2-r-card); overflow:hidden; box-shadow:var(--v2-sh-card); transition:.18s}
  .card:hover .cv{box-shadow:0 10px 24px var(--v2-glow)}
  .ct{margin-top:9px; font:600 13px var(--v2-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .ca{margin-top:2px; font:11px var(--v2-sans); color:var(--v2-txt2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}

  .arow{display:flex; gap:22px; overflow-x:auto; padding-bottom:6px; scrollbar-width:none}
  .arow::-webkit-scrollbar{display:none}
  .art{flex:0 0 auto; width:110px; text-align:center}
  .acv{display:block; width:110px; height:110px; border-radius:50%; overflow:hidden; box-shadow:var(--v2-sh-card)}
  .an{display:block; margin-top:9px; font:600 12.5px var(--v2-sans); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
</style>
