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
  import { t as tr } from '../../lib/i18n';
  import { currentZoneId } from '../../lib/stores/zones';
  import { currentTrackId } from '../../lib/stores/nowPlaying';
  import { formatDuration, errText } from '../../lib/utils';
  import type { Track, Playlist, StreamingPlaylist } from '../../lib/types';
  import AlbumArt from '../AlbumArt.svelte';
  import LignePisteV2 from './LignePisteV2.svelte';
  import { favoritePlaylistIds, favoriteStreamingKeys, streamingFavKey } from '../../lib/stores/profile';
  import { basculerFavoriLocal } from '../../lib/favorisLocaux';
  import { toggleStreamingFavorite } from '../../lib/streamingFavorites';
  import { notifications } from '../../lib/stores/notifications';

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
        <!-- Le CŒUR d'abord : il vaut pour les deux sortes de playlist, la
             locale par son identifiant, celle d'un service par la paire
             service + `source_id`. Deux tables, deux chemins. -->
        <button class="ghost sm coeur" class:on={enFavori} onclick={basculerFavori} disabled={bascule}
          aria-pressed={enFavori}
          title={$tr(enFavori ? 'favorites.removeAlbum' : 'favorites.addAlbum')}>
          <svg viewBox="0 0 24 24" fill={enFavori ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          {$tr(enFavori ? 'favorites.inFavorites' : 'favorites.addAlbum')}
        </button>

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
      {#each tracks as t, i (t.id ?? i)}
        <div class="lp">
          <LignePisteV2 piste={t} numero={i + 1} onLire={() => playFrom(i)} />
          {#if edition && isLocal}
            <button class="rm" onclick={() => removeAt(i)} aria-label={$tr('v2.pl.remove' as any)}>
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
</style>
