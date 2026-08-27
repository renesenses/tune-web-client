<script lang="ts">
  /**
   * Playlists du nouveau client (direction Levente). Cœur de nav, présent à
   * tous les niveaux. Densité par niveau :
   *   Essentiel → vos playlists locales, lecture et consultation.
   *   Avancé    → création d'une playlist + playlists importées des services.
   *   Expert    → renommer / supprimer une playlist, retirer un titre, ligne
   *               technique par piste (dans la fiche).
   *
   * Le clic ouvre l'overlay PlaylistDetailV2 (la section est `position:relative`).
   */
  import * as api from '../../lib/api';
  import { currentZoneId } from '../../lib/stores/zones';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { formatDuration } from '../../lib/utils';
  import type { Playlist, StreamingPlaylist } from '../../lib/types';
  import AlbumArt from '../AlbumArt.svelte';
  import PlaylistDetailV2 from './PlaylistDetailV2.svelte';
  import '../../styles/tune-v2.css';

  const showAdvanced = $derived(atLeast($preferences.settingsLevel, 'intermediate'));

  let local = $state<Playlist[]>([]);
  let services = $state<Record<string, StreamingPlaylist[]>>({});
  let loading = $state(true);
  let creating = $state(false);
  let newName = $state('');
  let opened = $state<
    | { kind: 'local'; pl: Playlist }
    | { kind: 'streaming'; service: string; pl: StreamingPlaylist }
    | null
  >(null);

  function load() {
    loading = true;
    api.getAllPlaylists()
      .then((r) => { local = r.local ?? []; services = r.services ?? {}; })
      .catch(() => { local = []; services = {}; })
      .finally(() => { loading = false; });
  }
  $effect(() => { load(); });

  const svcEntries = $derived(Object.entries(services).filter(([, l]) => l.length));

  function playLocal(pl: Playlist, e: MouseEvent) {
    e.stopPropagation();
    const zid = $currentZoneId;
    if (zid == null || pl.id == null) return;
    api.play(zid, { playlist_id: pl.id }).catch(() => {});
  }
  function playStreaming(service: string, pl: StreamingPlaylist, e: MouseEvent) {
    e.stopPropagation();
    const zid = $currentZoneId;
    if (zid == null) return;
    api.play(zid, { streaming_playlist_id: pl.source_id, source: pl.source }).catch(() => {});
  }
  function create() {
    const name = newName.trim();
    if (!name) { creating = false; return; }
    api.createPlaylist(name)
      .then(() => { newName = ''; creating = false; load(); })
      .catch(() => { creating = false; });
  }
</script>

