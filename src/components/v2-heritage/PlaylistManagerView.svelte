<script lang="ts">
  import { bulleTexte } from '../../lib/infobulleTexte';
  import { get } from 'svelte/store';
  import { currentZone, zones, playAndSync } from '../../lib/stores/zones';
  import { currentTrack, currentTrackId, estLaPisteEnLecture } from '../../lib/stores/nowPlaying';
  import { dialogs } from '../../lib/stores/dialogs';
  import { isPremium } from '../../lib/stores/license';
  import { playlists as playlistsStore, pendingPlaylistId } from '../../lib/stores/playlists';
  import { streamingServices } from '../../lib/stores/streaming';
  import * as api from '../../lib/api';
  import { shareLink } from '../../lib/playlistShare';
  import { formatTime, formatAudioBadge, errText } from '../../lib/utils';
  import type { Playlist, Track, StreamingPlaylist, PlaylistTransferResponse, PlaylistDiffResponse, PlaylistRecoverResponse, TransferTrackResult, TransferAlternative } from '../../lib/types';
  import { t as tr } from '../../lib/i18n';
  import { pisteAppliquee, resumeApplication } from '../../lib/recuperationPlaylist';
  import { notifications } from '../../lib/stores/notifications';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import { pisteIndisponible } from '../../lib/albumAParaitre';
  import ClampedText from '../partages/ClampedText.svelte';
  import HeartButton from '../partages/HeartButton.svelte';
  import MosaiquePochettes from '../v2/MosaiquePochettes.svelte';
  import { quatreDistinctes } from '../../lib/mosaique';
  import SmartPlaylistsView from './SmartPlaylistsView.svelte';
  import SmartAIView from './SmartAIView.svelte';
  import { listResetNonce } from '../../lib/stores/navigation';

  let viewTab = $state<'manual' | 'smart' | 'smart-ai'>('manual');

  async function handleSharePlaylist(playlistId: number) {
    try {
      const result = await api.sharePlaylist(playlistId);
      // `url` et `token` : les DEUX seuls champs que le serveur rend
      // (`playlists.rs`, `share_playlist`). Le repli d'avant collait
      // `JSON.stringify(result)` — le corps brut, jeton compris — et annonçait
      // « lien copié » : n'importe quelle réponse passait pour une réussite.
      // `shareLink` lève à la place, et l'écran dit son erreur.
      await navigator.clipboard.writeText(shareLink(result, window.location.origin));
      notifications.success($tr('playlistManager.linkCopied'));
    } catch (e) {
      console.error('Share playlist error:', e);
      notifications.error($tr('playlistManager.shareError'));
    }
  }

  interface Props {
    onAddToPlaylist?: (track: Track) => void;
  }
  let { onAddToPlaylist }: Props = $props();

  let zone = $derived($currentZone);

  // Unified data
  let localPlaylists = $state<Playlist[]>([]);
  let streamingPlaylists = $state<Record<string, StreamingPlaylist[]>>({});
  let loading = $state(true);
  let loadingStatus = $state('');
  let loadedCount = $state(0);
  let searchQuery = $state('');
  let activeFilter = $state<string>('all');

  // Detail view
  let selectedPlaylist = $state<Playlist | null>(null);
  let selectedStreamingPl = $state<StreamingPlaylist | null>(null);
  let selectedService = $state('');
  let detailTracks = $state<Track[]>([]);
  // Drag-to-reorder (local playlists only). JP Borderies: "on ne peut pas
  // reclasser les morceaux d'une playlist". The server already supports it via
  // reorderPlaylistTracks; this wires the drag UI.
  let dragIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);
  let detailLoading = $state(false);

  // Clicking the Playlists nav entry (even while viewing a playlist) returns to
  // the list (Elie).
  $effect(() => {
    $listResetNonce;
    selectedPlaylist = null;
    selectedStreamingPl = null;
  });

  // Import dialog
  let importTarget = $state<{ service: string; playlist: StreamingPlaylist } | null>(null);
  let importName = $state('');
  let importing = $state(false);
  let importResult = $state<{ name: string; count: number; total: number } | null>(null);

  // Transfer dialog
  let showTransfer = $state(false);
  let transferTargetService = $state('local');
  let transferName = $state('');
  let transferring = $state(false);
  let transferResult = $state<PlaylistTransferResponse | null>(null);
  let transferFilter = $state<string>('all'); // 'all', 'matched', 'approximate', 'not_found'
  let expandedAlternatives = $state<Set<number>>(new Set()); // track index -> expanded
  let confirmingTransfer = $state(false);
  let hasManualResolutions = $derived(
    transferResult?.tracks.some(t => t.match_method === 'manual') ?? false
  );

  // Diff dialog
  let showDiff = $state(false);
  let diffTargetService = $state('');
  let diffTargetPlaylistId = $state('');
  let diffTargetPlaylists = $state<StreamingPlaylist[] | Playlist[]>([]);
  let diffing = $state(false);
  let diffResult = $state<PlaylistDiffResponse | null>(null);
  let diffLoadingPlaylists = $state(false);

  // Recover dialog
  let showRecover = $state(false);
  let recovering = $state(false);
  let recoverResult = $state<PlaylistRecoverResponse | null>(null);
  /** #1076 — ce que le serveur a répondu à la dernière application : combien
   *  sont passées, et le MOTIF de chaque refus. */
  let recoverMsg = $state<string | null>(null);
  let applyingRecovery = $state<Set<number>>(new Set());
  let applyingAll = $state(false);

  // Create dialog
  let showCreate = $state(false);
  let newName = $state('');
  let newDescription = $state('');

  // Merge mode
  /**
   * LA SÉLECTION, sans mode préalable (Bertrand + maquette Levente, 20/09/2026).
   *
   * 🔴 Avant, fusionner demandait de DÉCOUVRIR un mode : un bouton
   * « Fusionner » basculait l'écran, et seulement alors des cases
   * apparaissaient sur les lignes. Bertrand : « il me semble que la fusion ne
   * marche pas ! » — elle marchait, mais personne ne trouvait la porte.
   *
   * Désormais : on coche le coin d'une carte, et la barre d'actions APPARAÎT.
   * Le mode n'existe plus.
   */
  let mergeSelected = $state<Set<string>>(new Set());  // clés : `${service}:${id}`

  /**
   * Le service de la PREMIÈRE carte cochée.
   *
   * 🔴 Ce fut longtemps un VERROU : cocher une carte TIDAL rendait inertes
   * toutes les cartes Qobuz. Bertrand, 21/09 : « Quand je vais merger des
   * playlists de Tidal et Qobuz, quand vais-je choisir la cible ? » —
   * jamais, puisqu'il ne pouvait pas mélanger. Le verrou est tombé ; il ne
   * reste qu'une PROPOSITION de cible, que le sélecteur de la barre peut
   * remplacer.
   */
  let premierServiceCoche = $derived.by(() => {
    const premiere = mergeSelected.values().next();
    return premiere.done ? null : cleService(premiere.value);
  });

  /** Les services représentés dans la sélection, sans doublon. */
  let servicesCoches = $derived.by(() => {
    const vus = new Set<string>();
    for (const cle of mergeSelected) vus.add(cleService(cle));
    return vus;
  });

  /**
   * La cible de la fusion, CHOISIE.
   *
   * Vide tant que l'utilisateur n'a rien dit : c'est alors le service de la
   * première carte cochée qui sert, pour que le cas courant — tout d'un
   * même service — ne demande aucun geste.
   */
  let cibleChoisie = $state('');
  let cibleFusion = $derived(cibleChoisie || premierServiceCoche || 'local');

  /** La sélection mélange-t-elle plusieurs services ? */
  let selectionMixte = $derived(servicesCoches.size > 1);

  /**
   * Une fusion CROISÉE cherche chaque titre dans le catalogue de la cible :
   * un aller-retour réseau par titre. Le dire avant, pas après.
   */
  let titresAApparier = $derived.by(() => {
    let n = 0;
    for (const cle of mergeSelected) if (cleService(cle) !== cibleFusion) n += 1;
    return n;
  });

  /**
   * L'identifiant d'une entrée, local ou de service.
   *
   * Écrit UNE fois : la même expression était recopiée quatre fois dans le
   * balisage, et une copie qui diverge coche une carte sans en décocher
   * l'autre.
   */
  function identifiantDe(item: DisplayPlaylist): string {
    return String(item.local?.id ?? item.streaming?.source_id ?? '');
  }

  /**
   * LES TROIS AUTRES COINS DE LA CARTE (maquette Levente).
   *
   * Tous les trois se branchent sur de l'EXISTANT, mesuré sur le .18 le
   * 21/09/2026 avant d'écrire une ligne — aucun travail serveur :
   *
   *   · cœur       `HeartButton` accepte déjà `playlistId` ;
   *   · crayon     `api.updatePlaylist(id, { name })` ;
   *   · étiquettes `EtiquettesPanneau` accepte `itemType="playlist"`, et la
   *                route le prouve : POST /tags/{id}/items rend 201, la
   *                relecture montre l'étiquette, DELETE rend 204.
   *
   * 🔴 Ils ne s'affichent que sur une playlist LOCALE. Une playlist de service
   * n'a pas d'identifiant de bibliothèque à donner à ces trois routes : ce qui
   * ne s'applique pas est ABSENT, jamais grisé.
   */
  /** La cible du panneau d'étiquettes : locale (`itemId`) ou de service. */
  let etiquettesCible = $state<any | null>(null);

  /** Ce qu'il faut étiqueter, selon le type de la carte. */
  function cibleEtiquetteDe(item: DisplayPlaylist): any {
    if (item.type === 'local' && item.local?.id != null) {
      return { itemType: 'playlist', itemId: item.local.id };
    }
    // Mesuré sur le .18 le 21/09/2026 : POST /tags/{id}/streaming-items avec
    // `item_type: "playlist"` rend 201, et la relecture montre l'étiquette.
    // Une playlist de service s'étiquette donc aussi bien qu'une locale.
    return {
      itemType: 'playlist',
      source: item.service,
      sourceId: String(item.streaming?.source_id ?? ''),
      titre: item.name,
      pochette: item.coverPath ?? null,
    };
  }

  /** Le favori : identifiant local, ou paire service + identifiant. */
  function favoriDe(item: DisplayPlaylist): any {
    return item.type === 'local' && item.local?.id != null
      ? { playlistId: item.local.id }
      : {
          streaming: {
            itemType: 'playlist',
            service: item.service,
            serviceId: String(item.streaming?.source_id ?? ''),
            title: item.name,
            coverUrl: item.coverPath ?? undefined,
          },
        };
  }

  /** Lire la playlist, quelle que soit son origine. */
  function lirePlaylist(item: DisplayPlaylist) {
    if (item.type === 'local' && item.local?.id != null) playPlaylist(item.local.id);
    else if (item.streaming) void playStreamingPlaylist(item.streaming);
  }

  async function renommerPlaylist(id: number, nomActuel: string) {
    const nouveau = await dialogs.prompt($tr('playlistManager.renamePrompt' as any), nomActuel);
    const propre = (nouveau ?? '').trim();
    // Annulé, vidé, ou inchangé : on ne repart pas au serveur pour rien.
    if (!propre || propre === nomActuel) return;
    try {
      await api.updatePlaylist(id, { name: propre });
      localPlaylists = await api.getPlaylists();
    } catch (err: any) {
      notifications.error(errText(err) ?? $tr('common.serverUnreachable'));
    }
  }

  /** Le service d'une clé `service:id`, sans amputer l'identifiant. */
  function cleService(cle: string): string {
    const coupe = cle.indexOf(':');
    return coupe === -1 ? cle : cle.slice(0, coupe);
  }

  /** L'identifiant d'une clé `service:id`, deux-points compris. */
  function cleIdentifiant(cle: string): string {
    const coupe = cle.indexOf(':');
    return coupe === -1 ? '' : cle.slice(coupe + 1);
  }
  let mergeName = $state('');
  /**
   * Le champ a-t-il été TOUCHÉ par l'utilisateur ?
   *
   * 🔴 Bertrand, 21/09 : « Bouton merge grisé » — huit playlists cochées, le
   * bouton éteint. La cause n'était pas la sélection mais le NOM : le bouton
   * porte `!mergeName.trim()` dans son `disabled`, et rien ne disait que le
   * champ vide était le motif. On propose donc un nom dès la deuxième carte
   * cochée, et ce drapeau évite d'écraser ce que l'utilisateur a tapé.
   */
  let mergeNameTouched = $state(false);
  let mergeDedup = $state(true);
  let merging = $state(false);
  type IntrouvableFusion = { title: string; artist: string; service: string };
  let mergeResult = $state<{
    name: string;
    total_tracks: number;
    service?: string;
    not_found?: number;
    unmatched?: IntrouvableFusion[];
  } | null>(null);

  function mergeKey(service: string, id: string): string {
    return `${service}:${id}`;
  }

  function toggleMergeSelect(service: string, id: string) {
    const key = mergeKey(service, id);
    const next = new Set(mergeSelected);
    if (next.has(key)) next.delete(key); else next.add(key);
    mergeSelected = next;
  }

  function cancelMerge() {
    mergeSelected = new Set();
    mergeName = '';
    mergeNameTouched = false;
    cibleChoisie = '';
    mergeResult = null;
  }

  /**
   * Le nom proposé : celui de la première playlist cochée, et le nombre des
   * autres. Éditable — c'est une proposition, pas une contrainte.
   */
  function nomDeFusionPropose(): string {
    const cles = Array.from(mergeSelected);
    if (cles.length < 2) return '';
    const premiere = displayPlaylists.find(
      (p) => mergeKey(p.service, identifiantDe(p)) === cles[0],
    );
    if (!premiere) return '';
    return $tr('playlistManager.mergedNameDefault' as any)
      .replace('{name}', premiere.name)
      .replace('{count}', String(cles.length - 1));
  }

  async function doMerge() {
    if (mergeSelected.size < 2 || !mergeName.trim()) return;
    // 🔴 `key.split(':', 2)` AMPUTAIT l'identifiant : en JavaScript, le second
    // argument TRONQUE le tableau, il ne rejoint pas le reste. Un identifiant
    // portant un deux-points partait coupé, et la fusion échouait sans dire
    // pourquoi. Les identifiants locaux sont numériques, donc ça ne mordait
    // pas encore — ça aurait mordu au premier service qui en met.
    const playlists = Array.from(mergeSelected).map((cle) => ({
      service: cleService(cle),
      playlist_id: cleIdentifiant(cle),
    }));
    // « Au même endroit » : la sélection étant confinée à un service, la
    // fusion atterrit dans celui-là.
    //
    // 🔴 Le serveur JETAIT ce champ — `MergeRequest` ne le déclarait pas, et
    // serde écarte en silence un champ inconnu. La fusion de huit playlists
    // Qobuz créait donc une playlist LOCALE, et vide par-dessus le marché.
    // Corrigé côté serveur ; gardé ici parce que c'est lui qui nomme la
    // cible (tune-server-rust#4649).
    const cibleDeFusion = cibleFusion;
    merging = true;
    mergeResult = null;
    try {
      const result = await api.mergePlaylists({
        playlists,
        target_name: mergeName.trim(),
        deduplicate: mergeDedup,
        target_service: cibleDeFusion,
      });
      mergeResult = result;
      mergeSelected = new Set();
      mergeName = '';
      mergeNameTouched = false;
      // 🔴 La nouvelle playlist n'est pas forcément LOCALE : depuis que la
      // fusion atterrit « au même endroit », elle naît chez le service. On
      // recharge donc la liste de l'endroit où elle est née, sinon elle
      // n'apparaît qu'au prochain passage sur l'écran.
      const ne = (result as any)?.service ?? cibleDeFusion ?? 'local';
      if (ne === 'local') {
        try { localPlaylists = await api.getPlaylists(); } catch {}
      } else {
        try {
          const fraiches = await api.getStreamingPlaylists(ne);
          // 🔴 Qobuz annonce `0 tracks` sur une playlist qu'il vient de
          // créer : sa liste utilisateur n'a pas encore rattrapé l'ajout, et
          // ce zéro-là serait mémorisé deux minutes. Mesuré le 21/09 — la
          // carte disait « 0 tracks » quand le détail en comptait 7.
          //
          // Le compte que NOUS avons versé fait foi : il vient du serveur,
          // qui l'a compté à l'ajout.
          const idNeuve = String((result as any)?.playlist_id ?? '');
          const verses = Number((result as any)?.total_tracks ?? 0);
          streamingPlaylists = {
            ...streamingPlaylists,
            [ne]: idNeuve
              ? fraiches.map((pl) =>
                  String(pl.source_id) === idNeuve ? { ...pl, track_count: verses } : pl,
                )
              : fraiches,
          };
        } catch {}
      }
    } catch (err: any) {
      notifications.error($tr('playlistManager.mergeError').replace('{error}', errText(err) ?? $tr('common.serverUnreachable')));
    }
    merging = false;
  }

  // --- NEW: Playlist Manager v2 tabs ---
  // Plus de 'smart-ai' ici : le générateur de playlists n'a qu'UNE porte, celle
  // de la rangée du haut (`viewTab`). FabienM, fil 1829 point 2 (web#1111) :
  // les deux rangées montaient le MÊME `SmartAIView` sous le MÊME libellé.
  let managerTab = $state<'playlists' | 'transfers' | 'sync' | 'backup' | 'collab'>('playlists');

  // Transfer history
  let transferHistory = $state<any[]>([]);
  let historyLoading = $state(false);

  // Sync links
  let syncLinks = $state<any[]>([]);
  let syncLoading = $state(false);
  let syncing = $state<Set<number>>(new Set());

  // Backup
  let backingUp = $state(false);
  let backupResult = $state<any>(null);
  let snapshots = $state<api.PlaylistSnapshot[]>([]);
  let snapshotsLoading = $state(false);
  let restoringSnapshotId = $state<number | null>(null);
  let restoreMessage = $state('');

  // Batch
  let batchSource = $state('');
  let batchTarget = $state('local');
  let batching = $state(false);
  let batchResult = $state<any>(null);

  // Service capabilities
  let serviceCapabilities = $state<
    Record<string, { authenticated: boolean; supports_write: boolean; supports_delete?: boolean }>
  >({});

  /**
   * Le service sait-il supprimer une playlist chez lui ?
   *
   * 🔴 La réponse vient du SERVEUR (`/playlist-manager/services`), pas d'une
   * liste de noms tenue ici : `delete_playlist` a une implémentation par
   * défaut qui rend 501, et seuls Qobuz et Tidal la redéfinissent. Un bouton
   * posé d'après le nom du service aurait échoué au clic chez les autres.
   * Même règle que le cœur des favoris (#4577).
   */
  function serviceSaitSupprimer(service: string): boolean {
    return serviceCapabilities[service]?.supports_delete === true;
  }

  let suppressionEnCours = $state<string | null>(null);
  let suppressionLot = $state(false);

  /**
   * Supprimer la SÉLECTION, depuis la barre — « à côté de merge ».
   *
   * La barre est le seul endroit que l'on trouve sans chercher : la corbeille
   * par carte ne se révélait qu'au survol, sous le nom. Une seule question
   * pour tout le lot, parce qu'en poser une par playlist ferait cliquer huit
   * fois sur un geste définitif.
   */
  async function supprimerLaSelection() {
    const cles = Array.from(mergeSelected);
    if (cles.length === 0) return;
    // 🔴 Chaque playlist se supprime CHEZ ELLE. Depuis que la sélection peut
    // mélanger les services, prendre « le » service de la sélection enverrait
    // un identifiant Qobuz à Tidal.
    const touches = Array.from(servicesCoches);
    const question = $tr('playlistManager.confirmDeleteSelection' as any)
      .replace('{count}', String(cles.length))
      .replace(
        '{service}',
        touches
          .map((s) => (s === 'local' ? $tr('playlist.local') : serviceName(s)))
          .join(', '),
      );
    if (!(await dialogs.confirm(question, { danger: true }))) return;

    suppressionLot = true;
    const echoues: string[] = [];
    for (const cle of cles) {
      const id = cleIdentifiant(cle);
      const service = cleService(cle);
      try {
        if (service === 'local') {
          await api.deletePlaylist(Number(id));
        } else {
          await api.deleteServicePlaylist(service, id);
        }
      } catch {
        echoues.push(id);
      }
    }
    // On recharge les endroits concernés plutôt que de retirer les cartes une
    // à une : le serveur vient d'oublier ses listes mémorisées.
    for (const service of touches) {
      if (service === 'local') {
        try { localPlaylists = await api.getPlaylists(); } catch {}
      } else {
        try {
          const fraiches = await api.getStreamingPlaylists(service);
          streamingPlaylists = { ...streamingPlaylists, [service]: fraiches };
        } catch {}
      }
    }
    mergeSelected = new Set();
    mergeName = '';
    mergeNameTouched = false;
    suppressionLot = false;
    if (echoues.length > 0) {
      notifications.error(
        $tr('playlistManager.deleteSelectionPartial' as any).replace(
          '{count}',
          String(echoues.length),
        ),
      );
    }
  }

  /**
   * La sélection est-elle supprimable ? Local toujours, un service s'il
   * l'annonce — et TOUS les services touchés doivent l'annoncer, sinon le
   * bouton promettrait ce qu'il ne peut pas tenir sur une partie du lot.
   */
  let selectionSupprimable = $derived(
    mergeSelected.size > 0 &&
      Array.from(servicesCoches).every((s) => s === 'local' || serviceSaitSupprimer(s)),
  );

  /**
   * Supprime une playlist CHEZ le service. Irréversible de notre côté — d'où
   * la confirmation, que la suppression locale n'a jamais eue parce qu'une
   * playlist locale se refait.
   */
  async function supprimerPlaylistDeService(item: DisplayPlaylist) {
    const id = identifiantDe(item);
    if (!id) return;
    const question = $tr('playlistManager.confirmDeleteService' as any)
      .replace('{name}', item.name)
      .replace('{service}', serviceName(item.service));
    if (!(await dialogs.confirm(question, { danger: true }))) return;
    suppressionEnCours = mergeKey(item.service, id);
    try {
      await api.deleteServicePlaylist(item.service, id);
      // La carte disparaît : on retire la playlist de la liste DE SON
      // SERVICE — `streamingPlaylists` est un dictionnaire par service, pas
      // une liste à plat — plutôt que de recharger tout l'écran.
      streamingPlaylists = {
        ...streamingPlaylists,
        [item.service]: (streamingPlaylists[item.service] ?? []).filter(
          (p) => String(p.source_id) !== id,
        ),
      };
      mergeSelected = new Set([...mergeSelected].filter((c) => c !== mergeKey(item.service, id)));
    } catch (err: any) {
      notifications.error(errText(err) ?? $tr('common.serverUnreachable'));
    }
    suppressionEnCours = null;
  }

  // Quick Transfer (standalone transfer from Transfers tab)
  let qtSourceService = $state('');
  let qtSourcePlaylists = $state<(Playlist | StreamingPlaylist)[]>([]);
  let qtSourcePlaylistId = $state('');
  let qtTargetService = $state('local');
  let qtTargetName = $state('');
  let qtLoadingPlaylists = $state(false);
  let qtTransferring = $state(false);
  let qtResult = $state<PlaylistTransferResponse | null>(null);
  let qtFilter = $state<string>('all');
  let qtExpandedAlternatives = $state<Set<number>>(new Set());

  let qtAvailableServices = $derived([
    'local',
    ...authenticatedServices,
  ]);

  let qtTargetServices = $derived(
    qtAvailableServices.filter(s => s !== qtSourceService)
  );

  async function qtLoadSourcePlaylists(service: string) {
    qtSourceService = service;
    qtSourcePlaylistId = '';
    qtSourcePlaylists = [];
    qtResult = null;
    qtTargetName = '';
    if (!service) return;
    qtLoadingPlaylists = true;
    try {
      if (service === 'local') {
        qtSourcePlaylists = localPlaylists;
      } else {
        qtSourcePlaylists = streamingPlaylists[service] ?? [];
        if (qtSourcePlaylists.length === 0) {
          // Try loading from API if not cached
          const pls = await api.getStreamingPlaylists(service);
          qtSourcePlaylists = pls;
        }
      }
    } catch (e) {
      console.error('Load source playlists error:', e);
    }
    qtLoadingPlaylists = false;
  }

  function qtSelectPlaylist(id: string) {
    qtSourcePlaylistId = id;
    // Auto-fill target name from selected playlist
    const pl = qtSourcePlaylists.find(p =>
      ('source_id' in p ? (p as StreamingPlaylist).source_id : String((p as Playlist).id)) === id
    );
    if (pl) {
      qtTargetName = pl.name;
    }
    qtResult = null;
  }

  async function doQuickTransfer() {
    if (!qtSourcePlaylistId || !qtSourceService) return;
    qtTransferring = true;
    qtResult = null;
    qtExpandedAlternatives = new Set();
    try {
      const v2Result = await api.transferPlaylistV2({
        source_service: qtSourceService,
        source_playlist_id: qtSourcePlaylistId,
        target_service: qtTargetService,
        target_name: qtTargetName || undefined,
      });
      qtResult = {
        playlist_id: v2Result.local_playlist_id ?? v2Result.target_playlist_id ?? null,
        playlist_name: v2Result.source_name ?? qtTargetName ?? '',
        total_tracks: v2Result.total_tracks,
        matched: v2Result.matched,
        not_found: v2Result.not_found,
        approximate: v2Result.approximate,
        local_playlist_id: v2Result.local_playlist_id ?? null,
        target_service: v2Result.target_service ?? qtTargetService,
        tracks: (v2Result.tracks ?? []).map((t: any) => ({
          title: t.title,
          artist_name: t.artist_name,
          status: t.status,
          source_id: t.source_id,
          target_id: t.target_id,
          target_title: t.target_title ?? null,
          target_artist: t.target_artist ?? null,
          score: t.score ?? 0,
          match_method: t.match_method ?? '',
          alternatives: t.alternatives ?? [],
        })),
      };
      // Refresh history and playlists
      try { transferHistory = await api.getTransferHistory(); } catch {}
      await loadAll();
      const list = await api.getPlaylists();
      playlistsStore.set(list);
    } catch (e: any) {
      console.error('Quick transfer error:', e);
      notifications.error(e.message || 'Transfer failed');
    }
    qtTransferring = false;
  }

  function qtToggleAlternatives(trackIndex: number) {
    const next = new Set(qtExpandedAlternatives);
    if (next.has(trackIndex)) next.delete(trackIndex); else next.add(trackIndex);
    qtExpandedAlternatives = next;
  }

  function qtPickAlternative(track: TransferTrackResult, alt: TransferAlternative) {
    if (!qtResult) return;
    const prevStatus = track.status;
    track.status = 'matched';
    track.target_id = alt.source_id;
    track.target_title = alt.title;
    track.target_artist = alt.artist_name;
    track.match_method = 'manual';
    track.score = alt.score;
    if (prevStatus === 'not_found') {
      qtResult.matched++;
      qtResult.not_found--;
    } else if (prevStatus === 'approximate') {
      qtResult.matched++;
      qtResult.approximate--;
    }
    qtResult = { ...qtResult, tracks: [...qtResult.tracks] };
  }

  function qtResetTransfer() {
    qtResult = null;
    qtFilter = 'all';
    qtExpandedAlternatives = new Set();
  }

  // Collaborative playlists
  let collabPlaylists = $state<any[]>([]);
  let collabLoading = $state(false);
  let collabSelectedId = $state<number | null>(null);
  let collabTracks = $state<Track[]>([]);
  let collabTracksLoading = $state(false);
  let showCollabCreate = $state(false);
  let newCollabName = $state('');
  let creatingCollab = $state(false);
  let deletingCollab = $state<number | null>(null);

  async function loadCollabPlaylists() {
    collabLoading = true;
    try {
      collabPlaylists = await api.getCollaborativePlaylists();
    } catch { collabPlaylists = []; }
    collabLoading = false;
  }

  async function createCollab() {
    if (!newCollabName.trim()) return;
    creatingCollab = true;
    try {
      await api.createCollaborativePlaylist(newCollabName.trim());
      newCollabName = '';
      showCollabCreate = false;
      await loadCollabPlaylists();
    } catch (err: any) {
      notifications.error($tr('playlistManager.errorGeneric').replace('{error}', errText(err) ?? $tr('common.serverUnreachable')));
    }
    creatingCollab = false;
  }

  async function loadCollabTracks(playlistId: number) {
    collabSelectedId = playlistId;
    collabTracksLoading = true;
    try {
      collabTracks = await api.getCollaborativePlaylistTracks(playlistId);
    } catch { collabTracks = []; }
    collabTracksLoading = false;
  }

  async function deleteCollab(playlistId: number) {
    if (!(await dialogs.confirm($tr('playlistManager.confirmDeleteCollab'), { danger: true }))) return;
    deletingCollab = playlistId;
    try {
      await api.deleteCollaborativePlaylist(playlistId);
      collabPlaylists = collabPlaylists.filter(p => p.id !== playlistId);
      if (collabSelectedId === playlistId) {
        collabSelectedId = null;
        collabTracks = [];
      }
    } catch (err: any) {
      notifications.error($tr('playlistManager.errorGeneric').replace('{error}', errText(err) ?? $tr('common.serverUnreachable')));
    }
    deletingCollab = null;
  }

  async function loadManagerData() {
    if (managerTab === 'transfers') {
      historyLoading = true;
      try { transferHistory = await api.getTransferHistory(); } catch {}
      historyLoading = false;
    } else if (managerTab === 'sync') {
      syncLoading = true;
      try {
        syncLinks = await api.getPlaylistLinks();
        serviceCapabilities = await api.getPlaylistManagerServices();
      } catch {}
      syncLoading = false;
    } else if (managerTab === 'backup') {
      await loadSnapshots();
    } else if (managerTab === 'collab') {
      await loadCollabPlaylists();
    }
  }

  async function loadSnapshots() {
    snapshotsLoading = true;
    try { snapshots = await api.listPlaylistSnapshots(); } catch {}
    snapshotsLoading = false;
  }

  async function restoreSnapshot(snap: api.PlaylistSnapshot) {
    const name = await dialogs.prompt($tr('playlistManager.restorePrompt').replaceAll('{name}', snap.playlist_name), snap.playlist_name);
    if (name === null) return;
    restoringSnapshotId = snap.id;
    restoreMessage = '';
    try {
      const result = await api.restorePlaylistSnapshot(snap.id, {
        target_name: name || undefined,
      });
      restoreMessage = $tr('playlistManager.restoreSuccess')
        .replace('{name}', result.name)
        .replace('{matched}', String(result.tracks_matched))
        .replace('{notFound}', String(result.tracks_not_found));
    } catch (err: any) {
      // If conflict, ask user about overwrite
      if (err?.message?.includes('already exists') || err?.status === 409) {
        if (await dialogs.confirm($tr('playlistManager.confirmOverwrite').replace('{name}', name || snap.playlist_name), { danger: true })) {
          try {
            const result = await api.restorePlaylistSnapshot(snap.id, {
              target_name: name || undefined,
              overwrite_existing: true,
            });
            restoreMessage = $tr('playlistManager.overwriteSuccess')
              .replace('{name}', result.name)
              .replace('{matched}', String(result.tracks_matched))
              .replace('{notFound}', String(result.tracks_not_found));
          } catch (err2: any) {
            restoreMessage = $tr('playlistManager.errorGeneric').replace('{error}', String(err2.message || err2));
          }
        }
      } else {
        restoreMessage = $tr('playlistManager.errorGeneric').replace('{error}', String(err.message || err));
      }
    }
    restoringSnapshotId = null;
  }

  async function deleteSnapshot(snap: api.PlaylistSnapshot) {
    if (!(await dialogs.confirm($tr('playlistManager.confirmDeleteSnapshot').replace('{name}', snap.playlist_name), { danger: true }))) return;
    try {
      await api.deletePlaylistSnapshot(snap.id);
      snapshots = snapshots.filter(s => s.id !== snap.id);
    } catch (err: any) {
      notifications.error($tr('playlistManager.errorGeneric').replace('{error}', errText(err) ?? $tr('common.serverUnreachable')));
    }
  }

  async function triggerSync(linkId: number) {
    syncing = new Set([...syncing, linkId]);
    try {
      await api.triggerPlaylistSync(linkId);
      syncLinks = await api.getPlaylistLinks();
    } catch {}
    syncing.delete(linkId);
    syncing = new Set(syncing);
  }

  async function deleteLink(linkId: number) {
    try {
      await api.deletePlaylistLink(linkId);
      syncLinks = syncLinks.filter(l => l.id !== linkId);
    } catch {}
  }

  async function doBackup() {
    backingUp = true;
    try { backupResult = await api.backupPlaylists(); } catch {}
    backingUp = false;
    await loadSnapshots();
  }

  async function doBatchTransfer() {
    if (!batchSource) return;
    batching = true;
    try { batchResult = await api.batchTransfer({ source_service: batchSource, target_service: batchTarget }); } catch {}
    batching = false;
  }

  // Available filter chips
  let authenticatedServices = $derived(
    Object.entries($streamingServices)
      .filter(([, status]) => status.authenticated)
      .map(([name]) => name)
  );

  let filterChips = $derived([
    'all',
    'local',
    ...authenticatedServices,
  ]);

  async function loadAll() {
    // 🔴 Les capacités des services étaient chargées UNIQUEMENT à l'ouverture
    // de l'onglet Sync. Sur l'onglet Playlists, `serviceCapabilities` restait
    // `{}`, donc `serviceSaitSupprimer()` rendait toujours `false` et la
    // corbeille n'apparaissait sur AUCUNE carte. Bertrand : « Où se trouve le
    // bouton pour delete une playlist ? » — nulle part, en réalité.
    api
      .getPlaylistManagerServices()
      .then((c) => (serviceCapabilities = c))
      .catch(() => {});
    loading = true;
    loadedCount = 0;
    loadingStatus = $tr('playlistManager.loadingLocal');
    try {
      // Load local playlists first (fast)
      const localData = await api.getPlaylists();
      localPlaylists = localData;
      loadedCount = localData.length;
      loadingStatus = $tr('playlistManager.localPlaylistsCount').replace('{count}', String(loadedCount));

      // Playlist demandee depuis un autre ecran (favori de playlist, #2442) :
      // on l'ouvre directement au lieu de rendre la liste. Consommee une seule
      // fois — un retour arriere doit montrer la liste, pas rouvrir la fiche.
      const attendue = get(pendingPlaylistId);
      if (attendue != null) {
        pendingPlaylistId.set(null);
        const pl = localData.find((p) => p.id === attendue);
        if (pl) await selectLocal(pl);
      }

      // Load streaming services in parallel
      const services = await api.getStreamingServices();
      const serviceNames = Object.keys(services).filter(s => services[s].authenticated);

      for (const svc of serviceNames) {
        loadingStatus = $tr('playlistManager.loadingService').replace('{service}', svc);
        try {
          const playlists = await api.getStreamingPlaylists(svc);
          streamingPlaylists = { ...streamingPlaylists, [svc]: playlists };
          loadedCount += playlists.length;
          loadingStatus = $tr('playlistManager.playlistsCountService')
            .replace('{count}', String(loadedCount))
            .replace('{service}', svc)
            .replace('{n}', String(playlists.length));
        } catch (e) {
          console.error(`Load ${svc} playlists error:`, e);
        }
      }
      loadingStatus = $tr('playlistManager.playlistsLoaded').replace('{count}', String(loadedCount));
    } catch (e) {
      console.error('Load playlists error:', e);
    }
    loading = false;
  }

  // Load on mount
  loadAll();

  function serviceName(s: string): string {
    const labels: Record<string, string> = {
      tidal: 'TIDAL',
      qobuz: 'Qobuz',
      youtube: 'YouTube',
      amazon: 'Amazon',
      spotify: 'Spotify',
      deezer: 'Deezer',
    };
    return labels[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
  }

  function serviceColor(s: string): string {
    const colors: Record<string, string> = {
      tidal: '#00FFFF',
      qobuz: '#4285F4',
      spotify: '#1DB954',
      deezer: '#FF0092',
      youtube: '#FF0000',
      amazon: '#FF9900',
      local: 'var(--tune-accent)',
    };
    return colors[s] ?? 'var(--tune-text-muted)';
  }

  let filteredLocal = $derived(
    searchQuery.trim()
      ? localPlaylists.filter((pl) => pl.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
      : localPlaylists
  );

  let filteredStreaming = $derived(
    Object.fromEntries(
      Object.entries(streamingPlaylists).map(([svc, pls]) => [
        svc,
        searchQuery.trim()
          ? pls.filter((pl) => pl.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
          : pls,
      ])
    )
  );

  // Combine all playlists for the unified list based on activeFilter
  interface DisplayPlaylist {
    type: 'local' | 'streaming';
    local?: Playlist;
    streaming?: StreamingPlaylist;
    service: string;
    name: string;
    trackCount: number;
    coverPath?: string | null;
  }

  let displayPlaylists = $derived.by(() => {
    const items: DisplayPlaylist[] = [];

    if (activeFilter === 'all' || activeFilter === 'local') {
      for (const pl of filteredLocal) {
        items.push({
          type: 'local',
          local: pl,
          service: 'local',
          name: pl.name,
          trackCount: pl.track_count ?? 0,
          coverPath: null,
        });
      }
    }

    for (const [svc, pls] of Object.entries(filteredStreaming)) {
      if (activeFilter !== 'all' && activeFilter !== svc) continue;
      for (const pl of pls) {
        items.push({
          type: 'streaming',
          streaming: pl,
          service: svc,
          name: pl.name,
          trackCount: pl.track_count,
          coverPath: pl.cover_path,
        });
      }
    }

    return items;
  });

  /**
   * LES MOSAÏQUES — « Et les 4 covers sur la cover de la playlist !! »
   * (Bertrand, 21/09).
   *
   * Une playlist tout juste fusionnée n'a pas de pochette : Tidal et Qobuz
   * fabriquent la leur de leur côté, plus tard. Et une playlist LOCALE n'en a
   * jamais — le serveur ne rend que `id, name, track_count`. Le gestionnaire
   * posait alors une note de musique, là où l'écran Playlists (`PlaylistsV2`)
   * compose depuis le 01/09 une mosaïque 2×2 : la règle de Bertrand, « divise
   * en 4 pour montrer que c'est un assemblage ».
   *
   * Même composant, même dédoublonnage (`quatreDistinctes`), et seulement
   * pour les cartes SANS pochette : une playlist de service qui a déjà la
   * sienne la garde — c'est celle que le service montre partout ailleurs.
   *
   * ⚠️ Une requête par carte sans pochette. Elles partent APRÈS l'affichage,
   * ne bloquent rien, et un échec ne coûte que sa propre vignette.
   */
  let mosaiques = $state<Record<string, string[]>>({});
  const mosaiquesDemandees = new Set<string>();

  async function chargerMosaique(item: DisplayPlaylist): Promise<void> {
    const id = identifiantDe(item);
    if (!id) return;
    const cle = mergeKey(item.service, id);
    try {
      const pistes =
        item.service === 'local'
          ? await api.getPlaylistTracks(Number(id))
          : await api.getStreamingPlaylistTracks(item.service, id);
      const vues = quatreDistinctes(
        (pistes ?? []).map((t: any) => ({
          cover_path: t?.cover_path ?? null,
          title: t?.album_title ?? null,
        })),
      );
      if (vues.length) mosaiques = { ...mosaiques, [cle]: vues };
    } catch {
      // Sa vignette garde la note de musique ; les autres ne sont pas touchées.
    }
  }

  $effect(() => {
    for (const item of displayPlaylists) {
      if (item.coverPath) continue;
      const cle = mergeKey(item.service, identifiantDe(item));
      // Une seule demande par carte : l'effet repasse à chaque changement de
      // la liste, et redemander à chaque passage ferait une boucle réseau.
      if (mosaiquesDemandees.has(cle)) continue;
      mosaiquesDemandees.add(cle);
      void chargerMosaique(item);
    }
  });

  /**
   * Proposer le nom dès la deuxième carte cochée.
   *
   * Posé ICI, après `displayPlaylists` dont il lit les noms. Il ne réécrit
   * jamais une saisie : `mergeNameTouched` le tient, et le champ vidé à la
   * main reste vide — l'indication sous la barre dit alors pourquoi le bouton
   * est gris.
   */
  $effect(() => {
    if (mergeNameTouched) return;
    if (mergeSelected.size < 2) return;
    const propose = nomDeFusionPropose();
    if (propose && propose !== mergeName) mergeName = propose;
  });

  async function selectLocal(pl: Playlist) {
    if (!pl.id) return;
    selectedPlaylist = pl;
    selectedStreamingPl = null;
    selectedService = 'local';
    detailLoading = true;
    try {
      detailTracks = await api.getPlaylistTracks(pl.id);
    } catch (e) {
      console.error('Load playlist tracks error:', e);
    }
    detailLoading = false;
  }

  async function selectStreaming(service: string, pl: StreamingPlaylist) {
    selectedStreamingPl = pl;
    selectedPlaylist = null;
    selectedService = service;
    detailLoading = true;
    try {
      detailTracks = await api.getStreamingPlaylistTracks(service, pl.source_id);
    } catch (e) {
      console.error('Load streaming playlist tracks error:', e);
    }
    detailLoading = false;
  }

  function selectItem(item: DisplayPlaylist) {
    if (item.type === 'local' && item.local) {
      selectLocal(item.local);
    } else if (item.type === 'streaming' && item.streaming) {
      selectStreaming(item.service, item.streaming);
    }
  }

  function goBack() {
    selectedPlaylist = null;
    selectedStreamingPl = null;
    detailTracks = [];
    selectedService = '';
  }

  // Import flow
  function openImport(service: string, pl: StreamingPlaylist) {
    importTarget = { service, playlist: pl };
    importName = pl.name;
    importResult = null;
  }

  function closeImport() {
    importTarget = null;
    importing = false;
    importResult = null;
  }

  async function doImport() {
    if (!importTarget) return;
    importing = true;
    try {
      // L'import passe par le transfert vers « local » : POST /playlists/import
      // n'existe pas côté serveur (405 — collision avec /playlists/:id), le
      // bouton échouait toujours. La voie transfert matche contre la
      // bibliothèque et ne crée PAS de playlist si aucune piste n'est trouvée
      // (fini les copies vides « (transferred) » à 0 piste).
      const result = await api.transferPlaylistV2({
        source_service: importTarget.service,
        source_playlist_id: importTarget.playlist.source_id,
        target_service: 'local',
        target_name: importName || undefined,
      });
      importResult = {
        name: result.target_playlist_name ?? importName,
        count: result.matched ?? 0,
        total: result.total_tracks ?? importTarget.playlist.track_count,
      };
      // Refresh playlists
      await loadAll();
      // Also refresh the global playlist store
      const list = await api.getPlaylists();
      playlistsStore.set(list);
    } catch (e) {
      console.error('Import playlist error:', e);
      importResult = { name: importName, count: -1, total: 0 };
    }
    importing = false;
  }

  // Playback
  async function playPlaylist(playlistId: number) {
    if (!zone?.id) return;
    try {
      await playAndSync(zone.id, { playlist_id: playlistId });
    } catch (e) {
      console.error('Play playlist error:', e);
    }
  }

  async function playStreamingPlaylist(pl: StreamingPlaylist, startIndex?: number) {
    if (!zone?.id) return;
    const source = pl.source || selectedService;
    if (!source) return;
    try {
      await playAndSync(zone.id, { source: source as any, streaming_playlist_id: pl.source_id, start_index: startIndex });
    } catch (e) {
      console.error('Play streaming playlist error:', e);
    }
  }

  // « Lire à partir d'ici » : the server resolves the whole playlist (local or
  // streaming) and starts at the given index, so mixed/streaming entries keep
  // working — no client-side track_ids filtering.
  async function playFromIndex(index: number) {
    if (!zone?.id) return;
    try {
      if (selectedStreamingPl) {
        await playStreamingPlaylist(selectedStreamingPl, index);
      } else if (selectedPlaylist?.id != null) {
        await playAndSync(zone.id, { playlist_id: selectedPlaylist.id, start_index: index });
      }
    } catch (e) {
      console.error('Play from here error:', e);
    }
  }

  async function addTrackToQueue(t: Track) {
    if (!zone?.id) return;
    try {
      const source = t.source || selectedService;
      if (source && source !== 'local' && t.source_id) {
        await api.addToQueue(zone.id, {
          source: source as any,
          source_id: t.source_id,
          title: t.title || undefined,
          artist_name: t.artist_name || undefined,
          album_title: t.album_title || undefined,
          cover_path: t.cover_path || undefined,
          duration_ms: t.duration_ms || undefined,
        });
      } else if (t.id) {
        await api.addToQueue(zone.id, { track_id: t.id });
      }
    } catch (e) {
      console.error('Add to queue error:', e);
    }
  }

  // CRUD
  async function createPlaylist() {
    if (!newName.trim()) return;
    try {
      await api.createPlaylist(newName.trim(), newDescription.trim() || undefined);
      showCreate = false;
      newName = '';
      newDescription = '';
      await loadAll();
      const list = await api.getPlaylists();
      playlistsStore.set(list);
    } catch (e) {
      console.error('Create playlist error:', e);
    }
  }

  async function deletePlaylist(id: number) {
    try {
      await api.deletePlaylist(id);
      if (selectedPlaylist?.id === id) goBack();
      await loadAll();
      const list = await api.getPlaylists();
      playlistsStore.set(list);
    } catch (e) {
      console.error('Delete playlist error:', e);
    }
  }

  async function removeTrack(position: number) {
    if (!selectedPlaylist?.id || position < 0) return;
    try {
      await api.removePlaylistTrackAt(selectedPlaylist.id, position);
      detailTracks = detailTracks.filter((_, i) => i !== position);
    } catch (e) {
      console.error('Remove track error:', e);
    }
  }

  // Reorder a local playlist by moving the dragged row to the drop position.
  // Optimistic: reorder locally, then persist the full new order (track ids).
  // On failure, reload from the server so the UI never lies.
  async function reorderTracks(targetIndex: number) {
    const from = dragIndex;
    dragIndex = null;
    dragOverIndex = null;
    if (from === null || from === targetIndex || !selectedPlaylist?.id) return;
    const next = [...detailTracks];
    const [moved] = next.splice(from, 1);
    next.splice(targetIndex, 0, moved);
    detailTracks = next;
    const trackIds = next.map((t) => t.id).filter((id): id is number => typeof id === 'number');
    try {
      await api.reorderPlaylistTracks(selectedPlaylist.id, trackIds);
    } catch (e) {
      console.error('Reorder playlist error:', e);
      try {
        detailTracks = await api.getPlaylistTracks(selectedPlaylist.id);
      } catch {}
    }
  }

  // Transfer flow
  function openTransfer() {
    const currentName = selectedPlaylist?.name ?? selectedStreamingPl?.name ?? '';
    transferName = currentName;
    transferTargetService = 'local';
    transferResult = null;
    transferring = false;
    showTransfer = true;
  }

  function closeTransfer() {
    showTransfer = false;
    transferResult = null;
    transferring = false;
    transferFilter = 'all';
    expandedAlternatives = new Set();
    confirmingTransfer = false;
  }

  function toggleAlternatives(trackIndex: number) {
    const next = new Set(expandedAlternatives);
    if (next.has(trackIndex)) next.delete(trackIndex); else next.add(trackIndex);
    expandedAlternatives = next;
  }

  function pickAlternative(track: TransferTrackResult, alt: TransferAlternative) {
    if (!transferResult) return;
    const prevStatus = track.status;
    track.status = 'matched';
    track.target_id = alt.source_id;
    track.target_title = alt.title;
    track.target_artist = alt.artist_name;
    track.match_method = 'manual';
    track.score = alt.score;
    if (prevStatus === 'not_found') {
      transferResult.matched++;
      transferResult.not_found--;
    } else if (prevStatus === 'approximate') {
      transferResult.matched++;
      transferResult.approximate--;
    }
    // Force reactivity by reassigning
    transferResult = { ...transferResult, tracks: [...transferResult.tracks] };
  }

  async function confirmManualChoices() {
    if (!transferResult) return;
    confirmingTransfer = true;
    try {
      const manualTracks = transferResult.tracks.filter(t => t.match_method === 'manual');
      if (manualTracks.length === 0) return;

      const localPlId = transferResult.local_playlist_id;
      if (localPlId && typeof localPlId === 'number') {
        // Add manually resolved tracks to the existing local playlist
        const trackIds = manualTracks
          .map(t => parseInt(t.target_id || '', 10))
          .filter(id => !isNaN(id) && id > 0);
        if (trackIds.length > 0) {
          await api.addPlaylistTracks(localPlId, trackIds);
        }
      } else {
        // Re-run transfer with create_on_target using V2 API
        const allMatchedIds = transferResult.tracks
          .filter(t => t.status === 'matched' && t.target_id)
          .map(t => t.target_id!);
        // Use V2 transfer with create_on_target
        const sourceId = selectedPlaylist?.id?.toString() ?? selectedStreamingPl?.source_id;
        if (sourceId && transferTargetService !== 'local') {
          await api.transferPlaylistV2({
            source_service: selectedService,
            source_playlist_id: sourceId,
            target_service: transferTargetService,
            target_name: transferName || undefined,
            create_on_target: true,
          });
        }
      }
      notifications.success($tr('playlistManager.tracksAdded').replace('{count}', String(manualTracks.length)));
      // Mark manual tracks as confirmed (remove manual flag to avoid re-confirm)
      for (const t of manualTracks) {
        t.match_method = 'confirmed';
      }
      transferResult = { ...transferResult, tracks: [...transferResult.tracks] };
      await loadAll();
      const list = await api.getPlaylists();
      playlistsStore.set(list);
    } catch (e: any) {
      console.error('Confirm manual choices error:', e);
      notifications.error($tr('playlistManager.errorGeneric').replace('{error}', String(e.message || e)));
    }
    confirmingTransfer = false;
  }

  let transferServices = $derived([
    'local',
    ...authenticatedServices.filter((s) => s !== selectedService),
  ]);

  async function doTransfer() {
    const sourceId = selectedPlaylist?.id?.toString() ?? selectedStreamingPl?.source_id;
    if (!sourceId) return;
    transferring = true;
    expandedAlternatives = new Set();
    try {
      const v2Result = await api.transferPlaylistV2({
        source_service: selectedService,
        source_playlist_id: sourceId,
        target_service: transferTargetService,
        target_name: transferName || undefined,
      });
      // Map V2 response to our PlaylistTransferResponse shape
      transferResult = {
        playlist_id: v2Result.local_playlist_id ?? v2Result.target_playlist_id ?? null,
        playlist_name: v2Result.source_name ?? transferName ?? '',
        total_tracks: v2Result.total_tracks,
        matched: v2Result.matched,
        not_found: v2Result.not_found,
        approximate: v2Result.approximate,
        local_playlist_id: v2Result.local_playlist_id ?? null,
        target_service: v2Result.target_service ?? transferTargetService,
        tracks: (v2Result.tracks ?? []).map((t: any) => ({
          title: t.title,
          artist_name: t.artist_name,
          status: t.status,
          source_id: t.source_id,
          target_id: t.target_id,
          target_title: t.target_title ?? null,
          target_artist: t.target_artist ?? null,
          score: t.score ?? 0,
          match_method: t.match_method ?? '',
          alternatives: t.alternatives ?? [],
        })),
      };
      await loadAll();
      const list = await api.getPlaylists();
      playlistsStore.set(list);
    } catch (e) {
      console.error('Transfer playlist error:', e);
    }
    transferring = false;
  }

  // Diff flow
  function openDiff() {
    diffResult = null;
    diffing = false;
    diffTargetService = '';
    diffTargetPlaylistId = '';
    diffTargetPlaylists = [];
    showDiff = true;
  }

  function closeDiff() {
    showDiff = false;
    diffResult = null;
    diffing = false;
  }

  let diffServices = $derived([
    'local',
    ...authenticatedServices,
    'collection',
  ]);

  async function loadDiffPlaylists(service: string) {
    diffTargetService = service;
    diffTargetPlaylistId = '';
    diffLoadingPlaylists = true;
    try {
      // Compare targets: local playlists, streaming playlists, or manual
      // collections (Elie). Collections are fetched on demand.
      const list = service === 'local'
        ? localPlaylists
        : service === 'collection'
          ? await api.getCollections()
          : (streamingPlaylists[service] ?? []);
      // Sort the comparison list alphabetically by name (Elie).
      diffTargetPlaylists = [...list].sort((a: any, b: any) =>
        (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }),
      );
    } catch (e) {
      console.error('Load diff playlists error:', e);
    }
    diffLoadingPlaylists = false;
  }

  async function doDiff() {
    const sourceId = selectedPlaylist?.id?.toString() ?? selectedStreamingPl?.source_id;
    if (!sourceId || !diffTargetPlaylistId || !diffTargetService) return;
    diffing = true;
    try {
      diffResult = await api.diffPlaylists(
        selectedService,
        sourceId,
        diffTargetService,
        diffTargetPlaylistId,
      );
    } catch (e) {
      console.error('Diff playlists error:', e);
    }
    diffing = false;
  }

  // Recover flow
  function openRecover() {
    recoverResult = null;
    recoverMsg = null;
    recovering = false;
    applyingRecovery = new Set();
    applyingAll = false;
    showRecover = true;
    doRecover();
  }

  function closeRecover() {
    showRecover = false;
    recoverResult = null;
    recoverMsg = null;
    recovering = false;
  }

  async function doRecover() {
    if (!selectedPlaylist?.id) return;
    recovering = true;
    try {
      recoverResult = await api.recoverPlaylist(selectedPlaylist.id);
    } catch (e) {
      console.error('Recover playlist error:', e);
    }
    recovering = false;
  }

  /**
   * 🔴 #1076 — on lit ce que le SERVEUR a fait, on ne le devine plus.
   *
   * L'ancienne version passait la piste à « disponible » juste après l'appel,
   * sans regarder la réponse. Or le serveur refuse nommément dans trois cas
   * (piste de remplacement absente de la base, piste de SERVICE proposée en
   * remplacement, ligne disparue de la playlist entre la lecture et
   * l'écriture) — et l'écran affichait « disponible » dans les trois.
   *
   * `applyRecovery` accepte désormais le `422` : « rien n'a pu être appliqué »
   * est un refus DOCUMENTÉ, pas une panne. Voir `lib/recuperationPlaylist`.
   */
  async function applyOneRecovery(trackId: number, alt: { service: string; source_id: string }) {
    if (!selectedPlaylist?.id) return;
    applyingRecovery = new Set([...applyingRecovery, trackId]);
    recoverMsg = null;
    try {
      const res = await api.applyRecovery(selectedPlaylist.id, [
        { track_id: trackId, new_source: alt.service, new_source_id: alt.source_id },
      ]);
      recoverMsg = resumeApplication(res, (c) => $tr(c as any));
      // « Disponible » SEULEMENT si le serveur l'a écrit.
      if (recoverResult && pisteAppliquee(res, trackId)) {
        recoverResult = {
          ...recoverResult,
          tracks: recoverResult.tracks.map((t) =>
            t.track_id === trackId ? { ...t, status: 'available' as const, alternatives: [] } : t
          ),
          recovered: recoverResult.recovered - 1,
          available: recoverResult.available + 1,
        };
      }
      // Refresh detail tracks
      detailTracks = await api.getPlaylistTracks(selectedPlaylist.id);
    } catch (e: any) {
      // Il reste les vraies pannes — un 500 qui nomme ce qui a déjà été écrit.
      recoverMsg = typeof e?.message === 'string' && e.message.trim()
        ? e.message.trim()
        : $tr('playlist.recoverFailed' as any);
    }
    applyingRecovery = new Set([...applyingRecovery].filter((id) => id !== trackId));
  }

  async function applyAllRecovery() {
    if (!selectedPlaylist?.id || !recoverResult) return;
    const replacements = recoverResult.tracks
      .filter((t) => t.status === 'recovered' && t.alternatives.length > 0)
      .map((t) => ({
        track_id: t.track_id,
        new_source: t.alternatives[0].service,
        new_source_id: t.alternatives[0].source_id,
      }));
    if (replacements.length === 0) return;
    applyingAll = true;
    recoverMsg = null;
    try {
      // #1076 : même règle en masse — le compte rendu dit combien sont passées
      // et pourquoi les autres ont été refusées. `doRecover()` relit ensuite
      // l'état RÉEL de la playlist, ce qui rend toute réécriture optimiste
      // inutile ici.
      const res = await api.applyRecovery(selectedPlaylist.id, replacements);
      recoverMsg = resumeApplication(res, (c) => $tr(c as any));
      // Re-run recovery to refresh
      await doRecover();
      // Refresh detail tracks
      detailTracks = await api.getPlaylistTracks(selectedPlaylist.id);
    } catch (e: any) {
      recoverMsg = typeof e?.message === 'string' && e.message.trim()
        ? e.message.trim()
        : $tr('playlist.recoverFailed' as any);
    }
    applyingAll = false;
  }
</script>

<!--
  UNE seule racine, en COLONNE. Fabien, fil 1780 (16/09/2026), point 4 :
  « Menu Playlists : mauvaise mise en page, le top menu est à gauche centré
  verticalement ». Cette vue rendait deux racines — `.view-tabs` puis
  `.pm-view` — et la coquille v2 pose ses vues dans `.main`, un flex en LIGNE
  dont chaque enfant prend `flex:1` : les onglets faisaient une colonne à
  gauche, le contenu une colonne à droite. Les autres vues héritées n'ont
  qu'une racine ; celle-ci en a une désormais.
-->
<div class="pm-racine">
<div class="view-tabs">
  <button class="view-tab" class:active={viewTab === 'manual'} onclick={() => viewTab = 'manual'}>
    Playlists
  </button>
  <button class="view-tab" class:active={viewTab === 'smart'} onclick={() => viewTab = 'smart'}>
    {$tr('smartPlaylists.title')}
  </button>
  <button class="view-tab" class:active={viewTab === 'smart-ai'} onclick={() => viewTab = 'smart-ai'}>
    {$tr('smartai.title')}
  </button>
  <!-- L'onglet « Playlists Hub » a disparu (Bertrand, 21/09/2026). C'était un
       POC de la v0.7.30 dont trois des quatre sous-onglets — Transferts,
       Liens auto-sync, Snapshots — faisaient doublon avec ceux de ce
       gestionnaire. Le transfert devient un greffon premium,
       « Playlists converter ». -->
</div>

{#if viewTab === 'smart'}
  <SmartPlaylistsView />
{:else if viewTab === 'smart-ai'}
  <SmartAIView />
{:else}
<div class="pm-view">
  {#if selectedPlaylist || selectedStreamingPl}
    <!-- Detail View -->
    <div class="detail-header">
      <button class="back-btn" onclick={goBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
        {$tr('common.back')}
      </button>
      <div class="playlist-detail-info">
        {#if selectedService && selectedService !== 'local'}
          <span class="source-chip" style="color: {serviceColor(selectedService)}">{serviceName(selectedService)}</span>
        {/if}
        <div class="playlist-title-row">
          <h2>{selectedPlaylist?.name ?? selectedStreamingPl?.name}</h2>
          <!-- Mettre la PLAYLIST elle-meme en favori, pas seulement ses pistes
               (#2442, FabienM fil 1557). Playlists LOCALES uniquement : une
               playlist de streaming n'a pas d'id entier, elle releve du magasin
               des favoris de streaming. -->
          {#if selectedPlaylist?.id != null}
            <HeartButton playlistId={selectedPlaylist.id} size={20} />
          {/if}
        </div>
        {#if selectedPlaylist?.description}
          <ClampedText lines={3} resetKey={selectedPlaylist.description}>
            <p class="playlist-desc">{selectedPlaylist.description}</p>
          </ClampedText>
        {/if}
        <span class="playlist-count">{detailTracks.length} {$tr('common.tracks')}</span>
      </div>
      <div class="detail-actions">
        {#if selectedStreamingPl}
          <button class="import-btn" onclick={() => openImport(selectedService, selectedStreamingPl!)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            {$tr('playlist.import')}
          </button>
        {/if}
        {#if selectedPlaylist}
          <button class="recover-btn" onclick={openRecover}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
            {$tr('playlist.recover')}
          </button>
        {/if}
        <button class="transfer-btn" onclick={openTransfer}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg>
          {$tr('playlist.transfer')}
        </button>
        <button class="compare-btn" onclick={openDiff}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
          {$tr('playlist.compare')}
        </button>
        <button class="play-all-btn" onclick={() => {
          if (selectedPlaylist?.id) playPlaylist(selectedPlaylist.id);
          else if (selectedStreamingPl) playStreamingPlaylist(selectedStreamingPl);
        }}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z" /></svg>
          {$tr('common.play')}
        </button>
      </div>
    </div>

    {#if selectedStreamingPl?.cover_path}
      <div class="streaming-pl-cover">
        <AlbumArt coverPath={selectedStreamingPl.cover_path} size={200} alt={selectedStreamingPl.name} />
      </div>
    {/if}

    {#if detailLoading}
      <div class="loading"><div class="spinner"></div><span>{loadingStatus || $tr('common.loading')}</span></div>
    {:else}
      <div class="track-list">
        {#each detailTracks as t, index}
          <!--
            Une piste que le SERVICE dit indisponible est grisée, étiquetée, et
            ne se lance pas : la lancer rendrait « no url ». Demandé par
            Bertrand le 21/09/2026 sur « tttroys playlist » — 186 de ses 1 454
            pistes sont dans ce cas, dont la PREMIÈRE, qui s'affichait comme
            les autres.

            🔴 Le mécanisme existait déjà (`pisteIndisponible`, point 10 du
            17/09) dans `ListePistesV2` et `LignePisteV2` — mais cet écran-ci a
            sa propre liste de pistes et n'en profitait pas. Troisième liste,
            troisième oubli : c'est le prix d'avoir trois rendus de piste.
          -->
          {@const indispo = pisteIndisponible(t)}
          <div
            class="track-item"
            class:indispo
            class:playing={estLaPisteEnLecture(t, $currentTrackId, $currentTrack)}
            aria-current={estLaPisteEnLecture(t, $currentTrackId, $currentTrack) ? 'true' : undefined}
            class:drag-over={dragOverIndex === index}
            class:dragging={dragIndex === index}
            draggable={!!selectedPlaylist}
            ondragstart={() => (dragIndex = index)}
            ondragover={(e) => { if (selectedPlaylist) { e.preventDefault(); dragOverIndex = index; } }}
            ondragleave={() => { if (dragOverIndex === index) dragOverIndex = null; }}
            ondrop={(e) => { e.preventDefault(); reorderTracks(index); }}
            ondragend={() => { dragIndex = null; dragOverIndex = null; }}
          >
            <!-- Clic de ligne = toute la playlist en file à partir de cette piste,
                 sinon la file ne contient qu'une piste et rien ne s'enchaîne
                 (« l'enchaînement ne marche pas », Bertrand, Qobuz sur .18). -->
            <button class="track-play" onclick={() => { if (!indispo) playFromIndex(index); }} disabled={indispo}>
              <span class="track-num"><span class="num-text">{index + 1}</span><span class="num-play">&#9654;</span></span>
              <span class="track-thumb">
                <AlbumArt coverPath={t.cover_path} albumId={t.album_id} size={36} alt={t.album_title ?? t.title ?? ''} />
              </span>
              <div class="track-info">
                <span class="track-title truncate" use:bulleTexte>{t.title}</span>
                {#if t.artist_name}
                  <span class="track-artist truncate" use:bulleTexte>{t.artist_name}</span>
                {/if}
              </div>
              {#if indispo}<span class="track-indispo">{$tr('playlist.unavailable')}</span>{/if}
              {#if t.format}<span class="audio-format">{formatAudioBadge(t)}</span>{/if}
              <span class="track-duration">{formatTime(t.duration_ms)}</span>
            </button>
            <button class="play-from-here-btn" onclick={(e) => { e.stopPropagation(); playFromIndex(index); }} title={$tr('common.playFromHere')} aria-label={$tr('common.playFromHere')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="3" y1="6" x2="14" y2="6"/><line x1="3" y1="12" x2="14" y2="12"/><line x1="3" y1="18" x2="10" y2="18"/><path d="M16 8v8l6-4z" fill="currentColor" stroke="none"/></svg>
            </button>
            <button class="add-queue-btn" onclick={() => addTrackToQueue(t)} title={$tr('queue.addToQueue')}>+</button>
            <span class="track-heart" onclick={(e) => e.stopPropagation()}>
              {#if (t.source ?? selectedStreamingPl?.source) && (t.source ?? selectedStreamingPl?.source) !== 'local' && t.source_id}
                <HeartButton
                  streaming={{
                    itemType: 'track',
                    service: (t.source ?? selectedStreamingPl?.source)!,
                    serviceId: String(t.source_id),
                    title: t.title,
                    artist: t.artist_name ?? undefined,
                    album: t.album_title ?? undefined,
                    coverUrl: (t as any).cover_url ?? undefined,
                  }}
                  size={15}
                />
              {:else if t.id}
                <HeartButton trackId={t.id} size={15} />
              {/if}
            </span>
            {#if onAddToPlaylist && (t.id || t.source_id)}
              <button class="add-playlist-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(t); }} title={$tr('nowplaying.addToPlaylist')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 12H3m13 0h-2m0 0V8m0 4v4m6-8v8a2 2 0 01-2 2H5" /><line x1="3" y1="16" x2="11" y2="16" /><line x1="3" y1="8" x2="8" y2="8" /></svg>
              </button>
            {/if}
            {#if selectedPlaylist}
              <button class="remove-btn" onclick={() => removeTrack(index)} title={$tr('playlist.remove')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

  {:else}
    <!-- List View -->
    <div class="pm-header">
      <h2>{$tr('playlist.manager')}</h2>
      <div class="pm-tabs">
        <button class="pm-tab" class:active={managerTab === 'playlists'} onclick={() => managerTab = 'playlists'}>{$tr('playlistManager.tabPlaylists')}</button>
        <button class="pm-tab" class:active={managerTab === 'transfers'} onclick={() => { managerTab = 'transfers'; loadManagerData(); }}>{$tr('playlistManager.tabTransfers')}</button>
        <button class="pm-tab" class:active={managerTab === 'sync'} onclick={() => { managerTab = 'sync'; loadManagerData(); }}>{$tr('playlistManager.tabSync')}</button>
        <button class="pm-tab" class:active={managerTab === 'backup'} onclick={() => managerTab = 'backup'}>{$tr('playlistManager.tabBackup')}</button>
        <button class="pm-tab" class:active={managerTab === 'collab'} onclick={() => { managerTab = 'collab'; loadManagerData(); }}>{$tr('playlistManager.tabCollab')}</button>
      </div>
      <div class="pm-header-right">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" placeholder={$tr('playlist.searchPlaceholder')} bind:value={searchQuery} />
          {#if searchQuery}
            <button class="search-clear" onclick={() => searchQuery = ''}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          {/if}
        </div>
        <!--
          Le bouton vit dans l'en-tête COMMUN aux onglets du gestionnaire, mais
          le formulaire qu'il ouvre n'est rendu que dans la branche de l'onglet
          Playlists : hors de cet onglet, le clic ne peignait rien. FabienM,
          fil 1829 point 3 (web#1112). On ramène donc l'onglet Playlists avec
          le formulaire, comme le testeur le demande — plutôt que de faire
          disparaître le bouton, qui aurait rendu l'en-tête mouvant.
        -->
        <button class="create-btn" onclick={() => { managerTab = 'playlists'; showCreate = true; }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          {$tr('playlist.new')}
        </button>
      </div>
    </div>

    {#if managerTab === 'transfers'}
      {#if $isPremium}
        <!-- Transfer Tab: Quick Transfer + History -->
        <div class="pm-tab-content">
          <!-- Quick Transfer Section -->
          <div class="qt-section">
            <h3>{$tr('playlist.transfer')}</h3>
            <p class="qt-hint">{$tr('playlistManager.transferHint')}</p>

            {#if qtResult}
              <!-- Transfer result -->
              <div class="qt-result">
                <div class="qt-result-header">
                  <h4>"{qtResult.playlist_name}" — {$tr('playlist.transferComplete')}</h4>
                  <button class="btn-action btn-sm-action" onclick={qtResetTransfer}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
                    {$tr('playlistManager.newTransfer')}
                  </button>
                </div>
                <div class="transfer-summary">
                  <button class="summary-stat matched" class:active={qtFilter === 'matched'} onclick={() => qtFilter = qtFilter === 'matched' ? 'all' : 'matched'}>{qtResult.matched} {$tr('playlist.matched')}</button>
                  <button class="summary-stat approximate" class:active={qtFilter === 'approximate'} onclick={() => qtFilter = qtFilter === 'approximate' ? 'all' : 'approximate'}>{qtResult.approximate} {$tr('playlist.approximate')}</button>
                  <button class="summary-stat not-found" class:active={qtFilter === 'not_found'} onclick={() => qtFilter = qtFilter === 'not_found' ? 'all' : 'not_found'}>{qtResult.not_found} {$tr('playlist.notFound')}</button>
                </div>
                {#if qtResult.tracks.length > 0}
                  <div class="transfer-tracks qt-tracks">
                    {#each qtResult.tracks.filter(t => qtFilter === 'all' || t.status === qtFilter) as track, i}
                      {@const trackIndex = qtResult.tracks.indexOf(track)}
                      <div class="transfer-track-row status-{track.status}">
                        <span class="transfer-status-dot"></span>
                        <div class="transfer-track-info">
                          <div class="transfer-track-main">
                            <span class="transfer-track-title" use:bulleTexte>{track.title}</span>
                            {#if track.artist_name}
                              <span class="transfer-track-artist" use:bulleTexte>{track.artist_name}</span>
                            {/if}
                            <span class="transfer-track-status">
                              {#if track.match_method === 'manual'}
                                {$tr('playlist.manualMatch')}
                              {:else}
                                {$tr(`playlist.${track.status === 'not_found' ? 'notFound' : track.status === 'approximate' ? 'approximate' : 'matched'}`)}
                              {/if}
                            </span>
                          </div>
                          {#if track.status === 'approximate' && track.target_title}
                            <div class="transfer-match-info">
                              <span class="match-label">{$tr('playlist.matchedAs')}</span>
                              <span class="match-title" use:bulleTexte>{track.target_title}</span>
                              {#if track.target_artist}<span class="match-artist" use:bulleTexte>- {track.target_artist}</span>{/if}
                              {#if track.score}<span class="match-score">{Math.round(track.score * 100)}%</span>{/if}
                            </div>
                          {/if}
                          {#if track.match_method === 'manual' && track.target_title}
                            <div class="transfer-match-info">
                              <span class="match-title" use:bulleTexte>{track.target_title}</span>
                              {#if track.target_artist}<span class="match-artist" use:bulleTexte>- {track.target_artist}</span>{/if}
                              {#if track.score}<span class="match-score">{Math.round(track.score * 100)}%</span>{/if}
                            </div>
                          {/if}
                          {#if (track.status === 'not_found' || track.status === 'approximate') && track.alternatives && track.alternatives.length > 0}
                            <button class="alt-toggle" onclick={() => qtToggleAlternatives(trackIndex)}>
                              {qtExpandedAlternatives.has(trackIndex) ? $tr('playlist.hideAlternatives') : `${$tr('playlist.showAlternatives')} (${track.alternatives.length})`}
                            </button>
                            {#if qtExpandedAlternatives.has(trackIndex)}
                              <div class="alternatives">
                                {#each track.alternatives as alt}
                                  <div class="alt-row">
                                    <span class="alt-title" use:bulleTexte>{alt.title}</span>
                                    <span class="alt-artist" use:bulleTexte>{alt.artist_name}</span>
                                    <span class="alt-score">{Math.round(alt.score * 100)}%</span>
                                    <button class="alt-pick" onclick={() => qtPickAlternative(track, alt)}>
                                      {track.status === 'approximate' ? $tr('playlist.replace') : $tr('playlist.choose')}
                                    </button>
                                  </div>
                                {/each}
                              </div>
                            {/if}
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {:else}
              <!-- Transfer form -->
              <div class="qt-form">
                <div class="qt-row">
                  <div class="qt-field">
                    <label class="qt-label">{$tr('playlist.source')}</label>
                    <select class="qt-select" bind:value={qtSourceService} onchange={(e) => qtLoadSourcePlaylists((e.target as HTMLSelectElement).value)}>
                      <option value="">{$tr('playlistManager.pickService')}</option>
                      {#each qtAvailableServices as svc}
                        <option value={svc}>{svc === 'local' ? $tr('playlist.local') : serviceName(svc)}</option>
                      {/each}
                    </select>
                  </div>
                  <div class="qt-arrow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg>
                  </div>
                  <div class="qt-field">
                    <label class="qt-label">{$tr('playlist.target')}</label>
                    <select class="qt-select" bind:value={qtTargetService} disabled={!qtSourceService}>
                      {#each qtTargetServices as svc}
                        <option value={svc}>{svc === 'local' ? $tr('playlist.local') : serviceName(svc)}</option>
                      {/each}
                    </select>
                  </div>
                </div>

                {#if qtSourceService}
                  <div class="qt-playlist-row">
                    <div class="qt-field" style="flex: 2;">
                      <label class="qt-label">{$tr('playlist.selectPlaylist')}</label>
                      {#if qtLoadingPlaylists}
                        <div class="qt-loading"><div class="spinner"></div></div>
                      {:else}
                        <select class="qt-select" bind:value={qtSourcePlaylistId} onchange={(e) => qtSelectPlaylist((e.target as HTMLSelectElement).value)}>
                          <option value="">-- {$tr('playlist.selectPlaylist')} --</option>
                          {#each qtSourcePlaylists as pl}
                            <option value={'source_id' in pl ? (pl as StreamingPlaylist).source_id : String((pl as Playlist).id)}>
                              {pl.name} ({$tr('playlistManager.trackCount').replace('{count}', String(('track_count' in pl ? pl.track_count : (pl as Playlist).track_count) ?? '?'))})
                            </option>
                          {/each}
                        </select>
                      {/if}
                    </div>
                    <div class="qt-field" style="flex: 1;">
                      <label class="qt-label">{$tr('playlist.name')}</label>
                      <input type="text" class="qt-input" bind:value={qtTargetName} placeholder={$tr('playlistManager.targetNamePlaceholder')} />
                    </div>
                  </div>
                {/if}

                <div class="qt-actions">
                  <button
                    class="btn-action qt-transfer-btn"
                    onclick={doQuickTransfer}
                    disabled={qtTransferring || !qtSourcePlaylistId || !qtSourceService}
                  >
                    {#if qtTransferring}
                      <div class="spinner-small"></div>
                      {$tr('playlist.transferring')}
                    {:else}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg>
                      {$tr('playlist.transfer')}
                    {/if}
                  </button>
                </div>
              </div>
            {/if}
          </div>

          <!-- Transfer History -->
          <div class="qt-history-section">
            <div class="tab-actions">
              <h3>{$tr('playlistManager.transferHistory')}</h3>
            </div>
            {#if historyLoading}
              <div class="loading"><div class="spinner"></div>{$tr('common.loading')}</div>
            {:else if transferHistory.length === 0}
              <div class="empty">{$tr('playlistManager.noTransfers')}</div>
            {:else}
              <div class="history-list">
                {#each transferHistory as entry}
                  <div class="history-row">
                    <div class="history-op">{entry.operation}</div>
                    <div class="history-info">
                      <span class="history-name">{entry.source_playlist_name || '?'}</span>
                      <span class="history-arrow">{entry.source_service} → {entry.target_service}</span>
                    </div>
                    <div class="history-stats">
                      <span class="stat-ok">{entry.matched} ok</span>
                      <span class="stat-approx">{entry.approximate} ~</span>
                      <span class="stat-miss">{entry.not_found} ✕</span>
                    </div>
                    <span class="history-date">{entry.started_at?.substring(0, 16)}</span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>

      {:else}
        <div class="pm-tab-content">
          <p class="pm-premium">{$tr('playlistManager.premiumTransfers' as any)}</p>
        </div>
      {/if}
    {:else if managerTab === 'sync'}
      {#if $isPremium}
        <!-- Sync Links Tab -->
        <div class="pm-tab-content">
          <div class="tab-actions">
            <h3>{$tr('playlistManager.syncLinks')}</h3>
          </div>
          {#if syncLoading}
            <div class="loading"><div class="spinner"></div>{$tr('common.loading')}</div>
          {:else if syncLinks.length === 0}
            <div class="empty">{$tr('playlistManager.noSyncLinks')}</div>
          {:else}
            {#each syncLinks as link}
              <div class="sync-row">
                <div class="sync-info">
                  <span>Playlist #{link.local_playlist_id}</span>
                  <span class="sync-arrow">↔ {link.service} / {link.service_playlist_id}</span>
                  <span class="sync-dir">{link.sync_direction}</span>
                </div>
                <div class="sync-actions">
                  <button class="btn-sm" onclick={() => triggerSync(link.id)} disabled={syncing.has(link.id)}>
                    {syncing.has(link.id) ? 'Sync...' : 'Sync'}
                  </button>
                  <button class="btn-sm danger" onclick={() => deleteLink(link.id)}>✕</button>
                </div>
                {#if link.last_synced_at}
                  <span class="sync-date">{$tr('playlistManager.last')}: {link.last_synced_at.substring(0, 16)}</span>
                {/if}
              </div>
            {/each}
          {/if}
        </div>

      {:else}
        <!-- Coupure nette, comme le crossfeed et le convertisseur : on ne grise
             pas, on DIT pourquoi. La fonction rejoint le greffon premium
             « Playlists converter » (Bertrand, 21/09/2026). -->
        <div class="pm-tab-content">
          <p class="pm-premium">{$tr('playlistManager.premiumSync' as any)}</p>
        </div>
      {/if}
    {:else if managerTab === 'backup'}
      <!-- Backup Tab -->
      <div class="pm-tab-content">
        <div class="tab-actions">
          <h3>{$tr('playlistManager.backupExport')}</h3>
          <div class="tab-btns">
            <button class="btn-action" onclick={doBackup} disabled={backingUp}>
              {backingUp ? $tr('playlistManager.backingUp') : $tr('playlistManager.backupAll')}
            </button>
          </div>
        </div>
        {#if backupResult}
          <div class="backup-result">
            <span class="stat-ok">{backupResult.playlists_backed_up} playlists</span>
            <span class="stat-ok">{$tr('playlistManager.tracksSnapshotted').replace('{count}', String(backupResult.total_tracks_snapshot))}</span>
          </div>
        {/if}

        <h4 style="margin-top: 24px;">{$tr('playlistManager.savedSnapshots')}</h4>
        {#if restoreMessage}
          <div class="backup-result" style="margin-bottom: 8px;">
            <span>{restoreMessage}</span>
          </div>
        {/if}
        {#if snapshotsLoading}
          <p class="muted">{$tr('common.loading')}</p>
        {:else if snapshots.length === 0}
          <p class="muted">{$tr('playlistManager.noSnapshots')}</p>
        {:else}
          <div class="snapshots-list">
            {#each snapshots as snap (snap.id)}
              <div class="snapshot-row">
                <div class="snapshot-info">
                  <span class="snapshot-name">{snap.playlist_name}</span>
                  <span class="snapshot-meta">
                    {snap.source_service} · {snap.track_count} {$tr('common.tracks')}
                    {#if snap.created_at}· {new Date(snap.created_at).toLocaleString()}{/if}
                  </span>
                </div>
                <div class="snapshot-actions">
                  <button
                    class="btn-action"
                    onclick={() => restoreSnapshot(snap)}
                    disabled={restoringSnapshotId === snap.id}
                  >
                    {restoringSnapshotId === snap.id ? $tr('playlistManager.restoring') : $tr('playlistManager.restore')}
                  </button>
                  <button class="btn-action btn-danger" onclick={() => deleteSnapshot(snap)}>
                    {$tr('common.delete')}
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <h4 style="margin-top: 24px;">{$tr('playlistManager.batchTransfer')}</h4>
        <div class="batch-form">
          <select bind:value={batchSource}>
            <option value="">{$tr('playlistManager.pickSource')}</option>
            {#each authenticatedServices as svc}
              <option value={svc}>{svc}</option>
            {/each}
          </select>
          <span>→</span>
          <select bind:value={batchTarget}>
            <option value="local">{$tr('playlist.local')}</option>
            {#each authenticatedServices as svc}
              <option value={svc}>{svc}</option>
            {/each}
          </select>
          <button class="btn-action" onclick={doBatchTransfer} disabled={batching || !batchSource}>
            {batching ? $tr('playlistManager.transferringShort') : $tr('playlistManager.transferAll')}
          </button>
        </div>
        {#if batchResult}
          <div class="backup-result">
            <span>{$tr('playlistManager.playlistsProcessed').replace('{count}', String(batchResult.total_playlists))} — {batchResult.status}</span>
          </div>
        {/if}
      </div>

    {:else if managerTab === 'collab'}
      <!-- Collaborative Playlists Tab -->
      <div class="pm-tab-content">
        <div class="tab-actions">
          <h3>{$tr('playlistManager.collabPlaylists')}</h3>
          <div class="tab-btns">
            <button class="btn-action" onclick={() => showCollabCreate = true}>{$tr('common.create')}</button>
          </div>
        </div>

        {#if showCollabCreate}
          <div class="collab-create-form">
            <input type="text" placeholder={$tr('playlistManager.playlistNamePlaceholder')} bind:value={newCollabName} onkeydown={(e) => e.key === 'Enter' && createCollab()} />
            <button class="btn-action" onclick={createCollab} disabled={creatingCollab || !newCollabName.trim()}>
              {creatingCollab ? $tr('playlistManager.creating') : $tr('common.create')}
            </button>
            <button class="btn-action" style="background: var(--tune-text-muted)" onclick={() => { showCollabCreate = false; newCollabName = ''; }}>{$tr('common.cancel')}</button>
          </div>
        {/if}

        {#if collabLoading}
          <div class="loading"><div class="spinner"></div>{$tr('common.loading')}</div>
        {:else if collabPlaylists.length === 0}
          <div class="empty">{$tr('playlistManager.noCollabPlaylists')}</div>
        {:else}
          <div class="collab-list">
            {#each collabPlaylists as pl}
              <div class="collab-row" class:active={collabSelectedId === pl.id}>
                <button class="collab-row-btn" onclick={() => loadCollabTracks(pl.id)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                  <span class="collab-name">{pl.name}</span>
                  {#if pl.track_count != null}
                    <span class="collab-count">{pl.track_count} {$tr('common.tracks')}</span>
                  {/if}
                </button>
                <button class="btn-action btn-danger" onclick={() => deleteCollab(pl.id)} disabled={deletingCollab === pl.id}>
                  {deletingCollab === pl.id ? '...' : $tr('common.delete')}
                </button>
              </div>
            {/each}
          </div>

          {#if collabSelectedId}
            <div class="collab-tracks-section">
              <h4>{$tr('playlistManager.tracksHeader')}</h4>
              {#if collabTracksLoading}
                <div class="loading"><div class="spinner"></div></div>
              {:else if collabTracks.length === 0}
                <div class="empty">{$tr('playlistManager.noTracksInPlaylist')}</div>
              {:else}
                <div class="collab-tracks-list">
                  {#each collabTracks as track, i}
                    <div class="collab-track-row">
                      <span class="collab-track-num">{i + 1}</span>
                      <div class="collab-track-info">
                        <span class="collab-track-title truncate" use:bulleTexte>{track.title}</span>
                        <span class="collab-track-artist truncate" use:bulleTexte>{track.artist_name ?? ''}</span>
                      </div>
                      <span class="collab-track-dur">{formatTime(track.duration_ms)}</span>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        {/if}
      </div>

    {:else}
    <!-- Filter Chips (original playlists tab) -->
    <div class="filter-chips">
      {#each filterChips as chip}
        <button
          class="filter-chip"
          class:active={activeFilter === chip}
          style={activeFilter === chip ? `background: ${serviceColor(chip)}22; color: ${serviceColor(chip)}; border-color: ${serviceColor(chip)}44` : ''}
          onclick={() => activeFilter = chip}
        >
          {#if chip === 'all'}
            {$tr('playlist.filterAll')}
          {:else if chip === 'local'}
            {$tr('playlist.local')}
          {:else}
            {serviceName(chip)}
          {/if}
        </button>
      {/each}
    </div>
    <!-- Le bouton de MODE « Fusionner » a disparu : on sélectionne d'abord,
         par le coin d'une carte, et la barre d'actions apparaît ensuite.
         Voir le commentaire de `mergeSelected`. -->

    {#if mergeResult}
      <div class="backup-result" style="margin-bottom: 8px;">
        <span class="stat-ok">{$tr('playlistManager.mergeCreated').replace('{name}', mergeResult.name).replace('{count}', String(mergeResult.total_tracks))}</span>
        <button class="cancel-btn" onclick={() => mergeResult = null}>{$tr('common.ok')}</button>
      </div>
      {#if mergeResult.unmatched && mergeResult.unmatched.length > 0}
        <!-- Les titres NON retrouvés dans le catalogue de la cible, NOMMÉS
             (choix de Bertrand, 21/09). Un simple compte laisserait chercher
             lesquels dans une playlist de deux cents titres. -->
        <details class="fusion-absents" open>
          <summary>
            {$tr('playlistManager.unmatchedHeader' as any).replace(
              '{count}',
              String(mergeResult.unmatched.length),
            )}
          </summary>
          <ul>
            {#each mergeResult.unmatched as t}
              <li>
                <span class="fa-titre">{t.title}</span>
                {#if t.artist}<span class="fa-artiste">{t.artist}</span>{/if}
                <span class="fa-service">{t.service === 'local' ? $tr('playlist.local') : serviceName(t.service)}</span>
              </li>
            {/each}
          </ul>
        </details>
      {/if}
    {/if}

    {#if showCreate}
      <div class="create-form">
        <input type="text" placeholder={$tr('playlist.name')} bind:value={newName} />
        <input type="text" placeholder={$tr('playlist.description')} bind:value={newDescription} />
        <div class="form-actions">
          <button class="cancel-btn" onclick={() => showCreate = false}>{$tr('common.cancel')}</button>
          <button class="confirm-btn" onclick={createPlaylist}>{$tr('common.create')}</button>
        </div>
      </div>
    {/if}

    {#if loading}
      <div class="loading-fullscreen">
        <div class="spinner-large"></div>
        <p class="loading-label">{loadingStatus || $tr('common.loading')}</p>
        <p class="loading-count">{loadedCount} playlists</p>
      </div>
    {:else if displayPlaylists.length === 0}
      <div class="empty">{$tr('playlist.noPlaylists')}</div>
    {/if}

    {#if mergeSelected.size > 0}
      <div class="merge-bar">
        <span class="merge-count">{$tr('playlistManager.playlistsSelected').replace('{count}', String(mergeSelected.size))}</span>
        <input
          type="text"
          placeholder={$tr('playlistManager.mergedNamePlaceholder')}
          bind:value={mergeName}
          oninput={() => (mergeNameTouched = true)}
          class="merge-input"
        />
        <!-- LE SÉLECTEUR DE CIBLE — « quand vais-je choisir la cible ? » :
             ici, et TOUJOURS visible (choix de Bertrand, 21/09). Le laisser
             apparaître seulement sur une sélection mixte aurait caché la
             seule réponse à la question, et rendu le cas courant illisible
             quand il compte : quand on veut justement changer d'endroit. -->
        <label class="merge-cible">
          {$tr('playlistManager.mergeTarget' as any)}
          <select
            value={cibleFusion}
            onchange={(e) => (cibleChoisie = e.currentTarget.value)}
            class="merge-select"
          >
            <option value="local">{$tr('playlist.local')}</option>
            {#each authenticatedServices as svc}
              <option value={svc}>{serviceName(svc)}</option>
            {/each}
          </select>
        </label>
        <label class="merge-dedup">
          <input type="checkbox" bind:checked={mergeDedup} />
          {$tr('playlistManager.deduplicate')}
        </label>
        <button
          class="confirm-btn"
          onclick={doMerge}
          disabled={merging || mergeSelected.size < 2 || !mergeName.trim()}
        >
          {merging ? $tr('playlistManager.merging') : $tr('playlistManager.merge')}
        </button>
        {#if selectionSupprimable}
          <!-- « à côté de merge ?? » — Bertrand, 21/09. La corbeille par carte
               ne se révélait qu'au survol, sous le nom ; celle-ci est là dès
               qu'une case est cochée, et agit sur tout le lot. -->
          <button
            class="danger-btn"
            onclick={supprimerLaSelection}
            disabled={suppressionLot}
          >
            {suppressionLot ? $tr('playlistManager.deleting' as any) : $tr('common.delete')}
          </button>
        {/if}
        <button class="cancel-btn" onclick={cancelMerge}>{$tr('common.cancel')}</button>
      </div>
      {#if mergeSelected.size < 2}
        <!-- Dire POURQUOI le bouton ne part pas, plutôt que de le griser en
             silence : une seule playlist ne se fusionne avec rien. -->
        <p class="merge-hint">{$tr('playlistManager.selectAtLeastTwo' as any)}</p>
      {:else if !mergeName.trim()}
        <!-- L'AUTRE motif du gris, celui qui a mordu : le nom manque. -->
        <p class="merge-hint">{$tr('playlistManager.nameRequired' as any)}</p>
      {:else if titresAApparier > 0}
        <!-- Une fusion croisée cherche chaque titre dans le catalogue de la
             cible : un aller-retour réseau par titre. Le dire AVANT, pas
             après — c'est la différence entre « c'est long » et « c'est
             planté ». -->
        <p class="merge-hint">
          {$tr('playlistManager.crossServiceNotice' as any)
            .replace('{count}', String(titresAApparier))
            .replace('{target}', cibleFusion === 'local' ? $tr('playlist.local') : serviceName(cibleFusion))}
        </p>
      {/if}
    {/if}

    {#if displayPlaylists.length > 0}
      <!--
        LA GRILLE (maquette Levente, 20/09/2026). C'était une liste verticale.

        Ce qui change vraiment n'est pas la forme mais le GESTE : le coin bas
        gauche de chaque carte coche la playlist, et la barre de fusion
        apparaît au-dessus. Plus de mode à découvrir — c'est ce qui faisait
        dire « la fusion ne marche pas ».

        🔴 La sélection FUT confinée à un service : cocher une carte TIDAL
        rendait inertes toutes les cartes Qobuz. Bertrand, 21/09 : « Quand
        je vais merger des playlists de Tidal et Qobuz, quand vais-je choisir
        la cible ? » — jamais, puisqu'il ne pouvait pas mélanger. Le verrou
        est tombé, et la cible se choisit dans la barre.
      -->
      <div class="pl-grille">
        {#each displayPlaylists as item}
          {@const cle = mergeKey(item.service, identifiantDe(item))}
          {@const cochee = mergeSelected.has(cle)}
          <div class="pl-carte" class:cochee>
            <!-- 🔴 LA VIGNETTE EST LA BOÎTE DE RÉFÉRENCE DES QUATRE COINS.
                 Ils étaient positionnés contre la CARTE entière : les deux du
                 haut tombaient juste par accident, et les deux du bas
                 atterrissaient sous le nom et le badge, loin de la pochette.
                 Bertrand : « le bouton de sélection doit être au coin bas
                 gauche de la POCHETTE ». Les coins sont donc frères du bouton
                 de pochette, dans une boîte qui a exactement sa taille — et
                 jamais DEDANS : un bouton dans un bouton est du balisage
                 invalide que les navigateurs défont (#1006). -->
            <div class="pl-vignette">
            <button class="pl-pochette" onclick={() => selectItem(item)} aria-label={item.name}>
              {#if item.coverPath}
                <AlbumArt coverPath={item.coverPath} size={0} alt={item.name} />
              {:else if mosaiques[cle]}
                <MosaiquePochettes pochettes={mosaiques[cle]} alt={item.name} />
              {:else}
                <span class="pl-vide">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13M9 18c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg>
                </span>
              {/if}
            </button>



            <!--
              LES CINQ APPELS À L'ACTION, sur CHAQUE pochette — locale comme de
              service (Bertrand, 21/09/2026 : « je veux les 5 sur chaque cover
              de playlist »).

              Mesuré sur le .18 avant d'écrire, parce que « ça marche pour une
              playlist de service » ne se devine pas :

                · étiquettes  POST /tags/{id}/streaming-items {item_type:
                              "playlist"} → 201, relu, puis retiré par
                              /remove → 204 ;
                · favori      `StreamingItemType` et `ServiceFavType` portent
                              tous deux « playlist(s) », et `HeartButton`
                              accepte déjà une cible de service ;
                · lecture     `playStreamingPlaylist` existait ;
                · sélection   la route de fusion prend {service, playlist_id}.

              Le CRAYON ouvre la playlist — c'est là qu'on la renomme
              (Bertrand : « edit la playlist et permet de la renommer »). Il ne
              renomme donc pas depuis la carte, ce qui règle au passage le seul
              point impossible : aucune route ne renomme une playlist CHEZ un
              service.
            -->
            <span class="pl-coin-hg"><HeartButton {...favoriDe(item)} size={15} /></span>

            <button
              class="pl-coin-hd"
              title={$tr('playlist.edit')}
              aria-label={$tr('playlist.edit')}
              onclick={(e) => { e.stopPropagation(); selectItem(item); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
            </button>

            <button
              class="pl-coin"
              class:on={cochee}
              aria-pressed={cochee}
              aria-label={$tr('playlistManager.selectPlaylist' as any).replace('{name}', item.name)}
              title={$tr('playlistManager.selectPlaylist' as any).replace('{name}', item.name)}
              onclick={(e) => { e.stopPropagation(); toggleMergeSelect(item.service, identifiantDe(item)); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="13" height="13"><path d="M20 6L9 17l-5-5" /></svg>
            </button>

            <button
              class="pl-coin-bd"
              title={$tr('v2.nav.tags' as any)}
              aria-label={$tr('v2.nav.tags' as any)}
              onclick={(e) => { e.stopPropagation(); etiquettesCible = cibleEtiquetteDe(item); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.42 0l8.58-8.58a1 1 0 0 0 0-1.42z" /><circle cx="6.5" cy="6.5" r="1.2" /></svg>
            </button>

            <button
              class="pl-lire"
              title={$tr('common.play')}
              aria-label={$tr('common.play')}
              onclick={(e) => { e.stopPropagation(); lirePlaylist(item); }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M8 5v14l11-7z" /></svg>
            </button>
            </div>

            <div class="pl-texte">
              <span class="pl-nom">{item.name}</span>
              <span class="pl-compte">{item.trackCount} {$tr('common.tracks')}</span>
              <span class="pl-badge" style="border-color: {serviceColor(item.service)}; color: {serviceColor(item.service)}">
                {item.service === 'local' ? $tr('playlist.local') : serviceName(item.service)}
              </span>
            </div>


            <div class="pl-actions">
              {#if item.type === 'streaming' && item.streaming}
                <button onclick={(e) => { e.stopPropagation(); openImport(item.service, item.streaming!); }} title={$tr('playlist.import')} aria-label={$tr('playlist.import')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                </button>
                <!-- « pas de bouton pour supprimer une playlist Tidal ! ».
                     Posé seulement si le SERVEUR annonce la capacité : chez
                     un service qui ne sait pas supprimer, le clic rendrait
                     501. -->
                {#if serviceSaitSupprimer(item.service)}
                  <button
                    class="danger"
                    disabled={suppressionEnCours === mergeKey(item.service, identifiantDe(item))}
                    onclick={(e) => { e.stopPropagation(); supprimerPlaylistDeService(item); }}
                    title={$tr('common.delete')}
                    aria-label={$tr('common.delete')}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                {/if}
              {/if}
              {#if item.type === 'local' && item.local?.id}
                <button onclick={(e) => { e.stopPropagation(); handleSharePlaylist(item.local!.id); }} title={$tr('playlistManager.share')} aria-label={$tr('playlistManager.share')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
                </button>
                <button class="danger" onclick={(e) => { e.stopPropagation(); item.local?.id && deletePlaylist(item.local.id); }} title={$tr('common.delete')} aria-label={$tr('common.delete')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
    {/if}
  {/if}
</div>

{#if etiquettesCible}
  <!-- Monté UNE fois pour toute la grille, comme les autres écrans le font :
       un panneau par carte en aurait posé autant que de playlists. -->
  {#await import('../v2/EtiquettesPanneau.svelte') then m}
    <m.default
      cible={etiquettesCible}
      nom={etiquettesCible.titre ?? ''}
      onClose={() => (etiquettesCible = null)}
    />
  {/await}
{/if}

<!-- Import Dialog Overlay -->
{#if importTarget}
  <div class="modal-overlay" onclick={closeImport}>
    <div class="modal-content" onclick={(e) => e.stopPropagation()}>
      {#if importResult}
        {#if importResult.count > 0}
          <div class="import-done">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--tune-accent)" stroke-width="2" width="32" height="32"><path d="M20 6L9 17l-5-5" /></svg>
            <h3>{$tr('playlist.importSuccess')}</h3>
            <p>{$tr('playlist.importedMatched' as any).replace('{count}', String(importResult.count)).replace('{total}', String(importResult.total))}</p>
            <button class="confirm-btn" onclick={closeImport}>{$tr('common.ok')}</button>
          </div>
        {:else if importResult.count === 0}
          <div class="import-done">
            <h3>{$tr('playlist.importSuccess')}</h3>
            <p>{$tr('playlist.importNoneMatched' as any)}</p>
            <button class="confirm-btn" onclick={closeImport}>{$tr('common.ok')}</button>
          </div>
        {:else}
          <div class="import-done">
            <h3>{$tr('playlist.importError')}</h3>
            <button class="confirm-btn" onclick={closeImport}>{$tr('common.ok')}</button>
          </div>
        {/if}
      {:else}
        <h3>{$tr('playlist.import')}</h3>
        <p class="import-source">
          <span class="source-chip" style="color: {serviceColor(importTarget.service)}">{serviceName(importTarget.service)}</span>
          {importTarget.playlist.track_count} {$tr('common.tracks')}
        </p>
        <label class="import-label">{$tr('playlist.name')}</label>
        <input type="text" class="import-input" bind:value={importName} />
        <div class="form-actions">
          <button class="cancel-btn" onclick={closeImport}>{$tr('common.cancel')}</button>
          <button class="confirm-btn" onclick={doImport} disabled={importing}>
            {#if importing}
              <div class="spinner-small"></div>
              {$tr('playlist.importing')}
            {:else}
              {$tr('playlist.import')}
            {/if}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- Transfer Dialog Overlay -->
{#if showTransfer}
  <div class="modal-overlay" onclick={closeTransfer}>
    <div class="modal-content modal-wide" onclick={(e) => e.stopPropagation()}>
      {#if transferResult}
        <div class="transfer-report">
          <h3>{$tr('playlist.transferComplete')}</h3>
          <div class="transfer-summary">
            <button class="summary-stat matched" class:active={transferFilter === 'matched'} onclick={() => transferFilter = transferFilter === 'matched' ? 'all' : 'matched'}>{transferResult.matched} {$tr('playlist.matched')}</button>
            <button class="summary-stat approximate" class:active={transferFilter === 'approximate'} onclick={() => transferFilter = transferFilter === 'approximate' ? 'all' : 'approximate'}>{transferResult.approximate} {$tr('playlist.approximate')}</button>
            <button class="summary-stat not-found" class:active={transferFilter === 'not_found'} onclick={() => transferFilter = transferFilter === 'not_found' ? 'all' : 'not_found'}>{transferResult.not_found} {$tr('playlist.notFound')}</button>
          </div>
          <div class="transfer-tracks">
            {#each transferResult.tracks.filter(t => transferFilter === 'all' || t.status === transferFilter) as track, i}
              {@const trackIndex = transferResult.tracks.indexOf(track)}
              <div class="transfer-track-row status-{track.status}" class:has-alternatives={track.alternatives && track.alternatives.length > 0}>
                <span class="transfer-status-dot"></span>
                <div class="transfer-track-info">
                  <div class="transfer-track-main">
                    <span class="transfer-track-title" use:bulleTexte>{track.title}</span>
                    {#if track.artist_name}
                      <span class="transfer-track-artist" use:bulleTexte>{track.artist_name}</span>
                    {/if}
                    <span class="transfer-track-status">
                      {#if track.match_method === 'manual'}
                        {$tr('playlist.manualMatch')}
                      {:else if track.match_method === 'confirmed'}
                        {$tr('playlist.matched')}
                      {:else}
                        {$tr(`playlist.${track.status === 'not_found' ? 'notFound' : track.status === 'approximate' ? 'approximate' : 'matched'}`)}
                      {/if}
                    </span>
                  </div>
                  <!-- For approximate tracks: show what it was matched to -->
                  {#if track.status === 'approximate' && track.target_title}
                    <div class="transfer-match-info">
                      <span class="match-label">{$tr('playlist.matchedAs')}</span>
                      <span class="match-title" use:bulleTexte>{track.target_title}</span>
                      {#if track.target_artist}
                        <span class="match-artist" use:bulleTexte>- {track.target_artist}</span>
                      {/if}
                      {#if track.score}
                        <span class="match-score">{Math.round(track.score * 100)}%</span>
                      {/if}
                    </div>
                  {/if}
                  <!-- For manual matches: show what was picked -->
                  {#if track.match_method === 'manual' && track.target_title}
                    <div class="transfer-match-info">
                      <span class="match-title" use:bulleTexte>{track.target_title}</span>
                      {#if track.target_artist}
                        <span class="match-artist" use:bulleTexte>- {track.target_artist}</span>
                      {/if}
                      {#if track.score}
                        <span class="match-score">{Math.round(track.score * 100)}%</span>
                      {/if}
                    </div>
                  {/if}
                  <!-- Alternatives section for not_found and approximate tracks -->
                  {#if (track.status === 'not_found' || track.status === 'approximate') && track.alternatives && track.alternatives.length > 0}
                    <button class="alt-toggle" onclick={() => toggleAlternatives(trackIndex)}>
                      {#if expandedAlternatives.has(trackIndex)}
                        {$tr('playlist.hideAlternatives')}
                      {:else}
                        {$tr('playlist.showAlternatives')} ({track.alternatives.length})
                      {/if}
                    </button>
                    {#if expandedAlternatives.has(trackIndex)}
                      <div class="alternatives">
                        {#each track.alternatives as alt}
                          <div class="alt-row">
                            <span class="alt-title" use:bulleTexte>{alt.title}</span>
                            <span class="alt-artist" use:bulleTexte>{alt.artist_name}</span>
                            <span class="alt-score">{Math.round(alt.score * 100)}%</span>
                            <button class="alt-pick" onclick={() => pickAlternative(track, alt)}>
                              {track.status === 'approximate' ? $tr('playlist.replace') : $tr('playlist.choose')}
                            </button>
                          </div>
                        {/each}
                      </div>
                    {/if}
                  {/if}
                </div>
              </div>
            {/each}
          </div>
          <div class="form-actions">
            {#if hasManualResolutions}
              <button class="confirm-btn" onclick={confirmManualChoices} disabled={confirmingTransfer}>
                {#if confirmingTransfer}
                  <div class="spinner-small"></div>
                  {$tr('playlist.confirming')}
                {:else}
                  {$tr('playlist.confirmChoices')}
                {/if}
              </button>
            {/if}
            <button class="confirm-btn" onclick={closeTransfer}>{$tr('common.ok')}</button>
          </div>
        </div>
      {:else}
        <h3>{$tr('playlist.transferTo')}</h3>
        <p class="import-source">
          {#if selectedService && selectedService !== 'local'}
            <span class="source-chip" style="color: {serviceColor(selectedService)}">{serviceName(selectedService)}</span>
          {:else}
            <span class="source-chip" style="color: {serviceColor('local')}">{$tr('playlist.local')}</span>
          {/if}
          {selectedPlaylist?.name ?? selectedStreamingPl?.name}
        </p>
        <label class="import-label">{$tr('playlist.selectTarget')}</label>
        <select class="import-input" bind:value={transferTargetService}>
          {#each transferServices as svc}
            <option value={svc}>{svc === 'local' ? $tr('playlist.local') : serviceName(svc)}</option>
          {/each}
        </select>
        <label class="import-label">{$tr('playlist.name')}</label>
        <input type="text" class="import-input" bind:value={transferName} />
        <div class="form-actions">
          <button class="cancel-btn" onclick={closeTransfer}>{$tr('common.cancel')}</button>
          <button class="confirm-btn" onclick={doTransfer} disabled={transferring}>
            {#if transferring}
              <div class="spinner-small"></div>
              {$tr('playlist.transferring')}
            {:else}
              {$tr('playlist.transfer')}
            {/if}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- Diff Dialog Overlay -->
{#if showDiff}
  <div class="modal-overlay" onclick={closeDiff}>
    <div class="modal-content modal-wide" onclick={(e) => e.stopPropagation()}>
      {#if diffResult}
        <div class="diff-report">
          <h3>{diffResult.source_name} vs {diffResult.target_name}</h3>
          <div class="diff-columns">
            <div class="diff-column">
              <h4 class="diff-col-header source-header">{$tr('playlist.onlyInSource')} ({diffResult.only_in_source.length})</h4>
              <div class="diff-track-list">
                {#each diffResult.only_in_source as track}
                  <div class="diff-track source-only">
                    <span class="diff-track-title" use:bulleTexte>{track.title}</span>
                    {#if track.artist_name}<span class="diff-track-artist" use:bulleTexte>{track.artist_name}</span>{/if}
                  </div>
                {/each}
                {#if diffResult.only_in_source.length === 0}
                  <div class="diff-empty">--</div>
                {/if}
              </div>
            </div>
            <div class="diff-column">
              <h4 class="diff-col-header both-header">{$tr('playlist.inBoth')} ({diffResult.in_both.length})</h4>
              <div class="diff-track-list">
                {#each diffResult.in_both as track}
                  <div class="diff-track in-both" class:approximate={track.match_quality === 'approximate'}>
                    <span class="diff-track-title" use:bulleTexte>{track.title}</span>
                    {#if track.artist_name}<span class="diff-track-artist" use:bulleTexte>{track.artist_name}</span>{/if}
                    {#if track.match_quality === 'approximate'}
                      <span class="diff-quality-badge">{$tr('playlist.approximate')}</span>
                    {/if}
                  </div>
                {/each}
                {#if diffResult.in_both.length === 0}
                  <div class="diff-empty">--</div>
                {/if}
              </div>
            </div>
            <div class="diff-column">
              <h4 class="diff-col-header target-header">{$tr('playlist.onlyInTarget')} ({diffResult.only_in_target.length})</h4>
              <div class="diff-track-list">
                {#each diffResult.only_in_target as track}
                  <div class="diff-track target-only">
                    <span class="diff-track-title" use:bulleTexte>{track.title}</span>
                    {#if track.artist_name}<span class="diff-track-artist" use:bulleTexte>{track.artist_name}</span>{/if}
                  </div>
                {/each}
                {#if diffResult.only_in_target.length === 0}
                  <div class="diff-empty">--</div>
                {/if}
              </div>
            </div>
          </div>
          <div class="form-actions">
            <button class="confirm-btn" onclick={closeDiff}>{$tr('common.ok')}</button>
          </div>
        </div>
      {:else}
        <h3>{$tr('playlist.compareTo')}</h3>
        <p class="import-source">
          {#if selectedService && selectedService !== 'local'}
            <span class="source-chip" style="color: {serviceColor(selectedService)}">{serviceName(selectedService)}</span>
          {:else}
            <span class="source-chip" style="color: {serviceColor('local')}">{$tr('playlist.local')}</span>
          {/if}
          {selectedPlaylist?.name ?? selectedStreamingPl?.name}
        </p>
        <label class="import-label">{$tr('playlist.selectTarget')}</label>
        <select class="import-input" bind:value={diffTargetService} onchange={(e) => loadDiffPlaylists((e.target as HTMLSelectElement).value)}>
          <option value="">--</option>
          {#each diffServices as svc}
            <option value={svc}>{svc === 'local' ? $tr('playlist.local') : svc === 'collection' ? $tr('collections.title') : serviceName(svc)}</option>
          {/each}
        </select>
        {#if diffTargetService}
          <label class="import-label">{$tr('playlist.selectPlaylist')}</label>
          {#if diffLoadingPlaylists}
            <div class="loading"><div class="spinner"></div></div>
          {:else}
            <select class="import-input" bind:value={diffTargetPlaylistId}>
              <option value="">--</option>
              {#each diffTargetPlaylists as pl}
                <option value={'source_id' in pl ? (pl as StreamingPlaylist).source_id : String((pl as Playlist).id)}>
                  {pl.name}
                </option>
              {/each}
            </select>
          {/if}
        {/if}
        <div class="form-actions">
          <button class="cancel-btn" onclick={closeDiff}>{$tr('common.cancel')}</button>
          <button class="confirm-btn" onclick={doDiff} disabled={diffing || !diffTargetPlaylistId}>
            {#if diffing}
              <div class="spinner-small"></div>
              {$tr('playlist.comparing')}
            {:else}
              {$tr('playlist.compare')}
            {/if}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- Recover Dialog Overlay -->
{#if showRecover}
  <div class="modal-overlay" onclick={closeRecover}>
    <div class="modal-content modal-wide" onclick={(e) => e.stopPropagation()}>
      {#if recovering}
        <div class="loading"><div class="spinner"></div>{$tr('playlist.recovering')}</div>
      {:else if recoverResult}
        {#if recoverResult.unavailable === 0 && recoverResult.recovered === 0}
          <div class="import-done">
            <svg viewBox="0 0 24 24" fill="none" stroke="#1DB954" stroke-width="2" width="32" height="32"><path d="M20 6L9 17l-5-5" /></svg>
            <h3>{$tr('playlist.noIssues')}</h3>
            <button class="confirm-btn" onclick={closeRecover}>{$tr('common.ok')}</button>
          </div>
        {:else}
          <div class="recover-report">
            <h3>{recoverResult.playlist_name}</h3>
            <div class="transfer-summary">
              <span class="summary-stat matched">{recoverResult.available} {$tr('playlist.available')}</span>
              {#if recoverResult.recovered > 0}
                <span class="summary-stat approximate">{recoverResult.recovered} {$tr('playlist.recovered')}</span>
              {/if}
              {#if recoverResult.unavailable > 0}
                <span class="summary-stat not-found">{recoverResult.unavailable} {$tr('playlist.unavailable')}</span>
              {/if}
            </div>
            <!-- #1076 — ce que le serveur a répondu : combien sont passées, et
                 le MOTIF de chaque refus. L'écran n'avait qu'un `console.error`. -->
            {#if recoverMsg}
              <div class="recover-msg">{recoverMsg}</div>
            {/if}
            {#if recoverResult.recovered > 0}
              <div class="form-actions" style="margin-bottom: var(--space-md); justify-content: flex-start;">
                <button class="confirm-btn" onclick={applyAllRecovery} disabled={applyingAll}>
                  {#if applyingAll}
                    <div class="spinner-small"></div>
                  {/if}
                  {$tr('playlist.applyAll')}
                </button>
              </div>
            {/if}
            <div class="recover-tracks">
              {#each recoverResult.tracks.filter(t => t.status !== 'available') as track}
                <div class="recover-track-row status-{track.status === 'recovered' ? 'approximate' : 'not_found'}">
                  <span class="transfer-status-dot"></span>
                  <div class="recover-track-info">
                    <span class="transfer-track-title" use:bulleTexte>{track.title}</span>
                    {#if track.artist_name}
                      <span class="transfer-track-artist" use:bulleTexte>{track.artist_name}</span>
                    {/if}
                    <span class="recover-source-label">{track.original_source}</span>
                  </div>
                  {#if track.status === 'recovered' && track.alternatives.length > 0}
                    <div class="recover-alternatives">
                      {#each track.alternatives as alt}
                        <div class="recover-alt-item">
                          <span class="source-chip" style="color: {serviceColor(alt.service)}">{alt.service === 'local' ? $tr('playlist.local') : serviceName(alt.service)}</span>
                          <span class="recover-alt-title" use:bulleTexte>{alt.title}</span>
                          {#if alt.artist_name}
                            <span class="recover-alt-artist" use:bulleTexte>{alt.artist_name}</span>
                          {/if}
                          <button
                            class="recover-apply-btn"
                            onclick={() => applyOneRecovery(track.track_id, alt)}
                            disabled={applyingRecovery.has(track.track_id)}
                          >
                            {#if applyingRecovery.has(track.track_id)}
                              <div class="spinner-small"></div>
                            {:else}
                              {$tr('playlist.applyRecovery')}
                            {/if}
                          </button>
                        </div>
                      {/each}
                    </div>
                  {:else if track.status === 'unavailable'}
                    <span class="recover-no-alt">{$tr('playlist.unavailable')}</span>
                  {/if}
                </div>
              {/each}
            </div>
            <div class="form-actions">
              <button class="confirm-btn" onclick={closeRecover}>{$tr('common.ok')}</button>
            </div>
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/if}
{/if}
</div>

<style>
  .pm-racine { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow-y: auto; }
  .view-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--tune-border, rgba(255,255,255,0.1));
    margin-bottom: 0;
    padding: 0 1rem;
  }
  .view-tab {
    background: none;
    border: none;
    color: var(--tune-text-secondary, #999);
    padding: 0.75rem 1.25rem;
    cursor: pointer;
    font-size: 0.9rem;
    border-bottom: 2px solid transparent;
    transition: all 0.2s;
  }
  .view-tab:hover {
    color: var(--tune-text, #fff);
  }
  .view-tab.active {
    color: var(--tune-accent, #f5a623);
    border-bottom-color: var(--tune-accent, #f5a623);
  }

  .pm-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 28px;
    overflow-y: auto;
  }

  .pm-tabs { display: flex; gap: 4px; margin-left: 24px; }
  .pm-tab { padding: 6px 16px; border: none; border-radius: 8px; background: none; color: var(--tune-text-muted); cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.15s; }
  .pm-tab:hover { background: var(--tune-surface-hover); color: var(--tune-text); }
  .pm-tab.active { background: var(--tune-accent); color: white; }

  .pm-tab-content { padding: 16px 0; }
  .tab-actions { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
  .tab-actions h3 { font-size: 16px; font-weight: 600; color: var(--tune-text); }
  .tab-btns { display: flex; gap: 8px; }
  .btn-action { padding: 8px 16px; background: var(--tune-accent); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; }
  .btn-action:hover { opacity: 0.9; }
  .btn-action:disabled { opacity: 0.5; cursor: not-allowed; }

  .history-list { display: flex; flex-direction: column; gap: 2px; }
  .history-row { display: flex; align-items: center; gap: 16px; padding: 12px 16px; background: var(--tune-surface); border-radius: 8px; }
  .history-op { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--tune-accent); min-width: 70px; }
  .history-info { flex: 1; }
  .history-name { font-weight: 600; font-size: 14px; }
  .history-arrow { font-size: 12px; color: var(--tune-text-muted); margin-left: 8px; }
  .history-stats { display: flex; gap: 8px; font-size: 12px; }
  .stat-ok { color: #10B981; } .stat-approx { color: #F59E0B; } .stat-miss { color: #EF4444; }
  .history-date { font-size: 11px; color: var(--tune-text-muted); }

  .sync-row { display: flex; align-items: center; gap: 16px; padding: 12px 16px; background: var(--tune-surface); border-radius: 8px; margin-bottom: 4px; }
  .sync-info { flex: 1; display: flex; gap: 8px; align-items: center; font-size: 14px; }
  .sync-arrow { color: var(--tune-accent); font-weight: 600; }
  .sync-dir { font-size: 11px; color: var(--tune-text-muted); background: var(--tune-surface2); padding: 2px 8px; border-radius: 4px; }
  .sync-actions { display: flex; gap: 6px; }
  .sync-date { font-size: 11px; color: var(--tune-text-muted); }
  .btn-sm { padding: 4px 12px; border: 1px solid var(--tune-border); border-radius: 6px; background: none; color: var(--tune-text); cursor: pointer; font-size: 12px; }
  .btn-sm:hover { background: var(--tune-surface-hover); }
  .btn-sm.danger { color: #EF4444; border-color: #EF444444; }
  .btn-sm.danger:hover { background: #EF444422; }

  .backup-result { padding: 12px 16px; background: var(--tune-surface); border-radius: 8px; margin-top: 12px; display: flex; gap: 16px; font-size: 14px; }
  .snapshots-list { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
  .snapshot-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; background: var(--tune-surface); border-radius: 6px; }
  .snapshot-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .snapshot-name { font-weight: 600; font-size: 14px; color: var(--tune-text-primary); }
  .snapshot-meta { font-size: 12px; color: var(--tune-text-secondary); }
  .snapshot-actions { display: flex; gap: 6px; flex-shrink: 0; }
  .btn-danger { background: rgba(248, 113, 113, 0.12); color: #f87171; border-color: rgba(248, 113, 113, 0.3); }

  .merge-bar { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--tune-accent)22; border: 1px solid var(--tune-accent)66; border-radius: 8px; margin-bottom: 12px; flex-wrap: wrap; }
  .merge-count { font-weight: 600; font-size: 13px; color: var(--tune-text-primary); }
  .merge-input { flex: 1; min-width: 180px; padding: 6px 10px; background: var(--tune-surface); border: 1px solid var(--tune-border); border-radius: 6px; color: var(--tune-text-primary); font-size: 13px; }
  .merge-dedup { display: flex; align-items: center; gap: 4px; font-size: 13px; color: var(--tune-text-secondary); cursor: pointer; }
  .merge-check { margin-right: 8px; cursor: pointer; accent-color: var(--tune-accent); width: 18px; height: 18px; }
  .merge-selected { background: var(--tune-accent)11; }
  .batch-form { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
  .batch-form select { padding: 8px 12px; background: var(--tune-surface); border: 1px solid var(--tune-border); border-radius: 8px; color: var(--tune-text); font-size: 13px; }

  .pm-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-md);
    /* La grappe du coin haut-droit — recherche globale, signet, avatar — est
       en position absolue et flotte au-dessus des écrans : chacun lui réserve
       sa place. Le jeton n'est défini que sur `.v2-shell`, d'où le repli, qui
       s'applique quand cet écran est monté par l'interface actuelle. Même
       forme que `BrowseView`, monté lui aussi des deux côtés. */
    padding-right: var(--v2-grappe-w, 172px);
  }

  .pm-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
  }

  .pm-header-right {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  /* Filter chips */
  .filter-chips {
    display: flex;
    gap: 8px;
    margin-bottom: var(--space-lg);
    flex-wrap: wrap;
  }

  .filter-chip {
    padding: 5px 14px;
    border: 1px solid var(--tune-border);
    border-radius: 20px;
    background: none;
    color: var(--tune-text-secondary);
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease-out;
    white-space: nowrap;
  }

  .filter-chip:hover {
    border-color: var(--tune-text-muted);
    color: var(--tune-text);
  }

  .filter-chip.active {
    font-weight: 700;
  }

  /* Search */
  .search-box {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--tune-grey2);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: 4px 10px;
    transition: border-color 0.12s;
  }

  .search-box:focus-within {
    border-color: var(--tune-accent);
  }

  .search-icon {
    color: var(--tune-text-muted);
    flex-shrink: 0;
  }

  .search-box input {
    background: none;
    border: none;
    outline: none;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
    width: 180px;
  }

  .search-box input::placeholder {
    color: var(--tune-text-muted);
  }

  .search-clear {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
  }

  .search-clear:hover {
    color: var(--tune-text);
  }

  /* Source badge */
  .source-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    vertical-align: middle;
    margin-right: 2px;
  }

  .source-chip {
    display: inline-block;
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  /* Buttons */
  .create-btn {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: background 0.12s ease-out;
  }

  .create-btn:hover {
    background: var(--tune-accent-hover);
  }

  .import-btn {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: none;
    border: 1px solid var(--tune-accent);
    color: var(--tune-accent);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: all 0.12s ease-out;
  }

  .import-btn:hover {
    background: var(--tune-accent);
    color: white;
  }

  .import-mini-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 8px;
    border-radius: var(--radius-sm);
    opacity: 0;
    transition: all 0.12s ease-out;
  }

  .playlist-item:hover .import-mini-btn {
    opacity: 1;
  }

  .import-mini-btn:hover {
    color: var(--tune-accent);
  }

  /* Create form */
  .create-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding: var(--space-md);
    background: var(--tune-grey2);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-lg);
  }

  .create-form input {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: var(--space-sm) var(--space-md);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 14px;
    outline: none;
  }

  .create-form input:focus {
    border-color: var(--tune-accent);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
    margin-top: var(--space-sm);
  }

  .cancel-btn {
    padding: var(--space-xs) var(--space-md);
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-secondary);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
  }

  .confirm-btn {
    padding: var(--space-xs) var(--space-md);
    background: var(--tune-accent);
    border: none;
    color: white;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .confirm-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Detail header */
  .detail-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
    flex-wrap: wrap;
  }

  .detail-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
  }

  .playlist-detail-info {
    flex: 1;
  }

  .playlist-title-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  /* Meme oubli que sur la fiche album (#2510) : cinq boutons libelles
     (importer, recuperer, transferer, comparer, tout lire) sur une rangee qui
     ne passait jamais a la ligne, dans un conteneur qui rogne l'horizontale. */
  .detail-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .playlist-desc {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-secondary);
  }

  .playlist-count {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-secondary);
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
  }

  .back-btn:hover {
    border-color: var(--tune-text-muted);
    color: var(--tune-text);
  }

  .play-all-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-lg);
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
  }

  .play-all-btn:hover {
    background: var(--tune-accent-hover);
  }

  .streaming-pl-cover {
    margin-bottom: var(--space-lg);
  }

  /* Playlist list */
  .playlist-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .playlist-item {
    display: flex;
    align-items: center;
  }

  .playlist-btn {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 28px;
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    transition: background 0.12s ease-out;
  }

  .playlist-btn:hover {
    background: var(--tune-surface-hover);
  }

  .playlist-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--tune-grey2);
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    overflow: hidden;
  }

  .playlist-icon svg {
    width: 24px;
    height: 24px;
    color: var(--tune-text-muted);
  }

  .playlist-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .playlist-name {
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 700;
  }

  .playlist-meta {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .chevron {
    color: var(--tune-text-muted);
  }

  .delete-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 8px;
    border-radius: var(--radius-sm);
    opacity: 0;
    transition: all 0.12s ease-out;
  }

  .playlist-item:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    color: var(--tune-warning);
  }

  .share-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 8px;
    border-radius: var(--radius-sm);
    opacity: 0;
    transition: all 0.12s ease-out;
  }

  .playlist-item:hover .share-btn {
    opacity: 1;
  }

  .share-btn:hover {
    color: var(--tune-accent);
  }

  /* Track list */
  .track-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
    overflow-y: auto;
  }

  .track-item {
    display: flex;
    align-items: center;
    gap: 0;
  }

  /* Drag-to-reorder feedback (local playlists) */
  .track-item.dragging {
    opacity: 0.45;
  }
  .track-item.drag-over {
    box-shadow: inset 0 2px 0 0 var(--tune-accent, #7c5cff);
  }

  /* La piste en cours. Meme parti pris qu'en bibliotheque : pas de fond
     colore, le numero cede la place au chevron, le titre prend l'accent. */
  .track-item .num-play { display: none; }
  .track-item.playing .num-text { display: none; }
  .track-item.playing .num-play { display: inline; }
  .track-item.playing .track-title { color: var(--tune-accent); font-weight: 600; }

  .track-play {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: 8px 28px;
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    transition: background 0.12s ease-out;
  }

  .track-play:hover {
    background: var(--tune-surface-hover);
  }

  .track-num {
    width: 28px;
    text-align: center;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .track-thumb {
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .track-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .track-thumb-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--tune-surface);
    color: var(--tune-text-muted);
    border-radius: var(--radius-sm);
  }

  .track-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .track-title {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
  }

  .track-artist {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
  }

  .track-duration {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .audio-format {
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--tune-text-muted);
    letter-spacing: 0.3px;
    flex-shrink: 0;
  }

  .remove-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 8px;
    border-radius: var(--radius-sm);
    opacity: 0;
    transition: all 0.12s ease-out;
  }

  .track-item:hover .remove-btn {
    opacity: 1;
  }

  .remove-btn:hover {
    color: var(--tune-warning);
  }

  .play-from-here-btn {
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-secondary);
    cursor: pointer;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s ease-out;
    opacity: 0;
  }
  .track-item:hover .play-from-here-btn { opacity: 1; }
  .play-from-here-btn:hover { border-color: var(--tune-accent); color: var(--tune-accent); }

  .add-queue-btn {
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-muted);
    cursor: pointer;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    font-size: 16px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: all 0.12s ease-out;
    margin-right: 8px;
  }

  .track-item:hover .add-queue-btn {
    opacity: 1;
  }

  .add-queue-btn:hover {
    color: var(--tune-accent);
    border-color: var(--tune-accent);
  }

  .add-playlist-btn {
    width: 28px;
    height: 28px;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--tune-text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s ease-out;
    opacity: 0;
  }

  .track-item:hover .add-playlist-btn {
    opacity: 1;
  }

  .add-playlist-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 300;
    animation: fadeIn 0.15s ease-out;
  }

  .modal-content {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg, 12px);
    padding: var(--space-xl);
    min-width: 360px;
    max-width: 480px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .modal-content h3 {
    font-family: var(--font-label);
    font-size: 18px;
    font-weight: 600;
    margin-bottom: var(--space-md);
  }

  .import-source {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-secondary);
    margin-bottom: var(--space-md);
  }

  .import-label {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    margin-bottom: 4px;
    display: block;
  }

  .import-input {
    width: 100%;
    background: var(--tune-grey2);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: var(--space-sm) var(--space-md);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
  }

  .import-input:focus {
    border-color: var(--tune-accent);
  }

  .import-done {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
  }

  .import-done h3 {
    margin-bottom: 0;
  }

  .import-done p {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-secondary);
  }

  .spinner-small {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  /* Utility */
  .loading-fullscreen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 80px 20px;
    animation: fadeIn 0.3s ease-out;
  }

  .spinner-large {
    width: 48px;
    height: 48px;
    border: 3px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .loading-label {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-accent);
    animation: pulse 1.5s ease-in-out infinite;
  }

  .loading-count {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .loading {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    padding: var(--space-xl);
    justify-content: center;
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .empty {
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    text-align: center;
    padding: var(--space-2xl);
  }

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Transfer & Compare buttons */
  .transfer-btn,
  .compare-btn {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-secondary);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: all 0.12s ease-out;
  }

  .transfer-btn:hover {
    border-color: #1DB954;
    color: #1DB954;
  }

  .compare-btn:hover {
    border-color: #4285F4;
    color: #4285F4;
  }

  /* Wide modal for transfer & diff */
  .modal-wide {
    min-width: 400px;
    max-width: 720px;
    max-height: 80vh;
    overflow-y: auto;
  }

  /* Transfer report */
  .transfer-summary {
    display: flex;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
    flex-wrap: wrap;
  }

  .summary-stat {
    font-family: var(--font-label);
    font-size: 14px;
    font-weight: 600;
    padding: 4px 12px;
    border-radius: 16px;
    border: 2px solid transparent;
    cursor: pointer;
    transition: all 0.15s;
  }
  .summary-stat.active {
    border-color: currentColor;
    transform: scale(1.1);
    box-shadow: 0 0 8px currentColor;
  }
  .summary-stat:hover { transform: scale(1.05); }

  .summary-stat.matched {
    background: rgba(29, 185, 84, 0.15);
    color: #1DB954;
  }

  .summary-stat.approximate {
    background: rgba(255, 152, 0, 0.15);
    color: #FF9800;
  }

  .summary-stat.not-found {
    background: rgba(244, 67, 54, 0.15);
    color: #F44336;
  }

  .transfer-tracks {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 450px;
    overflow-y: auto;
    margin-bottom: var(--space-md);
  }

  .transfer-track-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    font-family: var(--font-body);
    font-size: 13px;
  }

  .transfer-track-row.status-matched {
    background: rgba(29, 185, 84, 0.06);
  }

  .transfer-track-row.status-approximate {
    background: rgba(255, 152, 0, 0.06);
  }

  .transfer-track-row.status-not_found {
    background: rgba(244, 67, 54, 0.06);
  }

  .transfer-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-matched .transfer-status-dot {
    background: #1DB954;
  }

  .status-approximate .transfer-status-dot {
    background: #FF9800;
  }

  .status-not_found .transfer-status-dot {
    background: #F44336;
  }

  .transfer-track-title {
    font-weight: 600;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .transfer-track-artist {
    color: var(--tune-text-secondary);
    flex-shrink: 0;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .transfer-track-status {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    flex-shrink: 0;
    color: var(--tune-text-muted);
  }

  /* Transfer track info wrapper (replaces inline layout for alternatives support) */
  .transfer-track-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .transfer-track-main {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .transfer-match-info {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    padding-left: 4px;
  }

  .match-label {
    color: var(--tune-text-muted);
    font-family: var(--font-label);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .match-title {
    font-weight: 500;
    color: var(--tune-text-secondary);
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .match-artist {
    color: var(--tune-text-muted);
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .match-score {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    color: #FF9800;
    flex-shrink: 0;
  }

  .alt-toggle {
    background: none;
    border: none;
    color: var(--tune-accent);
    font-family: var(--font-body);
    font-size: 12px;
    cursor: pointer;
    padding: 2px 4px;
    text-align: left;
    transition: color 0.12s;
  }

  .alt-toggle:hover {
    color: var(--tune-accent-hover);
    text-decoration: underline;
  }

  .alternatives {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 0 2px 4px;
  }

  .alt-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: 4px 8px;
    background: var(--tune-grey2);
    border-radius: var(--radius-sm);
    font-size: 12px;
  }

  .alt-title {
    font-weight: 600;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .alt-artist {
    color: var(--tune-text-secondary);
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .alt-score {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    color: #FF9800;
    flex-shrink: 0;
    min-width: 32px;
    text-align: right;
  }

  .alt-pick {
    padding: 3px 10px;
    background: var(--tune-accent);
    border: none;
    color: white;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    transition: background 0.12s ease-out;
    margin-left: auto;
  }

  .alt-pick:hover {
    background: var(--tune-accent-hover);
  }

  .status-matched .transfer-track-status {
    color: #1DB954;
  }

  .status-approximate .transfer-track-status {
    color: #FF9800;
  }

  .status-not_found .transfer-track-status {
    color: #F44336;
  }

  /* Diff report */
  .diff-report h3 {
    margin-bottom: var(--space-md);
  }

  .diff-columns {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
  }

  .diff-column {
    min-width: 0;
  }

  .diff-col-header {
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-sm);
  }

  .source-header {
    background: rgba(244, 67, 54, 0.1);
    color: #F44336;
  }

  .both-header {
    background: rgba(29, 185, 84, 0.1);
    color: #1DB954;
  }

  .target-header {
    background: rgba(33, 150, 243, 0.1);
    color: #2196F3;
  }

  .diff-track-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 350px;
    overflow-y: auto;
  }

  .diff-track {
    padding: 5px 10px;
    border-radius: var(--radius-sm);
    font-family: var(--font-body);
    font-size: 12px;
  }

  .diff-track.source-only {
    background: rgba(244, 67, 54, 0.05);
  }

  .diff-track.in-both {
    background: rgba(29, 185, 84, 0.05);
  }

  .diff-track.in-both.approximate {
    background: rgba(255, 152, 0, 0.05);
  }

  .diff-track.target-only {
    background: rgba(33, 150, 243, 0.05);
  }

  .diff-track-title {
    display: block;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .diff-track-artist {
    display: block;
    color: var(--tune-text-secondary);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .diff-quality-badge {
    display: inline-block;
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 600;
    color: #FF9800;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .diff-empty {
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    font-size: 12px;
    text-align: center;
    padding: var(--space-md);
  }

  /* Select styling */
  select.import-input {
    appearance: none;
    -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    padding-right: 30px;
    cursor: pointer;
  }

  /* Recover button */
  .recover-btn {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-secondary);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: all 0.12s ease-out;
  }

  .recover-btn:hover {
    border-color: #FF9800;
    color: #FF9800;
  }

  /* Recover report */
  /* #1076 — le compte rendu de la dernière application. */
  .recover-msg {
    margin-bottom: var(--space-md);
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--border-color);
    font-size: 13px;
    line-height: 1.5;
  }

  .recover-tracks {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 400px;
    overflow-y: auto;
    margin-bottom: var(--space-md);
  }

  .recover-track-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    font-family: var(--font-body);
    font-size: 13px;
  }

  .recover-track-row.status-approximate {
    background: rgba(255, 152, 0, 0.06);
  }

  .recover-track-row.status-not_found {
    background: rgba(244, 67, 54, 0.06);
  }

  .recover-track-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .recover-source-label {
    font-family: var(--font-label);
    font-size: 10px;
    color: var(--tune-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .recover-alternatives {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex-shrink: 0;
  }

  .recover-alt-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: 4px 8px;
    background: var(--tune-grey2);
    border-radius: var(--radius-sm);
    font-size: 12px;
  }

  .recover-alt-title {
    font-weight: 600;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recover-alt-artist {
    color: var(--tune-text-secondary);
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recover-apply-btn {
    padding: 3px 10px;
    background: var(--tune-accent);
    border: none;
    color: white;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 11px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
    transition: background 0.12s ease-out;
  }

  .recover-apply-btn:hover {
    background: var(--tune-accent-hover);
  }

  .recover-apply-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .recover-no-alt {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    color: #F44336;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    flex-shrink: 0;
  }

  @media (max-width: 600px) {
    .diff-columns {
      grid-template-columns: 1fr;
    }
    .modal-wide {
      min-width: unset;
      max-width: 95vw;
    }
    .recover-track-row {
      flex-direction: column;
    }
  }

  /* Collaborative playlists */
  .collab-create-form {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 16px;
  }

  .collab-create-form input {
    flex: 1;
    max-width: 300px;
    padding: 8px 12px;
    border: 1px solid var(--tune-border);
    border-radius: 8px;
    background: var(--tune-surface);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
    outline: none;
  }

  .collab-create-form input:focus {
    border-color: var(--tune-accent);
  }

  .collab-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .collab-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px;
    border-radius: 8px;
    transition: background 0.12s;
  }

  .collab-row:hover {
    background: var(--tune-surface-hover);
  }

  .collab-row.active {
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.08);
  }

  .collab-row-btn {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    background: none;
    border: none;
    padding: 8px;
    cursor: pointer;
    color: var(--tune-text);
    text-align: left;
  }

  .collab-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
  }

  .collab-count {
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--tune-text-muted);
    margin-left: auto;
  }

  .collab-tracks-section {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--tune-border);
  }

  .collab-tracks-section h4 {
    font-size: 14px;
    font-weight: 600;
    color: var(--tune-text);
    margin-bottom: 8px;
  }

  .collab-tracks-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .collab-track-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 8px;
    border-radius: 4px;
    transition: background 0.12s;
  }

  .collab-track-row:hover {
    background: var(--tune-surface-hover);
  }

  .collab-track-num {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    min-width: 24px;
    text-align: right;
  }

  .collab-track-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
    min-width: 0;
  }

  .collab-track-title {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    color: var(--tune-text);
  }

  .collab-track-artist {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
  }

  .collab-track-dur {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .btn-danger {
    background: #ef4444 !important;
    color: white !important;
  }

  .btn-danger:hover {
    background: #dc2626 !important;
  }

  /* Quick Transfer section */
  .qt-section {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 24px;
  }

  .qt-section h3 {
    font-size: 16px;
    font-weight: 700;
    color: var(--tune-text);
    margin: 0 0 4px;
  }

  .qt-hint {
    font-size: 13px;
    color: var(--tune-text-muted);
    margin: 0 0 16px;
  }

  .qt-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .qt-row {
    display: flex;
    align-items: flex-end;
    gap: 12px;
  }

  .qt-arrow {
    color: var(--tune-text-muted);
    padding-bottom: 6px;
    flex-shrink: 0;
  }

  .qt-playlist-row {
    display: flex;
    gap: 12px;
    align-items: flex-end;
  }

  .qt-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }

  .qt-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--tune-text-muted);
  }

  .qt-select {
    padding: 8px 12px;
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: 8px;
    color: var(--tune-text);
    font-size: 13px;
    outline: none;
    width: 100%;
  }

  .qt-select:focus {
    border-color: var(--tune-accent);
  }

  .qt-select:disabled {
    opacity: 0.5;
  }

  .qt-input {
    padding: 8px 12px;
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: 8px;
    color: var(--tune-text);
    font-size: 13px;
    outline: none;
    width: 100%;
  }

  .qt-input:focus {
    border-color: var(--tune-accent);
  }

  .qt-loading {
    padding: 8px;
    display: flex;
    justify-content: center;
  }

  .qt-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 4px;
  }

  .qt-transfer-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 20px;
    font-size: 14px;
  }

  /* Quick Transfer result */
  .qt-result {
    margin-top: 4px;
  }

  .qt-result-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .qt-result-header h4 {
    font-size: 14px;
    font-weight: 600;
    color: var(--tune-text);
    margin: 0;
  }

  .btn-sm-action {
    font-size: 11px;
    padding: 5px 10px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .qt-tracks {
    max-height: 400px;
    overflow-y: auto;
  }

  .qt-history-section {
    margin-top: 8px;
  }

  /* Responsive Quick Transfer */
  @media (max-width: 768px) {
    .qt-row {
      flex-direction: column;
      align-items: stretch;
    }

    .qt-arrow {
      display: none;
    }

    .qt-playlist-row {
      flex-direction: column;
    }
  }

  /* ── La grille de playlists (maquette Levente, 20/09/2026) ─────────────
     Elle remplace `.playlist-list`. Cartes de 168 px minimum : en dessous,
     un nom de playlist sur deux se coupe au milieu d'un mot. */
  .pl-grille{display:grid; grid-template-columns:repeat(auto-fill, minmax(168px, 1fr));
    gap:18px; padding:4px 0}
  .pl-carte{display:flex; flex-direction:column; gap:8px;
    border-radius:12px; transition:opacity .15s}
  /* La boîte de référence des quatre coins : exactement la pochette. */
  .pl-vignette{position:relative; width:100%; aspect-ratio:1}
  .pl-pochette{width:100%; height:100%; border:0; padding:0;
    border-radius:10px; overflow:hidden; cursor:pointer; background:var(--tune-surface);
    display:block}
  .pl-carte.cochee .pl-pochette{box-shadow:0 0 0 2px var(--tune-accent)}
  .pl-pochette:focus-visible{outline:2px solid var(--tune-accent); outline-offset:2px}
  .pl-vide{display:grid; place-items:center; width:100%; height:100%; color:var(--tune-text-muted)}
  .pl-vide svg{width:34px; height:34px}

  /* Le coin de sélection : posé SUR la pochette, en bas à gauche. */
  .pl-coin{position:absolute; left:8px; bottom:8px; width:26px; height:26px;
    display:grid; place-items:center; border-radius:7px; cursor:pointer;
    border:1px solid var(--tune-border); background:var(--tune-bg); color:transparent;
    opacity:0; transition:opacity .12s}
  .pl-carte:hover .pl-coin, .pl-coin:focus-visible, .pl-coin.on{opacity:1}
  .pl-coin.on{background:var(--tune-accent); border-color:var(--tune-accent); color:#fff}
  .pl-coin:disabled{cursor:default}
  .pl-texte{display:flex; flex-direction:column; gap:3px; min-width:0}
  .pl-nom{font-size:13px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .pl-compte{font-size:11.5px; color:var(--tune-text-secondary)}
  .pl-badge{align-self:flex-start; font-size:9.5px; letter-spacing:.06em; text-transform:uppercase;
    border:1px solid; border-radius:4px; padding:1px 6px}
  .pl-actions{display:flex; gap:6px; opacity:0; transition:opacity .12s}
  .pl-carte:hover .pl-actions, .pl-actions:focus-within{opacity:1}
  .pl-actions button{width:26px; height:26px; display:grid; place-items:center; border-radius:7px;
    border:1px solid var(--tune-border); background:transparent; color:var(--tune-text-secondary);
    cursor:pointer}
  .pl-actions button:hover{color:var(--tune-text)}
  .pl-actions button.danger:hover{color:var(--tune-danger); border-color:var(--tune-danger)}
  .merge-hint{margin:6px 0 0; font-size:11.5px; color:var(--tune-text-secondary)}
  /* Le geste destructeur de la barre : lisible, mais jamais aussi présent que
     la fusion — c'est elle qu'on vient faire ici. */
  .fusion-absents{margin:0 0 10px; padding:8px 12px; border-radius:8px;
    border:1px solid var(--tune-border); background:var(--tune-bg-elevated, transparent);
    font-size:12.5px}
  .fusion-absents summary{cursor:pointer; color:var(--tune-warning)}
  .fusion-absents ul{margin:8px 0 0; padding:0 0 0 16px; max-height:220px; overflow:auto}
  .fusion-absents li{margin:2px 0; color:var(--tune-text-secondary)}
  .fa-titre{color:var(--tune-text)}
  .fa-artiste{margin-left:6px}
  .fa-artiste::before{content:"— "}
  .fa-service{margin-left:6px; opacity:.7}
  .fa-service::before{content:"· "}
  .merge-cible{display:flex; align-items:center; gap:6px; font-size:12.5px;
    color:var(--tune-text-secondary); white-space:nowrap}
  .merge-select{padding:6px 8px; border-radius:7px; border:1px solid var(--tune-border);
    background:var(--tune-bg); color:var(--tune-text); font-size:12.5px; cursor:pointer}
  .danger-btn{padding:7px 14px; border-radius:8px; cursor:pointer;
    border:1px solid var(--tune-danger); background:transparent;
    color:var(--tune-danger); font-size:13px}
  .danger-btn:hover:not(:disabled){background:var(--tune-danger); color:#fff}
  .danger-btn:disabled{opacity:.5; cursor:default}

  /* Les trois autres coins (maquette Levente). Même révélation au survol que
     le coin de sélection, et mêmes cibles de 26 px. */
  .pl-coin-hg, .pl-coin-hd, .pl-coin-bd{position:absolute; width:26px; height:26px;
    display:grid; place-items:center; border-radius:7px; cursor:pointer;
    border:1px solid var(--tune-border); background:var(--tune-bg);
    color:var(--tune-text-secondary); opacity:0; transition:opacity .12s}
  .pl-coin-hg{left:8px; top:8px}
  .pl-coin-hd{right:8px; top:8px}
  .pl-coin-bd{right:8px; bottom:8px}
  .pl-carte:hover .pl-coin-hg,
  .pl-carte:hover .pl-coin-hd,
  .pl-carte:hover .pl-coin-bd,
  .pl-coin-hd:focus-visible, .pl-coin-bd:focus-visible{opacity:1}
  .pl-coin-hg:focus-within{opacity:1}
  .pl-coin-hd:hover, .pl-coin-bd:hover{color:var(--tune-text)}

  /* Piste indisponible chez le service : grisée, étiquetée, inerte. Même
     traitement que `LignePisteV2` — une seule apparence pour un seul fait. */
  .track-item.indispo{opacity:.5}
  .track-item.indispo .track-play{cursor:default}
  .track-indispo{font-size:10px; letter-spacing:.04em; text-transform:uppercase;
    color:var(--tune-text-muted); border:1px solid var(--tune-border);
    border-radius:4px; padding:1px 6px; white-space:nowrap}

  /* Le message de coupure premium d'un onglet. */
  .pm-premium{margin:0; padding:22px; text-align:center; color:var(--tune-text-secondary);
    font-size:13px; line-height:1.7; border:1px dashed var(--tune-border); border-radius:10px}

  /* Le cinquième appel à l'action : lire, au CENTRE de la pochette. */
  .pl-lire{position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
    width:44px; height:44px; display:grid; place-items:center; border-radius:50%;
    border:0; cursor:pointer; background:var(--tune-accent); color:var(--tune-bg);
    opacity:0; transition:opacity .12s}
  .pl-carte:hover .pl-lire, .pl-lire:focus-visible{opacity:1}
  .pl-lire:hover{filter:brightness(1.08)}
</style>
