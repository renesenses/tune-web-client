<script lang="ts">
  /**
   * Fiche album du nouveau client (direction Levente). Ouvre par-dessus la
   * grille : pochette + métadonnées + liste de pistes jouables. Détail
   * technique (fréquence/profondeur) à l'Expert, comme partout ailleurs.
   */
  import * as api from '../../lib/api';
  import { t as tr } from '../../lib/i18n';
  import { formatAnneeAlbum } from '../../lib/formats';
  import { currentZoneId } from '../../lib/stores/zones';
  import { currentTrackId } from '../../lib/stores/nowPlaying';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { getQualityTier, formatDuration,  errText } from '../../lib/utils';
  import type { Album, Track } from '../../lib/types';
  import AlbumArt from '../AlbumArt.svelte';
  import LignePisteV2 from './LignePisteV2.svelte';
  import { corpsLecture, pistesAlbumDistant, type DepotDistant } from '../../lib/tuneRemote';

  // `depot` : la fiche d'un album vivant sur un AUTRE serveur Tune. Les
  // identifiants n'y sont pas les notres — pistes et lecture doivent passer
  // par lui, sans quoi on jouerait un tout autre morceau du meme numero.
  // `service` : la fiche d'un album de STREAMING (Qobuz, Tidal…). Il n'a pas
  // d'identifiant local — son identite est `source_id` AVEC le service, et le
  // serveur n'apparie que la paire. Meme forme que `depot` : une origine qui
  // change ou l'on va chercher les pistes et comment on les joue.
  // `bandcamp` : la fiche d'un album BANDCAMP. Quatrieme origine, et la plus
  // etrangere des quatre — un album Bandcamp n'a ni identifiant local, ni
  // `source_id` de service : il est designe par l'URL de sa page publique, et
  // ses pistes se lisent par leur `stream_url`. Demande par Bertrand le
  // 05/09/2026 : « Click sur un album doit ouvrir l'album ! ». Jusque-la, un
  // clic LANCAIT l'extrait, sans jamais montrer ce que l'album contenait.
  let { album, depot = null, service = null, bandcamp = null, onClose }:
    { album: Album; depot?: DepotDistant | null; service?: string | null;
      bandcamp?: string | null; onClose: () => void } = $props();

  /** Identifiant distant de l'album, quand il vient d'un service. */
  const sidDistant = $derived(service ? ((album as any).source_id ?? null) : null);

  let tracks = $state<Track[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  const showExpert = $derived(atLeast($preferences.settingsLevel, 'expert'));

  $effect(() => {
    const id = album.id, d = depot, svc = service, sid = sidDistant, bc = bandcamp;
    // Un album de service n'a pas d'`id` local : sans cette branche, la garde
    // sortait aussitot et la fiche restait sur « Chargement… » pour toujours.
    if (id == null && !(svc && sid) && !bc) return;
    loading = true; error = null;
    const p = bc
      // Le plugin rend ses propres champs : on les traduit dans la forme d'une
      // piste, en gardant `stream_url` comme chemin de lecture — c'est ce que
      // fait deja l'ecran Bandcamp du client actuel.
      ? api.bandcampAlbum(bc).then((d2) => (d2?.tracks ?? []).map((t, i) => ({
          id: null, track_number: t.num ?? i + 1, title: t.title,
          artist_name: t.artist ?? album.artist_name ?? null,
          album_title: album.title, duration_ms: (t.duration_s ?? 0) * 1000,
          file_path: t.stream_url, cover_path: album.cover_path ?? null,
          format: 'MP3', source: 'bandcamp',
        })) as unknown as Track[])
      : svc && sid
      ? api.getStreamingAlbumTracks(svc, String(sid))
      : d
        ? pistesAlbumDistant(d, id as number)
        : api.getAlbumTracks(id as number);
    p.then((t) => { tracks = t; })
      .catch((e) => { error = errText(e) ?? 'Chargement impossible'; })
      .finally(() => { loading = false; });
  });

  const totalMs = $derived(tracks.reduce((s, t) => s + (t.duration_ms ?? 0), 0));
  const tier = $derived(getQualityTier(album));
  const qLabel = $derived.by(() => {
    if (tier === 'dsd') return 'DSD';
    const rate = album.sample_rate ? Math.round(album.sample_rate / 100) / 10 : null;
    const depth = album.bit_depth ?? 24;
    if ((tier === 'hires' || tier === 'hires_max') && rate) return `${rate} kHz · ${depth}-bit`;
    return album.format?.toUpperCase() ?? 'CD';
  });

  /** Enchaine une suite de pistes distantes : la premiere joue, les autres
   *  s'empilent. Le serveur local ne connait pas l'album distant — il n'y a
   *  pas de `album_id` a lui donner, seulement des URL de flux. */
  async function enchainerDistant(liste: Track[], depuis = 0) {
    const zid = $currentZoneId, d = depot;
    if (zid == null || !d) return;
    const suite = liste.slice(depuis).filter((t) => t.id != null);
    if (!suite.length) return;
    await api.play(zid, corpsLecture(d, suite[0]) as any);
    for (let i = 1; i < suite.length; i++) await api.addToQueue(zid, corpsLecture(d, suite[i]) as any);
  }

  function playAlbum(startIndex = 0) {
    const zid = $currentZoneId;
    if (zid == null) return;
    // 🔴 `source` va TOUJOURS avec `streaming_album_id`. Seul, l'identifiant
    // ne designe rien pour le serveur, qui retombe alors sur « reprendre la
    // lecture en cours » — le defaut releve sur les playlists Qobuz.
    if (service && sidDistant) {
      api.play(zid, { streaming_album_id: String(sidDistant), source: service as any, start_index: startIndex }).catch(() => {});
      return;
    }
    // Bandcamp : chaque piste porte son propre flux, il n'y a pas d'album a
    // designer au serveur. On lance celle qu'on a choisie.
    if (bandcamp) {
      const t = tracks[startIndex];
      if (!t?.file_path) return;
      api.play(zid, { file_path: t.file_path, title: t.title,
        artist_name: t.artist_name ?? null, cover_path: t.cover_path ?? null }).catch(() => {});
      return;
    }
    if (album.id == null) return;
    if (depot) { enchainerDistant(tracks, startIndex).catch(() => {}); return; }
    api.play(zid, { album_id: album.id, start_index: startIndex }).catch(() => {});
  }
  function shuffle() {
    const zid = $currentZoneId;
    if (zid == null || album.id == null) return;
    if (depot) {
      const l = [...tracks];
      for (let i = l.length - 1; i > 0; i--) { const j = (i * 7 + 3) % (i + 1); [l[i], l[j]] = [l[j], l[i]]; }
      enchainerDistant(l).catch(() => {});
      return;
    }
    const ids = tracks.map((t) => t.id).filter((x): x is number => x != null);
    for (let i = ids.length - 1; i > 0; i--) { const j = (i * 7 + 3) % (i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    api.play(zid, { track_ids: ids }).catch(() => {});
  }
  function addQueue() {
    const zid = $currentZoneId, d = depot;
    if (zid == null || album.id == null) return;
    if (d) {
      (async () => {
        for (const t of tracks) if (t.id != null) await api.addToQueue(zid, corpsLecture(d, t) as any);
      })().catch(() => {});
      return;
    }
    api.addToQueue(zid, { album_id: album.id }).catch(() => {});
  }
  function trackTech(t: Track): string {
    const rate = t.sample_rate ? `${Math.round(t.sample_rate / 100) / 10} kHz` : '';
    const depth = t.bit_depth ? `${t.bit_depth}-bit` : '';
    return [t.format?.toUpperCase(), rate, depth].filter(Boolean).join(' · ');
  }
</script>

<div class="v2-detail tune-v2">
  <button class="close" onclick={onClose} aria-label="Fermer">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
  </button>

  <div class="head">
    <div class="art"><AlbumArt coverPath={album.cover_path} albumId={depot ? null : album.id} size={0} alt={album.title} source={album.source} fallbackInitials={album.title?.slice(0,1)} /></div>
    <div class="meta">
      <div class="qbadge">{qLabel}</div>
      <h1>{album.title}</h1>
      <div class="artist">{album.artist_name ?? ''}</div>
      <div class="facts">
        {#if $formatAnneeAlbum(album)}<span>{$formatAnneeAlbum(album)}</span>{/if}
        <span>{tracks.length} titre{tracks.length > 1 ? 's' : ''}</span>
        {#if totalMs}<span>{formatDuration(totalMs)}</span>{/if}
      </div>
      <div class="actions">
        <button class="play" onclick={() => playAlbum(0)}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8V4z"/></svg>Lire
        </button>
        <!-- Aléatoire et « ajouter à la file » travaillent sur des identifiants
             de pistes LOCALES ; un album de service n'en a pas. Masqués plutôt
             que morts : un bouton qui ne fait rien est pire qu'un bouton
             absent. -->
        {#if !service}
          <button class="ghost" onclick={shuffle}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3l5 5-5 5M3 8h18M8 21l-5-5 5-5M21 16H3"/></svg>Aléatoire
          </button>
          <button class="ghost" onclick={addQueue}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h13M4 11h13M4 16h8M18 15l3 2-3 2z"/></svg>Ajouter à la file
          </button>
        {/if}
      </div>
    </div>
  </div>

  <div class="tracks">
    {#if loading}
      <div class="state">{$tr('v2.common.loadingTracks' as any)}</div>
    {:else if error}
      <div class="state err">{error}</div>
    {:else}
      {#each tracks as t, i (t.id ?? i)}
        <!-- Ligne PARTAGEE : meme richesse et memes gestes que partout
             ailleurs. Sans pochette — les vingt lignes porteraient la meme —
             et sans le titre de l'album, qui est deja en tete d'ecran. -->
        <LignePisteV2 piste={t} numero={t.track_number || i + 1}
          pochette={false} avecAlbum={false} onLire={() => playAlbum(i)} />
      {/each}
    {/if}
  </div>
</div>

<style>
  .v2-detail{position:absolute; inset:0; z-index:30; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow-y:auto; padding:26px 34px 40px}
  .close{position:sticky; top:0; margin-bottom:8px; width:40px; height:40px; border-radius:12px; cursor:pointer;
    border:1px solid var(--v2-line2); background:var(--v2-surface2); color:var(--v2-txt2); display:grid; place-items:center}
  .close:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .close svg{width:18px; height:18px}

  .head{display:flex; gap:30px; padding:6px 0 26px}
  .art{width:240px; height:240px; border-radius:8px; overflow:hidden; flex:0 0 auto; box-shadow:var(--v2-sh-lg)}
  .meta{display:flex; flex-direction:column; gap:12px; padding-top:8px}
  .qbadge{align-self:flex-start; font:700 11px var(--v2-mono); letter-spacing:.04em; padding:6px 10px; border-radius:8px;
    color:var(--v2-acc-tint); border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .meta h1{font-size:38px; font-weight:800; letter-spacing:-.01em; line-height:1.05}
  .artist{font-size:18px; color:var(--v2-txt2)}
  .facts{display:flex; gap:16px; font:12px var(--v2-mono); color:var(--v2-txt3)}
  .actions{display:flex; gap:12px; margin-top:8px}
  .play,.ghost{display:inline-flex; align-items:center; gap:9px; height:44px; padding:0 20px; border-radius:var(--v2-r-pill);
    font:700 14px var(--v2-sans); cursor:pointer; border:0}
  .play{color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); box-shadow:0 6px 18px var(--v2-glow-strong)}
  .ghost{color:var(--v2-txt); background:transparent; border:1px solid var(--v2-line2)}
  .ghost:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .play svg,.ghost svg{width:16px; height:16px}

  .tracks{display:flex; flex-direction:column; gap:1px}
  .state{padding:24px 6px; color:var(--v2-txt3)} .state.err{color:var(--v2-danger)}
  .trk{display:grid; grid-template-columns:1fr auto auto auto; align-items:center; gap:14px; width:100%;
    padding:0 12px; color:var(--v2-txt2); border-radius:8px}
  /* Le clic de LECTURE : c'est lui qui porte la grille du titre, la ligne
     n'etant plus qu'un conteneur depuis qu'elle accueille la barre d'actions. */
  .tclick{display:grid; grid-template-columns:34px 1fr; align-items:center; gap:14px; min-width:0;
    padding:11px 0; border:0; background:transparent; color:inherit; cursor:pointer; text-align:left; font-family:inherit}
  .trk:hover{background:var(--v2-surface2); color:var(--v2-txt)}
  .trk.np{color:var(--v2-acc1)}
  .trk .n{font:12px var(--v2-mono); color:var(--v2-txt3); text-align:right}
  .trk.np .n{color:var(--v2-acc1)}
  .trk .ti{font-size:14px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .trk .tk{font:10px var(--v2-mono); color:var(--v2-acc2); letter-spacing:.02em}
  .trk .dur{font:12px var(--v2-mono); color:var(--v2-txt3)}
</style>
