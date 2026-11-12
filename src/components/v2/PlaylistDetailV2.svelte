<script lang="ts">
  import { notifierErreur } from '../../lib/notifierErreur';
  import { untrack } from 'svelte';
  import { ouvertureAlbumDePiste } from '../../lib/lienAlbumDePiste';
  import { gestesNavigationService } from '../../lib/stores/navigation';
  /**
   * Fiche playlist du nouveau client (direction Levente). Ouvre par-dessus la
   * grille (la section hôte est `position:relative`). Gère deux natures :
   *   - locale    : pistes via getPlaylistTracks ; l'Expert peut renommer,
   *                 supprimer la playlist et retirer un titre.
   *   - streaming : pistes du service (lecture seule), lues via son id source.
   * Détail technique (fréquence/profondeur) réservé à l'Expert, comme ailleurs.
   */
  import * as api from '../../lib/api';
  import { ligneBadgeCercles } from '../../lib/suiviCercle';
  import { creerRetraitPlaylist } from '../../lib/retraitPlaylist';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { lireListeAleatoire } from '../../lib/lectureEnMasse';
  import { t as tr } from '../../lib/i18n';
  import { currentZoneId, playAndSync } from '../../lib/stores/zones';
  // Un échec de lecture DOIT se voir : ces appels finissaient tous par un
  // `.catch(() => {})` (#3732). Le message du serveur — qui nomme l'appareil
  // manquant — n'atteignait jamais l'écran.
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import { formatDuration, errText } from '../../lib/utils';
  import type { Track, Playlist, StreamingPlaylist } from '../../lib/types';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import ListePistesV2 from './ListePistesV2.svelte';
  import BoutonLectureV2 from './BoutonLectureV2.svelte';
  import BoutonMenuV2 from './BoutonMenuV2.svelte';
  import type { EntreeMenu } from '../../lib/menuPiste';
  import { lireListe, lireListeDepuis } from '../../lib/lectureEnMasse';
  import { pisteIndisponible } from '../../lib/albumAParaitre';
  import { rangLireEnsuite } from '../../lib/stores/queue';
  import { lireChoix, ecrireChoix } from '../../lib/preferencesEcran';
  import {
    BORNES_TAILLE, bornerTaille, clePlaylistVue, lireVuePlaylist, ecrireVuePlaylist, lireTaille, ecrireTaille,
    lireEnteteCompact, ecrireEnteteCompact, type VuePlaylist,
  } from '../../lib/vuePlaylist';
  import { CLES_TRI_PISTES, LIBELLES_TRI_PISTES, trierPistes, type CleTriPistes, type SensTriPistes } from '../../lib/trierPistes';
  import { favoritePlaylistIds, favoriteStreamingKeys, streamingFavKey } from '../../lib/stores/profile';
  import { basculerFavoriLocal } from '../../lib/favorisLocaux';
  import { toggleStreamingFavorite } from '../../lib/streamingFavorites';
  import { notifications } from '../../lib/stores/notifications';
  import { cibleEtiquettePlaylist, type CibleEtiquette } from '../../lib/cibleEtiquette';
  import { rangsApresDeplacement } from '../../lib/playlistService';
  import RemplacerIndisponibleModale from './RemplacerIndisponibleModale.svelte';
  import {
    aDesIndisponibles, peutRemplacer, remplacer, reparer,
    type CandidatRemplacement, type CiblePlaylist, type IssueRemplacement, type RapportReparation,
  } from '../../lib/remplacementIndisponibles';
  import { corpsDeFileListe, estPisteLocale } from '../../lib/pisteFile';
  import { estIntrouvable } from '../../lib/pisteIntrouvable';
  import { estLigneRadio, radioIndisponible, sansRadios } from '../../lib/lignePlaylistRadio';
  import ChoixRadioPlaylistV2 from './ChoixRadioPlaylistV2.svelte';
  import { gestesObjet, objetPlaylist } from '../../lib/gestesObjet';
  import { circleCharge } from '../../lib/circle';

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

  /**
   * web#2549 (alec_eiffel, fil 2561) : « can't share Qobuz Playlists ». Le
   * partage d'une playlist de service avec un cercle existait, mais SEULEMENT
   * dans le menu « … » de sa vignette : la fiche ouverte n'en disait rien, et
   * c'est là qu'on le cherche. Le bouton reprend le geste du menu
   * (`gestesObjet(...).partagerAvecUnCercle`), sans second chemin : même
   * fenêtre, même copie par références, playlist locale suivie comme avant.
   */
  const partagerAvecUnCercle = $derived(
    $circleCharge
      ? gestesObjet(item.kind === 'streaming' ? objetPlaylist(item.pl, item.service) : objetPlaylist(item.pl)).partagerAvecUnCercle
      : undefined,
  );
  /**
   * web#2098 (FabienM, fil 2236, point 10) — une playlist DE SERVICE dont
   * l'utilisateur est propriétaire : on peut en retirer un titre. Seulement
   * quand le serveur l'affirme (`editable: true`, web#2097) ; absent ou faux
   * (playlist suivie, éditoriale, serveur plus ancien) : lecture seule.
   */
  const aMoiChezLeService = $derived(
    item.kind === 'streaming' && (item.pl as StreamingPlaylist & { editable?: boolean | null }).editable === true,
  );
  const editable = $derived(isLocal || aMoiChezLeService);

  /**
   * web#2736 — le menu « … » de la fiche : les gestes qui étaient des boutons
   * de l'en-tête, chacun sous SA garde d'avant (absent quand il ne s'applique
   * pas, jamais grisé sauf pendant sa requête).
   */
  function supprimerPlaylist() {
    if (item.kind === 'local' && item.pl.id != null) api.deletePlaylist(item.pl.id).then(() => { onChanged?.(); onClose(); }).catch(() => {});
  }
  function entreesPlus(): EntreeMenu[] {
    const l: EntreeMenu[] = [];
    if (cibleEtiquettes) l.push({ cle: 'v2.cover.tags', faire: () => (etiquettesOuvertes = true),
      attrs: { 'data-etiquettes-playlist': true, 'aria-haspopup': 'dialog' } });
    const partager = partagerAvecUnCercle;
    if (partager) l.push({ cle: 'v2.circle.pl.shareWithCircle', faire: () => partager(), attrs: { 'data-partager-cercle': true } });
    // EXPORT : la route ne connaît que les playlists locales.
    if (isLocal) l.push({ cle: 'v2.pl.export', desactive: exportEnCours, faire: () => void exporter(), attrs: { 'data-exporter-playlist': true } });
    // tune-server-rust#8066 — seulement s'il y a des titres indisponibles là où l'on peut écrire.
    if (reparable) l.push({ cle: reparationEnCours ? 'v2.pl.repairRunning' : 'v2.pl.repair', desactive: reparationEnCours,
      faire: () => void reparerPlaylist(), attrs: { 'data-reparer-playlist': true } });
    // #2098 — une playlist de SERVICE ne s'édite que si l'utilisateur en est propriétaire.
    if (editable) l.push({ cle: edition ? 'v2.pl.editDone' : 'v2.pl.edit',
      faire: () => { edition = !edition; renaming = false; }, attrs: { 'data-editer-playlist': true } });
    if (edition && isLocal) {
      l.push({ cle: 'v2.pl.rename', faire: () => { draft = item.pl.name; renaming = true; }, attrs: { 'data-renommer-playlist': true } });
      l.push({ cle: 'common.delete', danger: true, faire: supprimerPlaylist, attrs: { 'data-supprimer-playlist': true } });
    }
    return l;
  }
  const title = $derived(item.pl.name);
  /** web#2806 — le sélecteur de radio de l'éditeur est ouvert. */
  let choixRadio = $state(false);

  /**
   * ÉTIQUETER LA PLAYLIST DEPUIS SA FICHE — le même trou que la fiche album.
   *
   * La vignette de `PlaylistsV2` porte le bouton depuis #1238 (`pl.id != null`) ;
   * la fiche, elle, n'avait ni bouton ni panneau. `playlist` fait partie des
   * quatre `TAGGABLE_ITEM_TYPES` du serveur, pour les DEUX espaces.
   *
   * Locale → son identifiant. De service → la paire `source` + `source_id`,
   * par l'aide partagée. `source` retombe sur le service de l'item : une
   * `StreamingPlaylist` le porte, mais le laisser deviner évite le cas où la
   * liste vient d'une réponse qui ne l'a pas recopié.
   *
   * `null` — donc pas de bouton — pour une playlist locale sans identifiant :
   * il n'y a alors rien à désigner.
   */
  const cibleEtiquettes = $derived<CibleEtiquette | null>(
    item.kind === 'local'
      ? item.pl.id != null
        ? { itemType: 'playlist', itemId: item.pl.id }
        : null
      : cibleEtiquettePlaylist(item.pl, item.service),
  );
  let etiquettesOuvertes = $state(false);

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

  /** La liste mêle-t-elle des provenances ? (#4889 : Tune + services.) */
  const mixte = $derived(new Set(tracks.map((t) => (estPisteLocale(t) ? 'local' : String(t.source ?? '')))).size > 1);
  const totalMs = $derived(tracks.reduce((s, t) => s + (t.duration_ms ?? 0), 0));

  /**
   * TRI des pistes — Bertrand, 17/09/2026 (voir `lib/trierPistes`). Mémorisé
   * par écran. `ordre` = l'ordre de la playlist, le seul où déplacer une piste
   * a un sens : hors de lui, les flèches de déplacement sont désactivées.
   */
  let triPistes = $state<CleTriPistes>(lireChoix<CleTriPistes>('v2.playlist.pistes.tri', CLES_TRI_PISTES, 'ordre'));
  let sensPistes = $state<SensTriPistes>(lireChoix<SensTriPistes>('v2.playlist.pistes.sens', ['asc', 'desc'], 'asc'));
  $effect(() => { ecrireChoix('v2.playlist.pistes.tri', triPistes); });
  $effect(() => { ecrireChoix('v2.playlist.pistes.sens', sensPistes); });
  /**
   * web#2601 — vue en liste ou en pochettes, taille des vignettes de CHAQUE
   * vue, en-tête compact. Retenus, mais écrits sur geste seulement (#1650).
   */
  // tune-server-rust#7394 / web#2618 — retenue PAR PLAYLIST (`clePlaylistVue`).
  const cleVue = $derived(clePlaylistVue(item));
  let vue = $state<VuePlaylist>(lireVuePlaylist(clePlaylistVue(untrack(() => item))));
  // Une autre playlist dans le même écran : sa vue à elle.
  let cleVueLue = clePlaylistVue(untrack(() => item));
  $effect(() => {
    const c = cleVue;
    if (c === cleVueLue) return;
    cleVueLue = c;
    vue = lireVuePlaylist(c);
  });
  let tailleListe = $state(lireTaille('liste'));
  let taillePochettes = $state(lireTaille('pochettes'));
  let enteteCompact = $state(lireEnteteCompact());
  const tailleCourante = $derived(vue === 'liste' ? tailleListe : taillePochettes);
  function choisirVue(v: VuePlaylist) { vue = v; ecrireVuePlaylist(v, cleVue); }
  function regler(n: number) {
    const v = ecrireTaille(vue, n);
    if (vue === 'liste') tailleListe = v; else taillePochettes = bornerTaille('pochettes', v);
  }
  function basculerEntete() { enteteCompact = !enteteCompact; ecrireEnteteCompact(enteteCompact); }

  const pistesVues = $derived(trierPistes(tracks, triPistes, sensPistes));
  const ordreNaturel = $derived(triPistes === 'ordre' && sensPistes === 'asc');
  /** L'index d'une piste AFFICHÉE dans la liste réelle — les routes d'écriture
   *  parlent en rangs de la playlist, pas en rangs d'affichage. */
  const rangReel = (t: Track) => tracks.indexOf(t);

  /**
   * « Lecture aleatoire » de la liste — #1947.
   *
   * Aucune portee serveur ici : `api.shuffleAll` connait album, artiste, genre
   * et repertoire, pas les listes de lecture. On melange donc la liste qu'on a,
   * avec le SEUL melange du depot (`lib/shuffle`, Fisher-Yates), et on l'envoie.
   * Le drapeau `shuffle` de la zone n'est pas touche.
   */
  let melangeEnCours = $state(false);
  /**
   * tune-server-rust#6465 (FabienM, fil 2379, point 1) — « Playlist avec
   * lecture aléatoire → dans l'historique on n'a pas le conteneur playlist ».
   * La liste part en `track_ids` ou en tête + suite, et rien dans ces corps
   * ne dit qu'elle vient d'une playlist : le serveur écrivait des titres nus.
   * La playlist s'ÉNONCE donc, sur la lecture comme sur la file, avec son
   * espace de noms (`context_source`) : le service du titre de tête n'est pas
   * celui d'une playlist de la bibliothèque qui mêle des titres Qobuz.
   */
  function conteneur() {
    return item.kind === 'local'
      ? { context_type: 'playlist' as const, context_id: String(item.pl.id), context_source: 'local' }
      : { context_type: 'playlist' as const, context_id: String(item.pl.source_id), context_source: item.service };
  }
  function gestesDeLaPlaylist(zid: number, shuffled = false) {
    const c = conteneur();
    return {
      lire: (corps: any) => playAndSync(zid, { ...corps, ...c, ...(shuffled ? { context_shuffle: true } : {}) }),
      enfiler: (corps: any) => api.addToQueue(zid, { ...corps, ...c }),
    };
  }
  async function lireAleatoire() {
    const zid = zoneRequise();
    if (zid == null) return;
    melangeEnCours = true;
    try {
      // web#2806 — une radio ne part pas en piste : le mélange client la laisse.
      const n = await lireListeAleatoire(tracks.filter((p) => !estLigneRadio(p)), gestesDeLaPlaylist(zid, true));
      if (!n) notifications.error($tr('library.noTracks'));
    } catch (e) {
      notifierErreur($tr('common.error'), e, { motifSeul: true });
    }
    melangeEnCours = false;
  }
  function playFrom(startIndex = 0) {
    const zid = zoneRequise();
    if (zid == null) return;
    // web#2806 — une ligne RADIO se lit par la playlist (`playlist_id` +
    // son rang RÉEL) : seul le serveur sait mettre son flux en file.
    const cliquee = pistesVues[startIndex];
    if (item.kind === 'local' && cliquee && estLigneRadio(cliquee)) {
      if (radioIndisponible(cliquee)) return;
      playAndSync(zid, { playlist_id: item.pl.id as number, start_index: rangReel(cliquee) }).catch(signalerEchecLecture);
      return;
    }
    // Liste TRIÉE : « lire depuis ici » suit l'ordre affiché, pas celui de la
    // playlist — `start_index` du serveur ne connaît que ce dernier. Les
    // radios n'y vont pas : elles ne s'envoient pas en pistes.
    if (!ordreNaturel) {
      const pistes = sansRadios(pistesVues.slice(startIndex));
      if (!pistes.length) { notifications.error($tr('library.noTracks')); return; }
      void lireListe(pistes, gestesDeLaPlaylist(zid)).catch(signalerEchecLecture);
      return;
    }
    if (item.kind === 'local') {
      playAndSync(zid, { playlist_id: item.pl.id as number, start_index: startIndex }).catch(signalerEchecLecture);
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
      //
      // web#2687 — playlist MIXTE (titres « Indisponible » / « À paraître ») :
      // `streaming_playlist_id` mettrait toute la liste en file. On envoie la
      // liste nous-mêmes, sans les titres grisés, dans le contexte de la playlist.
      if (pistesVues.some(pisteIndisponible)) {
        void lireListeDepuis(pistesVues, startIndex, gestesDeLaPlaylist(zid)).catch(signalerEchecLecture);
        return;
      }
      playAndSync(zid, { streaming_playlist_id: item.pl.source_id, source: item.service as any, start_index: startIndex }).catch(signalerEchecLecture);
    }
  }
  /**
   * Les deux boutons de file — « Lire ensuite » (#1574, FabienM, fil 1924) et
   * « Ajouter à la file » —, le même geste que la fiche album : UNE requête,
   * la liste entière, avec ou sans rang.
   *
   * 🔴 `corpsDeFileListe`, pas `track_ids` seuls. « Ajouter à la file »
   * n'envoyait que les pistes portant un `id` local : sur une playlist de
   * SERVICE (Qobuz, Tidal…), dont les pistes n'en ont pas, il n'envoyait rien,
   * et sans un mot. Les pistes locales partent en `track_ids`, celles de
   * service en `tracks[]` (paire `source` + `source_id`), dans le même
   * `insert_at` côté serveur — une playlist mixte garde son ordre.
   *
   * L'ordre envoyé est celui AFFICHÉ (`pistesVues`), comme « Lire » sur une
   * liste triée.
   */
  let fileOccupee = $state(false);
  async function enfiler(position: number | undefined, cle: string) {
    const zid = zoneRequise();
    if (zid == null || fileOccupee) return;
    // web#2806 — les radios restent hors de la file : ce ne sont pas des pistes.
    const corps = corpsDeFileListe(sansRadios(pistesVues), position);
    if (!corps) { notifications.error($tr('library.noTracks')); return; }
    fileOccupee = true;
    try {
      await api.addToQueue(zid, corps);
      notifications.success($tr(cle as any).replace('{title}', title ?? ''));
    } catch {
      notifications.error($tr('v2.pa.queueError' as any));
    }
    fileOccupee = false;
  }
  const addQueue = () => enfiler(undefined, 'v2.album.queued');
  /** « Lire ensuite » : toute la playlist, juste après le titre en cours. */
  const lireEnsuite = () => enfiler(rangLireEnsuite(), 'v2.album.queuedNext');
  function commitRename() {
    if (item.kind !== 'local' || item.pl.id == null) { renaming = false; return; }
    const name = draft.trim();
    if (!name || name === item.pl.name) { renaming = false; return; }
    api.updatePlaylist(item.pl.id, { name })
      .then(() => { item.pl.name = name; onChanged?.(); })
      .catch(() => {})
      .finally(() => { renaming = false; });
  }
  /**
   * web#2286 — la ligne par `entry_id`, un retrait à la fois, puis relecture
   * (`lib/retraitPlaylist`, partagé avec `PlaylistManagerView`).
   */
  const retraitPlaylist = creerRetraitPlaylist({
    retirer: (id, cible) => api.removePlaylistEntry(id, cible),
    relire: (id) => api.getPlaylistTracks(id),
  });
  let retraitEnCours = $state(false);
  async function removeAt(i: number) {
    if (item.kind !== 'local' || item.pl.id == null || retraitPlaylist.enCours) return;
    retraitEnCours = true;
    const issue = await retraitPlaylist.retirer(item.pl.id as number, tracks, i);
    retraitEnCours = false;
    if (!issue) return;
    tracks = issue.pistes;
    if (issue.ok) onChanged?.();
  }

  /** Retire un titre de la playlist du service (#2098) — toutes ses occurrences. */
  let retraitService = $state(false);
  async function retirerDuService(t: Track) {
    if (item.kind !== 'streaming' || !aMoiChezLeService || retraitService || t.source_id == null) return;
    const service = item.service;
    const sid = String(t.source_id);
    retraitService = true;
    try {
      await api.removeStreamingPlaylistTracks(service, String(item.pl.source_id), [sid]);
      tracks = tracks.filter((x) => String(x.source_id) !== sid);
      onChanged?.();
    } catch {
      notifications.error($tr('v2.pl.removeFromServiceError' as any).replace('{service}', service));
    } finally {
      retraitService = false;
    }
  }

  /* ---------------- Titres indisponibles (tune-server-rust#8066) ---------------- */
  /**
   * « Remplacer l'indisponible » et « Réparer la playlist » : un album retiré
   * puis republié par le service laisse des titres grisés. Le serveur cherche
   * la nouvelle référence sur le même service ; un seul candidat sûr est pris
   * directement, sinon la modale fait choisir. Seulement là où l'on peut
   * écrire : playlist Tune, ou playlist du service dont on est propriétaire.
   */
  const ciblePlaylist = $derived<CiblePlaylist | null>(
    item.kind === 'local'
      ? item.pl.id != null ? { kind: 'local', playlistId: item.pl.id } : null
      : { kind: 'streaming', service: item.service, playlistId: String(item.pl.source_id) },
  );
  const reparable = $derived(ciblePlaylist != null && aDesIndisponibles(tracks, editable));
  let remplacement = $state<{ piste: Track; rang: number; candidats: CandidatRemplacement[] } | null>(null);
  let rapport = $state<RapportReparation | null>(null);
  let remplacementEnCours = $state(false);
  let reparationEnCours = $state(false);

  function traiterIssue(issue: IssueRemplacement, t: Track, rang: number) {
    if (issue.etat === 'remplace') {
      remplacement = null;
      notifications.success($tr('v2.pl.replaceDone' as any).replace('{title}', t.title ?? ''));
      load();
      onChanged?.();
    } else if (issue.etat === 'choix') {
      remplacement = { piste: t, rang, candidats: issue.candidats };
    } else if (issue.etat === 'aucun') {
      notifications.info($tr('v2.pl.replaceNone' as any).replace('{title}', t.title ?? ''), 5000);
    } else {
      notifications.error(issue.message || $tr('v2.pl.replaceError' as any));
    }
  }

  async function remplacerIndisponible(t: Track) {
    const cible = ciblePlaylist;
    if (!cible || remplacementEnCours) return;
    const rang = rangReel(t);
    remplacementEnCours = true;
    try {
      traiterIssue(await remplacer(cible, t, rang), t, rang);
    } catch (e) {
      notifierErreur($tr('v2.pl.replaceError' as any), e, { motifSeul: true });
    } finally {
      remplacementEnCours = false;
    }
  }

  async function choisirRemplacant(c: CandidatRemplacement) {
    const r = remplacement;
    const cible = ciblePlaylist;
    if (!r || !cible) return;
    try {
      traiterIssue(await remplacer(cible, r.piste, r.rang, c.source_id), r.piste, r.rang);
    } catch (e) {
      notifierErreur($tr('v2.pl.replaceError' as any), e, { motifSeul: true });
    }
  }

  async function reparerPlaylist() {
    const cible = ciblePlaylist;
    if (!cible || reparationEnCours) return;
    reparationEnCours = true;
    try {
      const r = await reparer(cible);
      if ('refus' in r) {
        notifications.error(r.refus || $tr('v2.pl.replaceNotEditable' as any).replace('{service}', item.kind === 'streaming' ? item.service : ''));
      } else {
        rapport = r;
        if (r.replaced.length) { load(); onChanged?.(); }
      }
    } catch (e) {
      notifierErreur($tr('v2.pl.replaceError' as any), e, { motifSeul: true });
    } finally {
      reparationEnCours = false;
    }
  }

  /** Une ligne « à choisir » du rapport ouvre sa liste de candidats. Les
   *  remplacements gardent les rangs : le rang du rapport désigne encore la
   *  bonne ligne après rechargement. */
  function choisirDepuisRapport(l: RapportReparation['to_choose'][number]) {
    const rang = Number(item.kind === 'local' ? l.position : l.index);
    const t = item.kind === 'local'
      ? tracks.find((x) => (x as any).entry_id === l.entry_id)
      : tracks[rang];
    if (!t) return;
    rapport = null;
    remplacement = { piste: t, rang, candidats: l.candidates ?? [] };
  }

  /** Un déplacement est en cours : on n'en accepte pas un second par-dessus. */
  let deplacement = $state(false);

  /**
   * Déplace une piste d'un rang, et enregistre le nouvel ordre.
   *
   * ## Pourquoi des boutons et pas un glisser-déposer
   *
   * L'écran hérité réordonne par glisser-déposer, qui n'est atteignable ni au
   * clavier ni au lecteur d'écran. Deux boutons font le même travail, sont
   * utilisables par tout le monde, et ne demandent rien à `ListePistesV2` —
   * que six écrans partagent. Le glisser-déposer pourra s'ajouter par-dessus ;
   * l'inverse — rendre accessible un glisser-déposer déjà écrit — coûte plus.
   *
   * ## Optimiste, mais jamais menteur
   *
   * La liste bouge tout de suite, puis le serveur est prévenu. En cas d'échec,
   * l'écran hérité recharge EN SILENCE (`console.error`) : l'utilisateur voit
   * sa piste revenir à sa place sans comprendre. Ici l'échec est DIT, et la
   * liste rechargée — un écran qui ment est pire qu'un écran qui refuse.
   */
  async function deplacer(de: number, versLeBas: boolean) {
    if (item.kind !== 'local' || item.pl.id == null || deplacement) return;
    const vers = de + (versLeBas ? 1 : -1);
    if (vers < 0 || vers >= tracks.length) return;
    const avant = tracks;
    // #4889 — le nouvel ordre en RANGS ACTUELS, pas en identifiants : une
    // ligne de SERVICE (id nul) se déplace aussi, et une piste présente deux
    // fois reste deux lignes distinctes. Réassigné, jamais muté en place.
    const positions = rangsApresDeplacement(avant.length, de, vers);
    tracks = positions.map((k) => avant[k]);
    deplacement = true;
    try {
      await api.reorderPlaylistTracks(item.pl.id, positions);
      onChanged?.();
    } catch (e) {
      tracks = avant;
      notifierErreur($tr('common.error'), e, { motifSeul: true });
    } finally {
      deplacement = false;
    }
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

  <div class="head" class:compact={enteteCompact}>
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
      <!-- web#2287 — « Partagée avec un cercle » (tune-server-rust#6694, champ `cercles`). -->
      {#if isLocal}
        {@const badge = ligneBadgeCercles(item.pl, (k) => $tr(k as any))}
        {#if badge}<div class="desc badge-cercle" data-badge-cercle>{badge}</div>{/if}
      {/if}
      <div class="facts">
        <span>{$tr((tracks.length > 1 ? 'v2.common.trackCountMany' : 'v2.common.trackCountOne') as any).replace('{n}', String(tracks.length))}</span>
        {#if totalMs}<span>{formatDuration(totalMs)}</span>{/if}
      </div>
      <!-- web#2736 (Bertrand, 09/11/2026) — même principe que la fiche album :
           [ ▶ Lecture | ▾ ]  [ ⤮ ]  [ ♡ ]  [ … ]. « Lire ensuite » (#1574) et
           « Ajouter à la file » passent sous la flèche du bouton Lecture ;
           étiquettes, partage, export, réparation et édition dans « … ». -->
      <div class="actions">
        <!-- rc12 (Bertrand, 12/11/2026) : un seul bouton Play ; « Lecture
             aléatoire » passe sous la flèche, avec son `data-aleatoire-playlist`. -->
        <BoutonLectureV2 onLire={() => playFrom(0)} cle="common.play"
          aleatoire={{ faire: lireAleatoire, desactive: melangeEnCours }} attrsAleatoire={{ 'data-aleatoire-playlist': true }}
          ensuite={{ faire: lireEnsuite, desactive: fileOccupee }}
          file={{ faire: addQueue, desactive: fileOccupee }} />
        <!-- Le CŒUR : il vaut pour les deux sortes de playlist, la locale par
             son identifiant, celle d'un service par la paire service +
             `source_id`. Deux tables, deux chemins. -->
        <button class="ghost carre coeur" class:on={enFavori} onclick={basculerFavori} disabled={bascule}
          aria-pressed={enFavori}
          title={$tr(enFavori ? 'favorites.removeAlbum' : 'favorites.addAlbum')}
          aria-label={$tr(enFavori ? 'favorites.removeAlbum' : 'favorites.addAlbum')}>
          <svg viewBox="0 0 24 24" fill={enFavori ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
        <BoutonMenuV2 entrees={entreesPlus} etiquette={$tr('v2.cover.more' as any)} largeur={240}>
          {#snippet declencheur(p)}
            <button class="ghost carre plus" {...p} data-menu-playlist
              aria-label={$tr('v2.cover.more' as any)} title={$tr('v2.cover.more' as any)}>
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
            </button>
          {/snippet}
        </BoutonMenuV2>
        {#if edition}
          <!-- Le mode édition se DIT, et se quitte d'un geste : sans ce
               bouton, il faudrait rouvrir « … » pour le refermer. -->
          <button class="ghost sm" class:on={edition} onclick={() => { edition = false; renaming = false; }} aria-pressed={edition} data-fin-edition-playlist>
            {$tr('v2.pl.editDone' as any)}
          </button>
          {#if isLocal}
            <!-- web#2806 — une radio rejoint la playlist depuis l'éditeur. -->
            <button class="ghost sm" onclick={() => (choixRadio = true)} data-bouton-ajouter-radio aria-haspopup="dialog">
              {$tr('v2.pl.addRadio' as any)}
            </button>
          {/if}
        {/if}

        <!-- On DIT pourquoi il n'y a pas de bouton, au lieu de laisser chercher.
             Le client porte bien une fonction `importPlaylist`, mais elle vise
             `POST /playlists/import`, qui n'existe pas : le serveur n'a que
             `/import/m3u`, `/import/m3u-url` et `/import/linn`. Personne ne
             l'appelle. Proposer « Importer » serait un bouton mort. -->
        {#if !isLocal}
          <span class="chez">{$tr((aMoiChezLeService ? 'v2.pl.remoteOwnedHint' : 'v2.pl.remoteHint') as any).replaceAll('{service}', item.kind === 'streaming' ? item.service : '')}</span>
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
      <!-- Fabien, fil 1780 (point 12, issue #1057) : la vignette des titres
           manquait sur une playlist Qobuz en mode tableau — même règle que
           l'Historique (#3823). -->
      <div class="tri">
        <div class="vuebar">
          <div class="vues" role="group" aria-label={$tr('v2.pl.viewLabel' as any)}>
            <button type="button" class="vbtn" class:on={vue === 'liste'} aria-pressed={vue === 'liste'}
              data-vue="liste" onclick={() => choisirVue('liste')}>{$tr('v2.pl.viewList' as any)}</button>
            <button type="button" class="vbtn" class:on={vue === 'pochettes'} aria-pressed={vue === 'pochettes'}
              data-vue="pochettes" onclick={() => choisirVue('pochettes')}>{$tr('v2.pl.viewCovers' as any)}</button>
          </div>
          <label class="taille">
            <span>{$tr('v2.pl.thumbSize' as any)}</span>
            <input type="range" data-taille min={BORNES_TAILLE[vue].min} max={BORNES_TAILLE[vue].max}
              step={BORNES_TAILLE[vue].pas} value={tailleCourante}
              aria-label={$tr('v2.pl.thumbSize' as any)}
              oninput={(e) => regler(Number((e.currentTarget as HTMLInputElement).value))} />
          </label>
          <button type="button" class="vbtn basc" class:on={enteteCompact} data-entete aria-pressed={enteteCompact}
            onclick={basculerEntete}>{$tr((enteteCompact ? 'v2.pl.headerExpand' : 'v2.pl.headerCompact') as any)}</button>
        </div>
        <label class="tricol">
          <span>{$tr('v2.fav.sortBy' as any)}</span>
          <select bind:value={triPistes} aria-label={$tr('v2.fav.sortBy' as any)}>
            {#each CLES_TRI_PISTES as k (k)}<option value={k}>{$tr(LIBELLES_TRI_PISTES[k] as any)}</option>{/each}
          </select>
          <button class="sens" type="button" onclick={() => (sensPistes = sensPistes === 'asc' ? 'desc' : 'asc')}
            title={$tr((sensPistes === 'asc' ? 'common.ascending' : 'common.descending') as any)}
            aria-label={$tr((sensPistes === 'asc' ? 'common.ascending' : 'common.descending') as any)}>
            {#if sensPistes === 'asc'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M6 13l6 6 6-6"/></svg>
            {/if}
          </button>
        </label>
      </div>
      <!-- #4889 — le RANG pour clé : une playlist Tune mêle désormais des
           lignes de service (id nul) et de bibliothèque. La clé par défaut
           (`id ?? rang`) pouvait faire coïncider l'id 3 d'une piste locale et
           le rang 3 d'un titre Bandcamp — `each_key_duplicate`. Même règle que
           `PlaylistManagerView`. `sourceEnTableau` : la liste est MIXTE, on
           dit d'où vient chaque ligne (#1113). -->
      {#if vue === 'pochettes'}
        <div class="pgrille" data-pgrille style="--ptaille:{taillePochettes}px">
          {#each pistesVues as p, i (i)}
            <div class="pcarte">
              <button type="button" class="pvig" onclick={() => playFrom(i)} disabled={estIntrouvable(p) || radioIndisponible(p)}
                title={radioIndisponible(p) ? $tr('v2.pl.radioUnavailableHint' as any) : p.title}>
                <AlbumArt coverPath={p.cover_path} albumId={p.album_id} size={0}
                  alt={p.title ?? ''} source={mixte ? null : p.source} />
              </button>
              <div class="pnom" title={p.title}>{p.title}</div>
              {#if p.artist_name}<div class="part" title={p.artist_name}>{p.artist_name}</div>{/if}
              <!-- tune-server-rust#7394 — en pochettes, l'accès à l'album COMPLET :
                   son nom ouvre sa fiche (bibliothèque ou service), comme la
                   colonne Album de la liste. -->
              {#if p.album_title && !estLigneRadio(p)}
                {@const versAlbum = ouvertureAlbumDePiste(p, $gestesNavigationService)}
                {#if versAlbum}
                  <button type="button" class="palb" data-palbum title={p.album_title} onclick={versAlbum}>{p.album_title}</button>
                {:else}
                  <div class="part" title={p.album_title}>{p.album_title}</div>
                {/if}
              {/if}
              {#if estLigneRadio(p)}{@const etat = $tr((radioIndisponible(p) ? 'v2.pl.radioUnavailable' : 'v2.pl.radioLive') as any)}<div class="part" data-ligne-radio title={etat}>{etat}</div>{/if}
              {#if (edition && (isLocal || aMoiChezLeService)) || (isLocal && (estIntrouvable(p) || radioIndisponible(p))) || peutRemplacer(p, editable)}
                <div class="pact">{@render suffixe(p, i)}</div>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
      <ListePistesV2 pistes={pistesVues} pochetteEnTableau tailleVignette={tailleListe} ecranColonnes="playlist" contexte={conteneur()} clef={(_p, i) => i} sourceEnTableau={mixte} onLire={(_p, i) => playFrom(i)} onLireDepuis={(_p, i) => playFrom(i)} apres={suffixe} largeurApres="100px" />
      {/if}
      {#snippet suffixe(_t: any, i: number)}
        <!-- Les boutons deviennent une COLONNE de la ligne. Le fragment est
             compilé ici : ses styles le suivent.

             100px est une LITTÉRALE, pas une expression conditionnelle, même
             si la colonne reste vide hors édition. Une largeur qui change
             selon l'état se résoudrait différemment dans l'en-tête et dans
             les lignes, et les colonnes ne tomberaient plus en face —
             `colonnesPistes` garde précisément cela. -->
        <!-- #6179 — une ligne INTROUVABLE garde son bouton « Retirer » hors
             du mode édition : c'est le seul geste qui l'efface, il doit être
             à portée. -->
        {#if !edition && isLocal && estIntrouvable(_t)}
          <button class="rm" onclick={() => removeAt(rangReel(_t))} disabled={retraitEnCours}
            aria-label={$tr('v2.pl.remove' as any)} title={$tr('v2.pl.remove' as any)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>
          </button>
        {/if}
        <!-- web#2806 — même règle pour une station qui a quitté « Mes radios ». -->
        {#if !edition && isLocal && radioIndisponible(_t)}
          <button class="rm" onclick={() => removeAt(rangReel(_t))} disabled={retraitEnCours}
            aria-label={$tr('v2.pl.remove' as any)} title={$tr('v2.pl.remove' as any)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>
          </button>
        {/if}
        {#if !edition && peutRemplacer(_t, editable)}
          <button class="rm remplacer" data-remplacer-indisponible onclick={() => remplacerIndisponible(_t)} disabled={remplacementEnCours}
            aria-label={$tr('v2.pl.replaceUnavailable' as any)} title={$tr('v2.pl.replaceUnavailable' as any)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/></svg>
          </button>
        {/if}
        {#if edition && isLocal}
          <button class="rm mv" onclick={() => deplacer(i, false)} disabled={!ordreNaturel || i === 0 || deplacement}
            aria-label={$tr('playlist.moveUp')} title={$tr('playlist.moveUp')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
          </button>
          <button class="rm mv" onclick={() => deplacer(i, true)} disabled={!ordreNaturel || i === tracks.length - 1 || deplacement}
            aria-label={$tr('playlist.moveDown')} title={$tr('playlist.moveDown')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
          </button>
          <button class="rm" onclick={() => removeAt(rangReel(_t))} disabled={retraitEnCours} aria-label={$tr('v2.pl.remove' as any)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>
          </button>
        {:else if edition && aMoiChezLeService}
          <button class="rm retrait-service" onclick={() => retirerDuService(_t)} disabled={retraitService}
            aria-label={$tr('v2.pl.removeFromService' as any).replace('{service}', item.kind === 'streaming' ? item.service : '')}
            title={$tr('v2.pl.removeFromService' as any).replace('{service}', item.kind === 'streaming' ? item.service : '')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        {/if}
      {/snippet}
    {/if}
  </div>
</div>

{#if choixRadio && item.kind === 'local' && item.pl.id != null}
  <ChoixRadioPlaylistV2 playlistId={item.pl.id} onClose={() => (choixRadio = false)}
    onAjoutee={() => { load(); onChanged?.(); }} />
{/if}

{#if remplacement}
  <RemplacerIndisponibleModale titreDisparu={remplacement.piste.title ?? ''} candidats={remplacement.candidats}
    choisir={choisirRemplacant} onClose={() => (remplacement = null)} />
{:else if rapport}
  <RemplacerIndisponibleModale {rapport} choisirPour={choisirDepuisRapport} onClose={() => (rapport = null)} />
{/if}

<!-- Le PANNEAU partagé, chargé à la demande — celui des vignettes. -->
{#if etiquettesOuvertes && cibleEtiquettes}
  {#await import('./EtiquettesPanneau.svelte') then m}
    <m.default cible={cibleEtiquettes} nom={title}
      onClose={() => (etiquettesOuvertes = false)} />
  {/await}
{/if}

<style>
  .v2-pldetail{position:absolute; inset:0; z-index:30; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow-y:auto; padding:26px 34px 40px}
  .close{position:sticky; top:0; margin-bottom:8px; width:40px; height:40px; border-radius:12px; cursor:pointer;
    border:1px solid var(--v2-line2); background:var(--v2-surface2); color:var(--v2-txt2); display:grid; place-items:center}
  .close:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .close svg{width:18px; height:18px}

  .head{display:flex; gap:30px; padding:6px 0 26px}
  /* web#2601 — en-tête compact : la vignette tombe à 64 px, le titre et les
     actions se resserrent, la description se tait ; 4 à 5 lignes de plus. */
  .head.compact{gap:16px; padding:0 0 10px; align-items:center}
  .head.compact .art{width:64px; height:64px; border-radius:6px}
  .head.compact .art > svg{width:30px; height:30px}
  .head.compact .meta{gap:4px; padding-top:0}
  .head.compact .meta h1{font-size:calc(24px * var(--v2-txt-echelle, 1))}
  .head.compact .desc{display:none}
  /* `--bl-h` : la hauteur du bouton Lecture partagé (`BoutonLectureV2`). */
  .head.compact .actions{margin-top:2px; --bl-h:36px}
  .head.compact .ghost,.head.compact .ghost.sm{height:36px}
  .head.compact .ghost.carre{width:36px}
  .art{width:240px; height:240px; border-radius:8px; overflow:hidden; flex:0 0 auto; box-shadow:var(--v2-sh-lg);
    display:grid; place-items:center; color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .art.stream{background:none; color:inherit; box-shadow:var(--v2-sh-lg)}
  .art > svg{width:96px; height:96px}
  .meta{display:flex; flex-direction:column; gap:12px; padding-top:8px; min-width:0}
  .kind{font:700 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); letter-spacing:.12em; text-transform:uppercase; color:var(--v2-acc-tint)}
  .meta h1{font-size:calc(38px * var(--v2-txt-echelle, 1)); font-weight:800; letter-spacing:-.01em; line-height:1.05}
  .rn{font-size:calc(32px * var(--v2-txt-echelle, 1)); font-weight:800; background:var(--v2-surface2); border:1px solid var(--v2-acc2); border-radius:8px;
    color:var(--v2-txt); padding:4px 10px; outline:none}
  .desc{font-size:calc(14px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2); max-width:60ch}
  .facts{display:flex; gap:16px; font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3)}
  .actions{display:flex; gap:12px; margin-top:8px; flex-wrap:wrap}
  .ghost{display:inline-flex; align-items:center; gap:9px; height:44px; padding:0 20px; border-radius:var(--v2-r-pill);
    font:700 calc(14px * var(--v2-txt-echelle, 1)) var(--v2-sans); cursor:pointer; border:0}
  .ghost{color:var(--v2-txt); background:transparent; border:1px solid var(--v2-line2)}
  .ghost:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  /* Le mode ÉDITION se voit : sinon on ne sait pas pourquoi des croix sont
     apparues au bout des lignes. */
  .ghost.on{color:var(--v2-acc-tint); border-color:var(--v2-acc2); background:var(--v2-acc-soft)}
  .coeur.on{color:var(--v2-danger); border-color:var(--v2-danger-bd)}
  .coeur.on:hover{color:var(--v2-danger); border-color:var(--v2-danger-bd)}
  .chez{align-self:center; font:calc(11.5px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3); max-width:44ch; line-height:1.4}
  .ghost.sm{height:44px; padding:0 14px; font-size:calc(13px * var(--v2-txt-echelle, 1))}
  .ghost svg{width:16px; height:16px}
  /* web#2736 — les boutons d'icône seule. */
  .ghost.carre{width:44px; padding:0; justify-content:center; flex:0 0 auto}
  .ghost[aria-expanded="true"]{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .ghost:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:2px}
  .ghost:disabled{opacity:.55; cursor:default}

  .tracks{display:flex; flex-direction:column; gap:1px}
  .tri{display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; padding:0 0 10px}
  .vuebar{display:inline-flex; align-items:center; gap:14px; flex-wrap:wrap}
  .vues{display:inline-flex; border:1px solid var(--v2-line2); border-radius:9px; overflow:hidden}
  .vbtn{height:32px; padding:0 12px; border:0; background:transparent; color:var(--v2-txt2); cursor:pointer;
    font:600 calc(12.5px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .vbtn.basc{border:1px solid var(--v2-line2); border-radius:9px}
  .vbtn.on{background:var(--v2-acc-soft); color:var(--v2-acc-tint)}
  .taille{display:inline-flex; align-items:center; gap:8px; font-size:calc(12.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2)}
  .taille input{width:140px; accent-color:var(--v2-acc2)}
  .palb{display:block; width:100%; text-align:left; padding:0; border:0; background:transparent; cursor:pointer;
    color:var(--v2-txt3); font:inherit; font-size:calc(12px * var(--v2-txt-echelle, 1)); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .palb:hover, .palb:focus-visible{color:var(--v2-acc1); text-decoration:underline}
  .pgrille{display:grid; grid-template-columns:repeat(auto-fill, minmax(var(--ptaille, 160px), 1fr)); gap:20px 16px; padding:6px 0 20px}
  .pcarte{min-width:0; display:flex; flex-direction:column; gap:4px}
  .pvig{display:block; width:100%; aspect-ratio:1; padding:0; border:0; border-radius:8px; overflow:hidden; cursor:pointer;
    background:var(--v2-surface2); line-height:0}
  .pvig:disabled{opacity:.5; cursor:default}
  .pvig:focus-visible{outline:2px solid var(--v2-acc1); outline-offset:2px}
  .pnom{font-size:calc(13px * var(--v2-txt-echelle, 1)); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .part{font-size:calc(12px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .pact{display:flex; gap:6px}
  .tricol{display:inline-flex; align-items:center; gap:8px; font-size:calc(12.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2)}
  .tricol select{height:32px; border-radius:9px; border:1px solid var(--v2-line2); background:var(--v2-surface2);
    color:var(--v2-txt); font:calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); padding:0 8px}
  .tricol .sens{width:32px; height:32px; border-radius:9px; border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt2); cursor:pointer; display:grid; place-items:center}
  .tricol .sens svg{width:15px; height:15px}
  .state{padding:24px 6px; color:var(--v2-txt3)} .state.err{color:var(--v2-danger)}
  /* La ligne est PARTAGEE : cette enveloppe ne fait que lui adjoindre le
     bouton « retirer », propre a la playlist. */
  .lp{display:grid; grid-template-columns:1fr auto; align-items:center; gap:6px}
  .trk:hover{background:var(--v2-surface2); color:var(--v2-txt)}
  .trk.np{color:var(--v2-acc1)}
  .trk .pl{display:grid; grid-template-columns:34px 1fr; align-items:center; gap:14px; border:0; background:transparent;
    color:inherit; cursor:pointer; text-align:left; padding:11px 0}
  .trk .n{font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3); text-align:right}
  .trk.np .n{color:var(--v2-acc1)}
  .trk .ti{min-width:0; font-size:calc(14px * var(--v2-txt-echelle, 1)); font-weight:500; display:flex; flex-direction:column; gap:2px;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .trk .ti em{font:calc(11px * var(--v2-txt-echelle, 1)) var(--v2-sans); font-style:normal; color:var(--v2-txt3); overflow:hidden; text-overflow:ellipsis}
  .trk .tk{font:calc(10px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-acc2)}
  .trk .dur{font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3)}
  .rm{width:30px; height:30px; border-radius:8px; border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt3); cursor:pointer; display:grid; place-items:center}
  .rm:hover{border-color:var(--v2-danger-bd); color:var(--v2-danger)}
  .rm svg{width:15px; height:15px}
  .mv:disabled{opacity:.3; cursor:default}
</style>