<section class="v2-playlists tune-v2">
  <header class="top">
    <div>
      <div class="eyebrow">Vos collections</div>
      <h1>Playlists</h1>
    </div>
    {#if showAdvanced}
      {#if creating}
        <div class="newp">
          <!-- svelte-ignore a11y_autofocus -->
          <input bind:value={newName} placeholder="Nom de la playlist" autofocus
            onkeydown={(e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') { creating = false; newName = ''; } }} />
          <button class="mk" onclick={create}>Créer</button>
        </div>
      {:else}
        <button class="add" onclick={() => (creating = true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          Nouvelle playlist
        </button>
      {/if}
    {/if}
  </header>

  <div class="scroll">
    {#if loading}
      <div class="state">Chargement des playlists…</div>
    {:else}
      <section class="grp">
        {#if showAdvanced && svcEntries.length}<h2>Sur cet appareil</h2>{/if}
        {#if local.length}
          <div class="grid">
            {#each local as pl (pl.id)}
              <div class="card local">
                <span class="cv">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7h11M4 12h11M4 17h7M17 17V7l4 2"/></svg>
                </span>
                <span class="ct">{pl.name}</span>
                <span class="ca">{pl.track_count ?? 0} titre{(pl.track_count ?? 0) > 1 ? 's' : ''}</span>
                <button class="open" onclick={() => (opened = { kind: 'local', pl })} aria-label={`Ouvrir ${pl.name}`}></button>
                <button class="pbtn" onclick={(e) => playLocal(pl, e)} aria-label="Lire">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8V4z"/></svg>
                </button>
              </div>
            {/each}
          </div>
        {:else}
          <div class="state empty">Aucune playlist pour l'instant.{showAdvanced ? ' Créez-en une avec « Nouvelle playlist ».' : ''}</div>
        {/if}
      </section>

      {#if showAdvanced}
        {#each svcEntries as [svc, list] (svc)}
          <section class="grp">
            <h2>{svc}</h2>
            <div class="grid">
              {#each list as pl (pl.source_id)}
                <div class="card">
                  <span class="cv img">
                    <AlbumArt coverPath={pl.cover_path} albumId={null} size={220} alt={pl.name} fallbackInitials={pl.name?.slice(0,1)} />
                  </span>
                  <span class="ct">{pl.name}</span>
                  <span class="ca">{pl.track_count} titres{pl.duration_ms ? ' · ' + formatDuration(pl.duration_ms) : ''}</span>
                  <button class="open" onclick={() => (opened = { kind: 'streaming', service: svc, pl })} aria-label={`Ouvrir ${pl.name}`}></button>
                  <button class="pbtn" onclick={(e) => playStreaming(svc, pl, e)} aria-label="Lire">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8V4z"/></svg>
                  </button>
                </div>
              {/each}
            </div>
          </section>
        {/each}
      {/if}
    {/if}
  </div>

  {#if opened}
    <PlaylistDetailV2 item={opened} onClose={() => (opened = null)} onChanged={load} />
  {/if}
</section>

<style>
  .v2-playlists{position:relative; display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}

  .top{display:flex; align-items:flex-end; justify-content:space-between; gap:20px; padding:24px 30px 10px; padding-right:96px}
  .eyebrow{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em; margin-top:4px}
  .add{display:inline-flex; align-items:center; gap:8px; height:42px; padding:0 16px; border-radius:var(--v2-r-pill);
    border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt); font:600 13px var(--v2-sans); cursor:pointer}
  .add svg{width:16px; height:16px}
  .add:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .newp{display:flex; gap:8px}
  .newp input{height:42px; border-radius:var(--v2-r-pill); border:1px solid var(--v2-acc2); background:var(--v2-surface2);
    color:var(--v2-txt); font:14px var(--v2-sans); padding:0 16px; outline:none; width:240px}
  .mk{height:42px; padding:0 18px; border-radius:var(--v2-r-pill); border:0; cursor:pointer; font:700 13px var(--v2-sans);
    color:#04121a; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}

  .scroll{flex:1; overflow-y:auto; padding:10px 0 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:24px 30px; color:var(--v2-txt3)} .state.empty{color:var(--v2-txt2)}

  .grp{padding:14px 30px 8px}
  .grp h2{font-size:18px; font-weight:700; padding-bottom:14px}
  .grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:22px}
  .card{position:relative; border:0; background:transparent; color:inherit; text-align:left; padding:0; display:flex; flex-direction:column}
  .open{position:absolute; inset:0; z-index:1; border:0; background:transparent; cursor:pointer; border-radius:var(--v2-r-card)}
  .open:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:2px}
  .cv{position:relative; aspect-ratio:1; border-radius:var(--v2-r-card); overflow:hidden; box-shadow:0 6px 16px rgba(0,0,0,.35);
    transition:.18s; display:grid; place-items:center; color:#04121a; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .cv.img{background:none; color:inherit}
  .cv > svg{width:52px; height:52px; opacity:.9}
  .card:hover .cv{box-shadow:0 10px 24px rgba(0,212,170,.22)}
  .pbtn{position:absolute; right:10px; bottom:10px; z-index:2; width:42px; height:42px; border-radius:50%; border:0; cursor:pointer;
    color:#04121a; background:var(--v2-acc1); box-shadow:0 6px 16px rgba(0,0,0,.4); display:grid; place-items:center;
    opacity:0; transform:translateY(6px); transition:.16s}
  .card:hover .pbtn{opacity:1; transform:none}
  .pbtn svg{width:18px; height:18px; margin-left:2px}
  .pbtn:hover{background:var(--v2-acc-tint)}
  .ct{margin-top:10px; font:600 14px var(--v2-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .ca{margin-top:2px; font:11px var(--v2-mono); color:var(--v2-txt3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
</style>
