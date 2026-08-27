<script lang="ts">
  /**
   * Streaming — nouveau client (direction Levente).
   *
   * Niveau Avancé. Hub des services : leur état réel, leurs playlists, et une
   * recherche dans le service choisi.
   *
   * PÉRIMÈTRE ASSUMÉ. L'écran actuel couvre aussi la navigation profonde
   * (pages artiste, genres, discographies). Elle n'est PAS reprise ici : la
   * Recherche v2 en couvre déjà l'essentiel, et prétendre le contraire avec
   * des rubriques creuses serait pire qu'un renvoi honnête.
   *
   * L'authentification n'est jamais demandée ici : elle vit dans
   * Réglages → Accès et jetons. Cet écran se contente de DIRE qu'elle manque
   * et d'y emmener — un service non authentifié qui affiche une grille vide
   * est le pire des deux mondes.
   */
  import * as api from '../../lib/api';
  import { currentZoneId } from '../../lib/stores/zones';
  import { activeView } from '../../lib/stores/navigation';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import type { StreamingServiceStatus, StreamingPlaylist, SearchResult } from '../../lib/types';
  import AlbumArt from '../AlbumArt.svelte';
  import '../../styles/tune-v2.css';

  const level = $derived($preferences.settingsLevel);
  const showExpert = $derived(atLeast(level, 'expert'));

  let services = $state<Record<string, StreamingServiceStatus>>({});
  let loading = $state(true);
  let error = $state<string | null>(null);
  let active = $state<string | null>(null);

  let mine = $state<StreamingPlaylist[]>([]);
  let featured = $state<any[]>([]);
  let contentLoading = $state(false);

  let q = $state('');
  let results = $state<SearchResult | null>(null);
  let searching = $state(false);
  let seq = 0;

  $effect(() => {
    api.getStreamingServices()
      .then((s) => {
        services = s ?? {};
        // On ouvre d'emblée le premier service UTILISABLE : proposer un
        // service non authentifié comme entrée par défaut n'aide personne.
        const usable = Object.entries(services).find(([, v]) => v.enabled && v.authenticated);
        active = usable?.[0] ?? Object.keys(services)[0] ?? null;
      })
      .catch(() => { error = 'Services indisponibles.'; })
      .finally(() => { loading = false; });
  });

  const status = $derived(active ? services[active] : null);
  const usable = $derived(!!status?.enabled && !!status?.authenticated);

  // Contenu du service : chargé seulement s'il est réellement utilisable.
  $effect(() => {
    const svc = active;
    if (!svc || !usable) { mine = []; featured = []; return; }
    contentLoading = true;
    Promise.allSettled([api.getStreamingPlaylists(svc), api.getStreamingFeaturedPlaylists(svc)])
      .then(([m, f]) => {
        mine = m.status === 'fulfilled' ? (m.value ?? []) : [];
        featured = f.status === 'fulfilled' ? ((f.value as any) ?? []) : [];
      })
      .finally(() => { contentLoading = false; });
  });

  // Recherche dans le service, débouncée.
  $effect(() => {
    const svc = active, needle = q.trim();
    if (!svc || !usable || needle.length < 2) { results = null; searching = false; return; }
    const mine2 = ++seq;
    searching = true;
    const t = setTimeout(() => {
      api.searchStreaming(svc, needle)
        .then((r) => { if (mine2 === seq) results = r; })
        .catch(() => { if (mine2 === seq) results = null; })
        .finally(() => { if (mine2 === seq) searching = false; });
    }, 260);
    return () => clearTimeout(t);
  });

  function playAlbum(a: any) {
    const zid = $currentZoneId;
    if (zid == null || !active) return;
    const sid = a?.source_id;
    if (sid) api.play(zid, { streaming_album_id: String(sid), source: active as any }).catch(() => { error = 'Lecture impossible.'; });
    else if (a?.id != null) api.play(zid, { album_id: a.id }).catch(() => { error = 'Lecture impossible.'; });
  }
  function playPlaylist(p: StreamingPlaylist) {
    const zid = $currentZoneId;
    if (zid == null) return;
    api.play(zid, { streaming_playlist_id: p.source_id, source: p.source }).catch(() => { error = 'Lecture impossible.'; });
  }
  function pTitle(p: any): string { return p?.name ?? p?.title ?? 'Sans titre'; }
  function pCover(p: any): string | null { return p?.cover_path ?? p?.image ?? p?.picture ?? null; }
  function pId(p: any): string { return String(p?.source_id ?? p?.id ?? pTitle(p)); }
</script>

