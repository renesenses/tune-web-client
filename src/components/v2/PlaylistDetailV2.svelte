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
  import { currentZoneId } from '../../lib/stores/zones';
  import { currentTrackId } from '../../lib/stores/nowPlaying';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { formatDuration, errText } from '../../lib/utils';
  import type { Track, Playlist, StreamingPlaylist } from '../../lib/types';
  import AlbumArt from '../AlbumArt.svelte';

  type Item =
    | { kind: 'local'; pl: Playlist }
    | { kind: 'streaming'; service: string; pl: StreamingPlaylist };

  let { item, onClose, onChanged }: { item: Item; onClose: () => void; onChanged?: () => void } = $props();

  let tracks = $state<Track[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let renaming = $state(false);
  let draft = $state('');
  const showExpert = $derived(atLeast($preferences.settingsLevel, 'expert'));
  const isLocal = $derived(item.kind === 'local');
  const title = $derived(item.pl.name);

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

  const totalMs = $derived(tracks.reduce((s, t) => s + (t.duration_ms ?? 0), 0));

  function playFrom(startIndex = 0) {
    const zid = $currentZoneId;
    if (zid == null) return;
    if (item.kind === 'local') {
      api.play(zid, { playlist_id: item.pl.id as number, start_index: startIndex }).catch(() => {});
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
      api.play(zid, { streaming_playlist_id: item.pl.source_id, source: item.service as any, start_index: startIndex }).catch(() => {});
    }
  }
  function addQueue() {
    const zid = $currentZoneId;
    if (zid == null) return;
    const ids = tracks.map((t) => t.id).filter((x): x is number => x != null);
    if (ids.length) api.addToQueue(zid, { track_ids: ids }).catch(() => {});
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
        <span>{tracks.length} titre{tracks.length > 1 ? 's' : ''}</span>
        {#if totalMs}<span>{formatDuration(totalMs)}</span>{/if}
      </div>
      <div class="actions">
        <button class="play" onclick={() => playFrom(0)}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8V4z"/></svg>Lire
        </button>
        <button class="ghost" onclick={addQueue}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h13M4 11h13M4 16h8M18 15l3 2-3 2z"/></svg>Ajouter à la file
        </button>
        {#if showExpert && isLocal}
          <button class="ghost sm" onclick={() => { draft = item.pl.name; renaming = true; }}>Renommer</button>
          <button class="ghost sm danger" onclick={() => { if (item.kind === 'local' && item.pl.id != null) api.deletePlaylist(item.pl.id).then(() => { onChanged?.(); onClose(); }).catch(() => {}); }}>Supprimer</button>
        {/if}
      </div>
    </div>
  </div>

  <div class="tracks">
    {#if loading}
      <div class="state">Chargement des pistes…</div>
    {:else if error}
      <div class="state err">{error}</div>
    {:else if !tracks.length}
      <div class="state">Cette playlist est vide.</div>
    {:else}
      {#each tracks as t, i (t.id ?? i)}
        <div class="trk" class:np={t.id != null && t.id === $currentTrackId}>
          <button class="pl" onclick={() => playFrom(i)}>
            <span class="n">{i + 1}</span>
            <span class="ti">{t.title}<em>{t.artist_name ?? ''}{t.album_title ? ' · ' + t.album_title : ''}</em></span>
          </button>
          {#if showExpert}<span class="tk">{trackTech(t)}</span>{/if}
          <span class="dur">{formatDuration(t.duration_ms ?? 0)}</span>
          {#if showExpert && isLocal}
            <button class="rm" onclick={() => removeAt(i)} aria-label="Retirer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>
            </button>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>

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
  .ghost.sm{height:44px; padding:0 14px; font-size:13px}
  .ghost.danger:hover{border-color:var(--v2-danger-bd); color:var(--v2-danger)}
  .play svg,.ghost svg{width:16px; height:16px}

  .tracks{display:flex; flex-direction:column; gap:1px}
  .state{padding:24px 6px; color:var(--v2-txt3)} .state.err{color:var(--v2-danger)}
  .trk{display:grid; grid-template-columns:1fr auto auto auto; align-items:center; gap:14px; width:100%;
    padding:0 8px; border-radius:8px; color:var(--v2-txt2)}
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
</style>
