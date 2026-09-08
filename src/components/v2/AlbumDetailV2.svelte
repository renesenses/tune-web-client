<script lang="ts">
  /**
   * Fiche album du nouveau client (direction Levente). Ouvre par-dessus la
   * grille : pochette + métadonnées + liste de pistes jouables. Détail
   * technique (fréquence/profondeur) à l'Expert, comme partout ailleurs.
   */
  import { get } from 'svelte/store';
  import * as api from '../../lib/api';
  import { t as tr } from '../../lib/i18n';
  import { formatAnneeAlbum } from '../../lib/formats';
  import { currentZoneId, playAndSync } from '../../lib/stores/zones';
  import { currentTrackId } from '../../lib/stores/nowPlaying';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { getQualityTier, formatDuration,  errText } from '../../lib/utils';
  import type { Album, Track } from '../../lib/types';
  import AlbumArt from '../AlbumArt.svelte';
  import ListePistesV2 from './ListePistesV2.svelte';
  import { corpsDeLecture, corpsDeFileListe } from '../../lib/pisteFile';
  import { queuePosition } from '../../lib/stores/queue';
  import { notifications } from '../../lib/stores/notifications';
  import { favoriteAlbumIds, favoriteStreamingKeys, streamingFavKey } from '../../lib/stores/profile';
  import { basculerFavoriLocal } from '../../lib/favorisLocaux';
  import { toggleStreamingFavorite } from '../../lib/streamingFavorites';
  import { corpsLecture, pistesAlbumDistant, type DepotDistant } from '../../lib/tuneRemote';
  import { tip } from '../../lib/tooltip';
  import { afficherDynamicRange } from '../../lib/dynamicRange';

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
      // 🔴 `source_id`, PAS `file_path`.
      //
      // Bertrand, 05/09/2026 : « bouton play sur un album Bandcamp ne lance
      // pas la lecture mais relance la lecture en cours ». C'est la signature
      // d'un corps que le serveur ne sait pas apparier : il retombe alors sur
      // « reprendre ». L'ecran Bandcamp du client actuel, lui, marche — il
      // envoie la PAIRE `source: 'bandcamp'` + `source_id: <url du flux>`.
      //
      // Porter l'URL dans `source_id` repare la lecture ET rend la piste
      // designable : la barre d'actions, qui se retirait faute de pouvoir la
      // nommer, revient sur chaque ligne.
      ? api.bandcampAlbum(bc).then((d2) => (d2?.tracks ?? []).map((t, i) => ({
          id: null, track_number: t.num ?? i + 1, title: t.title,
          artist_name: t.artist ?? album.artist_name ?? null,
          album_title: album.title, duration_ms: (t.duration_s ?? 0) * 1000,
          source: 'bandcamp', source_id: t.stream_url,
          cover_path: album.cover_path ?? null, format: 'MP3',
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

  /**
   * DYNAMIC RANGE (#1388). La fiche v2 n'en affichait AUCUN — et elle n'aurait
   * rien pu en afficher : `album` lui vient de la GRILLE, servie par la route
   * de liste, qui ne porte pas la clé. Seul `GET /library/albums/{id}` rend
   * `dynamic_range` et `dynamic_range_source`. Il faut donc aller la lire, ce
   * que la fiche de l'ancienne interface fait depuis toujours.
   *
   * Requête SÉPARÉE, et non ajoutée au `Promise.all` des pistes : le DR est
   * une décoration. Son échec ne doit ni retarder la liste des pistes, ni
   * allumer le bandeau d'erreur de la fiche.
   *
   * Un album distant, de service ou Bandcamp n'a pas d'identifiant local :
   * aucune requête n'est tentée pour lui, et le badge reste absent.
   *
   * L'effet ÉCRIT `fiche` et ne la LIT jamais — sans quoi il se relancerait
   * lui-même sans fin. Le drapeau `vivant` évite qu'une réponse tardive
   * n'écrase le DR de l'album suivant.
   */
  let fiche = $state<Album | null>(null);
  $effect(() => {
    const id = album.id, d = depot, svc = service, bc = bandcamp;
    fiche = null;
    if (id == null || d || svc || bc) return;
    let vivant = true;
    api.getAlbum(id).then((a) => { if (vivant) fiche = a; }).catch(() => {});
    return () => { vivant = false; };
  });

  /** Le badge DR, et ce qu'il doit dire de sa provenance. */
  const dr = $derived(afficherDynamicRange(fiche));

  /**
   * FAVORI. Bertrand, 05/09/2026 : « En vue Album, où se trouve l'icône
   * favori ? » — nulle part. Le cœur vivait sur la pochette dans la grille,
   * posé par `PochetteActions` ; en ouvrant l'album on le perdait, et il
   * fallait refermer la fiche pour mettre un disque en favori.
   *
   * Les deux espaces d'identifiants sont distincts : un album local est
   * désigné par son `id`, un album de service par la paire service +
   * `source_id`, et ils vivent dans deux tables. Le premier chemin sur le
   * second ne retirerait rien, en silence (#1478).
   */
  const cleService = $derived(
    service && sidDistant ? streamingFavKey('album', service, String(sidDistant)) : null,
  );
  const enFavori = $derived(
    album.id != null ? $favoriteAlbumIds.has(album.id)
      : cleService != null && $favoriteStreamingKeys.has(cleService),
  );
  let bascule = $state(false);
  async function basculerFavori() {
    if (bascule) return;
    bascule = true;
    try {
      if (album.id != null) await basculerFavoriLocal({ albumId: album.id });
      else if (service && sidDistant) {
        await toggleStreamingFavorite({
          itemType: 'album', service, serviceId: String(sidDistant),
          title: album.title, artist: album.artist_name ?? undefined,
          coverUrl: album.cover_path ?? undefined,
        });
      }
    } catch { /* le cœur reprend son état au prochain relevé */ }
    bascule = false;
  }

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
    await playAndSync(zid, corpsLecture(d, suite[0]) as any);
    for (let i = 1; i < suite.length; i++) await api.addToQueue(zid, corpsLecture(d, suite[i]) as any);
  }

  function playAlbum(startIndex = 0) {
    const zid = $currentZoneId;
    if (zid == null) return;
    // 🔴 `source` va TOUJOURS avec `streaming_album_id`. Seul, l'identifiant
    // ne designe rien pour le serveur, qui retombe alors sur « reprendre la
    // lecture en cours » — le defaut releve sur les playlists Qobuz.
    if (service && sidDistant) {
      playAndSync(zid, { streaming_album_id: String(sidDistant), source: service as any, start_index: startIndex }).catch(() => {});
      return;
    }
    // Bandcamp : chaque piste porte son propre flux, il n'y a pas d'album a
    // designer au serveur. On lance celle qu'on a choisie, par le MEME chemin
    // que partout ailleurs — `corpsDeLecture` sait former la paire.
    if (bandcamp) {
      const corps = corpsDeLecture(tracks[startIndex]);
      if (!corps) return;
      playAndSync(zid, corps as any).catch(() => {});
      return;
    }
    if (album.id == null) return;
    if (depot) { enchainerDistant(tracks, startIndex).catch(() => {}); return; }
    playAndSync(zid, { album_id: album.id, start_index: startIndex }).catch(() => {});
  }
  /** Melange en place, sans hasard reel : la meme permutation pour un meme
   *  nombre de pistes. C'etait deja le cas ici, on ne fait que l'extraire. */
  function melanger<T>(l: T[]): T[] {
    const c = [...l];
    for (let i = c.length - 1; i > 0; i--) { const j = (i * 7 + 3) % (i + 1); [c[i], c[j]] = [c[j], c[i]]; }
    return c;
  }

  function shuffle() {
    const zid = $currentZoneId;
    if (zid == null) return;
    if (depot) { enchainerDistant(melanger(tracks)).catch(() => {}); return; }
    // Album de SERVICE ou Bandcamp : pas d'`id` local, mais chaque piste est
    // designable par sa paire `source` + `source_id`. La premiere joue, les
    // autres s'empilent en UNE requete.
    if (service || bandcamp) {
      const l = melanger(tracks);
      const tete = corpsDeLecture(l[0]);
      if (!tete) return;
      (async () => {
        await playAndSync(zid, tete as any);
        const reste = corpsDeFileListe(l.slice(1));
        if (reste) await api.addToQueue(zid, reste);
      })().catch(() => {});
      return;
    }
    if (album.id == null) return;
    const ids = melanger(tracks.map((t) => t.id).filter((x): x is number => x != null));
    playAndSync(zid, { track_ids: ids }).catch(() => {});
  }
  /**
   * Les deux boutons de file, pour les QUATRE origines.
   *
   * « Ajouter à la file » et « Lire ensuite » étaient MASQUÉS dès qu'un album
   * venait d'un service : « Aléatoire et "ajouter à la file" travaillent sur
   * des identifiants de pistes LOCALES ; un album de service n'en a pas »,
   * disait le commentaire. La moitié était vraie — l'album n'a pas d'`id` —,
   * la conclusion ne l'était pas : `QueueAddRequest` accepte `tracks[]`, des
   * lignes de service, et les fait passer par le même `insert_at`.
   *
   * « Vue album : ajouter Ajouter à la file d'attente, lire à la fin du
   * prochain morceau ; ex qobuz, ajouter les 5 CTA » (Bertrand, 06/09/2026).
   * Un album Qobuz n'offrait que deux boutons sur cinq.
   *
   * ⚠️ UNE requête, pas une boucle. La boucle précédente envoyait un appel par
   * piste ; avec un rang, chaque insertion décalait la suivante et l'ordre de
   * l'album s'inversait.
   */
  let fileOccupee = $state(false);
  async function enfiler(position: number | undefined, cle: string) {
    const zid = $currentZoneId, d = depot;
    if (zid == null || fileOccupee) return;
    // L'album LOCAL part par son identifiant : le serveur applique alors le
    // rattrapage de la ligne sœur, que résoudre les pistes ici ignorerait —
    // l'album s'ajoutait VIDE là où « lire » marchait (Pascal, v0.9.21).
    const corps = !d && !service && !bandcamp && album.id != null
      ? { album_id: album.id, ...(position != null ? { position } : {}) }
      : corpsDeFileListe(d ? tracks.map((t) => corpsLecture(d, t) as any) : tracks, position);
    if (!corps) return;
    fileOccupee = true;
    try {
      await api.addToQueue(zid, corps);
      notifications.success($tr(cle as any).replace('{title}', album.title ?? ''));
    } catch {
      notifications.error($tr('v2.pa.queueError' as any));
    }
    fileOccupee = false;
  }
  const addQueue = () => enfiler(undefined, 'v2.album.queued');
  /** « Lire ensuite » insère au rang SUIVANT celui qui joue. Sans rang, la
   *  route ajoute à la fin — ce serait le bouton d'à côté. */
  const lireEnsuite = () => enfiler(get(queuePosition) + 1, 'v2.album.queuedNext');
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
        <!-- #1388 : `DR 12` pour une mesure inscrite dans le fichier,
             `DR ~12` souligné en pointillés pour la moyenne des pistes. Même
             valeur, provenance différente — voir `lib/dynamicRange.ts`. -->
        {#if dr}<span class="dr" class:deduit={dr.deduit} use:tip={dr.cleInfobulle}>DR {dr.texte}</span>{/if}
      </div>
      <div class="actions">
        <button class="play" onclick={() => playAlbum(0)}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8V4z"/></svg>{$tr('v2.album.play' as any)}
        </button>
        <!-- 🔴 Les CINQ actions valent pour les QUATRE origines.
             Elles étaient masquées dès qu'un album venait d'un service, au
             motif qu'elles « travaillent sur des identifiants de pistes
             LOCALES ». L'album n'a effectivement pas d'`id` — mais chaque
             piste porte sa paire `source` + `source_id`, et la route de file
             accepte `tracks[]`. Un album Qobuz n'offrait que deux boutons sur
             cinq (Bertrand, 06/09/2026). -->
        <button class="ghost" onclick={shuffle}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3l5 5-5 5M3 8h18M8 21l-5-5 5-5M21 16H3"/></svg>{$tr('v2.album.shuffle' as any)}
        </button>
        <button class="ghost" onclick={lireEnsuite} disabled={fileOccupee}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h9M4 12h9M4 18h5"/><path d="M15 8l5 4-5 4z" fill="currentColor" stroke="none"/></svg>{$tr('v2.album.playNext' as any)}
        </button>
        <button class="ghost" onclick={addQueue} disabled={fileOccupee}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h13M4 11h13M4 16h8M18 15l3 2-3 2z"/></svg>{$tr('v2.album.addQueue' as any)}
        </button>
        <!-- Le cœur n'apparaît que si l'album est DÉSIGNABLE : un album
             Bandcamp, identifié par une URL, n'entre dans aucune des deux
             tables de favoris. Un bouton absent ne promet rien. -->
        {#if album.id != null || (service && sidDistant)}
          <button class="ghost coeur" class:on={enFavori} onclick={basculerFavori} disabled={bascule}
            aria-pressed={enFavori}
            title={$tr(enFavori ? 'favorites.removeAlbum' : 'favorites.addAlbum')}
            aria-label={$tr(enFavori ? 'favorites.removeAlbum' : 'favorites.addAlbum')}>
            <svg viewBox="0 0 24 24" fill={enFavori ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            {$tr(enFavori ? 'favorites.inFavorites' : 'favorites.addAlbum')}
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
      <!-- LISTE partagée, et non plus une boucle de lignes.
           Au mode Essentiel elle rend un TABLEAU à colonnes choisies (maquette
           Levente, 07/09/2026) ; aux deux autres modes, exactement les mêmes
           lignes qu'avant — sans pochette, les vingt porteraient la même, et
           sans le titre de l'album, déjà en tête d'écran.
           `numerotation="piste"` : c'est le rang DANS L'ALBUM qui compte ici,
           pas la position dans la liste affichée. -->
      <ListePistesV2
        pistes={tracks}
        numerotation="piste"
        pochette={false}
        avecAlbum={false}
        onLire={(_p, i) => playAlbum(i)}
      />
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
  /* Le DR DÉDUIT (moyenne des pistes) : tilde dans le texte, soulignement
     pointillé en `currentColor` — donc lisible dans les deux thèmes sans
     jeton de couleur, et sans peser sur la ligne. Une mesure d'album ne porte
     aucune marque : c'est la valeur nue. */
  .dr.deduit{text-decoration:underline dotted currentColor; text-underline-offset:3px; text-decoration-thickness:1px}
  .actions{display:flex; gap:12px; margin-top:8px}
  .play,.ghost{display:inline-flex; align-items:center; gap:9px; height:44px; padding:0 20px; border-radius:var(--v2-r-pill);
    font:700 14px var(--v2-sans); cursor:pointer; border:0}
  .play{color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); box-shadow:0 6px 18px var(--v2-glow-strong)}
  .ghost{color:var(--v2-txt); background:transparent; border:1px solid var(--v2-line2)}
  .ghost:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  /* Le cœur ACTIF garde le rouge : c'est un ÉTAT, pas une action — la même
     règle que sur les lignes de piste. */
  .coeur.on{color:var(--v2-danger); border-color:var(--v2-danger-bd)}
  .coeur.on:hover{color:var(--v2-danger); border-color:var(--v2-danger-bd)}
  .coeur:disabled{opacity:.55; cursor:default}
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