<section class="v2-str tune-v2">
  <header class="top">
    <div>
      <div class="eyebrow">Services</div>
      <h1>Streaming</h1>
    </div>
    {#if usable}
      <div class="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input placeholder={`Rechercher dans ${active}`} bind:value={q} />
        {#if searching}<span class="spin" aria-hidden="true"></span>{/if}
      </div>
    {/if}
  </header>

  {#if error}<div class="err">{error}<button onclick={() => (error = null)} aria-label="Fermer">×</button></div>{/if}

  {#if !loading && Object.keys(services).length}
    <nav class="svcs">
      {#each Object.entries(services) as [name, st] (name)}
        <button class:on={active === name} onclick={() => { active = name; q = ''; results = null; }}>
          {name}
          <span class="st" class:ok={st.enabled && st.authenticated} class:off={!st.enabled}>
            {!st.enabled ? 'désactivé' : st.authenticated ? 'connecté' : 'non connecté'}
          </span>
        </button>
      {/each}
    </nav>
  {/if}

  <div class="scroll">
    {#if loading}
      <div class="state">Chargement des services…</div>
    {:else if !Object.keys(services).length}
      <div class="state">Aucun service de streaming configuré.</div>
    {:else if !status}
      <div class="state">Choisissez un service.</div>
    {:else if !status.enabled}
      <div class="notice">
        <p><b>{active}</b> est désactivé sur ce serveur.</p>
        <button class="lnk" onclick={() => activeView.set('settings')}>Ouvrir les réglages</button>
      </div>
    {:else if !status.authenticated}
      <div class="notice">
        <p>Vous n'êtes pas connecté à <b>{active}</b>. L'authentification se fait dans <b>Réglages → Accès et jetons</b>.</p>
        <button class="lnk" onclick={() => activeView.set('settings')}>Ouvrir les réglages</button>
      </div>
    {:else}
      {#if showExpert && (status.username || status.subscription)}
        <div class="acct">
          {#if status.username}<span>{status.username}</span>{/if}
          {#if status.subscription}<span class="sub">{status.subscription}</span>{/if}
        </div>
      {/if}

      {#if results}
        {#if results.albums?.length}
          <section class="sec"><h2>Albums</h2>
            <div class="grid">
              {#each results.albums as a (a.source_id ?? a.id)}
                <div class="card">
                  <button class="open" onclick={() => playAlbum(a)} aria-label={`Lire ${a.title}`}></button>
                  <span class="cv"><AlbumArt coverPath={a.cover_path} albumId={null} size={200} alt={a.title} source={a.source} fallbackInitials={a.title?.slice(0,1)} /></span>
                  <span class="ct">{a.title}</span>
                  <span class="ca">{a.artist_name ?? ''}</span>
                </div>
              {/each}
            </div>
          </section>
        {/if}
        {#if results.artists?.length}
          <section class="sec"><h2>Artistes</h2>
            <div class="arow">
              {#each results.artists.slice(0, 12) as ar (ar.source_id ?? ar.name)}
                <div class="art">
                  <span class="acv"><AlbumArt coverPath={ar.image_path ?? null} albumId={null} size={140} alt={ar.name} fallbackInitials={ar.name?.slice(0,1)} /></span>
                  <span class="an">{ar.name}</span>
                </div>
              {/each}
            </div>
          </section>
        {/if}
        {#if !results.albums?.length && !results.artists?.length}
          <div class="state">Aucun résultat dans {active}.</div>
        {/if}

      {:else if contentLoading}
        <div class="state">Chargement du contenu…</div>
      {:else}
        {#if mine.length}
          <section class="sec"><h2>Vos playlists</h2>
            <div class="grid">
              {#each mine as p (p.source_id)}
                <div class="card">
                  <button class="open" onclick={() => playPlaylist(p)} aria-label={`Lire ${p.name}`}></button>
                  <span class="cv"><AlbumArt coverPath={p.cover_path} albumId={null} size={200} alt={p.name} fallbackInitials={p.name?.slice(0,1)} /></span>
                  <span class="ct">{p.name}</span>
                  <span class="ca">{p.track_count} titres</span>
                </div>
              {/each}
            </div>
          </section>
        {/if}
        {#if featured.length}
          <section class="sec"><h2>Mis en avant</h2>
            <div class="grid">
              {#each featured.slice(0, 24) as p, i (pId(p) + i)}
                <div class="card">
                  <button class="open" onclick={() => playPlaylist(p)} aria-label={`Lire ${pTitle(p)}`}></button>
                  <span class="cv"><AlbumArt coverPath={pCover(p)} albumId={null} size={200} alt={pTitle(p)} fallbackInitials={pTitle(p).slice(0,1)} /></span>
                  <span class="ct">{pTitle(p)}</span>
                </div>
              {/each}
            </div>
          </section>
        {/if}
        {#if !mine.length && !featured.length}
          <div class="state">Rien à afficher pour {active}. Utilisez la recherche ci-dessus.</div>
        {/if}
      {/if}
    {/if}
  </div>
</section>

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

  .svcs{display:flex; gap:6px; flex-wrap:wrap; padding:4px 30px 12px}
  .svcs button{display:inline-flex; align-items:center; gap:9px; border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt2); cursor:pointer; font:600 12.5px var(--v2-sans); padding:8px 14px;
    border-radius:var(--v2-r-pill); text-transform:capitalize; transition:.15s}
  .svcs button:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .svcs button.on{color:var(--v2-txt); border-color:var(--v2-acc2); background:var(--v2-acc-soft)}
  .svcs .st{font:9px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-danger)}
  .svcs .st.ok{color:var(--v2-acc1)}
  .svcs .st.off{color:var(--v2-txt3)}

  .scroll{flex:1; overflow-y:auto; padding:4px 30px 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:30px 0; color:var(--v2-txt3)}
  .notice{display:flex; flex-direction:column; align-items:flex-start; gap:14px; margin-top:20px; padding:18px 20px;
    border-radius:13px; border:1px solid var(--v2-line2); background:var(--v2-surface2); max-width:640px}
  .notice p{font-size:14px; line-height:1.55; color:var(--v2-txt2)}
  .notice b{color:var(--v2-txt); text-transform:capitalize}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:var(--v2-r-pill); padding:9px 17px; font:600 12.5px var(--v2-sans)}
  .lnk:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}

  .acct{display:flex; gap:12px; padding:2px 0 14px; font:11px var(--v2-mono); color:var(--v2-txt3)}
  .acct .sub{color:var(--v2-acc2)}

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
