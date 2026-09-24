<script lang="ts">
  /**
   * Tune Health — nouveau client (direction Levente).
   *
   * Remplace « Diagnostics » (Bertrand, 27/08). Une seule question : les
   * traitements de fond de la bibliothèque avancent-ils, et où en sont-ils ?
   *
   * Cinq chantiers : analyse de la bibliothèque, analyse acoustique (CLAP),
   * ReplayGain, enrichissement des métadonnées, pochettes d'artistes.
   *
   * RÈGLE DE L'ÉCRAN : chaque carte dit ce qu'elle SAIT. Quand le serveur
   * n'expose pas d'avancement, la carte l'annonce au lieu d'afficher une
   * barre inventée. Une jauge fausse sur un écran de santé est pire que pas
   * de jauge du tout — c'est précisément ici qu'on vient chercher la vérité.
   *
   * Le rafraîchissement automatique ne tourne QUE tant qu'un traitement est
   * en cours : un écran de santé ne doit pas être lui-même une charge.
   */
  import * as api from '../../lib/api';
  import OutputModulesPanel from '../partages/OutputModulesPanel.svelte';
  import { tableauFournisseurs, type TableauFournisseurs } from '../../lib/refusModuleSortie';
  import { formatNombre } from '../../lib/formats';
  import { activeView } from '../../lib/stores/navigation';
  import { errText } from '../../lib/utils';
  import { tuneWS } from '../../lib/websocket';
  import { avancementAnalyse, pourcentAnalyse, abonnerAvancementAnalyse } from '../../lib/analyseBibliotheque';
  // #4144 — ce que la carte ReplayGain a le droit d'afficher, y compris face à
  // un serveur qui ne connaît pas la route.
  import { jaugeReplayGain } from '../../lib/santeReplayGain';
  // #1352 — la pause des traitements de fond. La lecture de l'instantané vit
  // dans `lib/tachesDeFond.ts`, hors du composant : elle se garde sans monter
  // l'écran, et l'absence de `pausable` (serveur < 0.9.159) s'y lit UNE fois.
  import {
    pausesParTraitement,
    serveurSaitSuspendre,
    type InstantaneTachesDeFond,
  } from '../../lib/tachesDeFond';
  import { heureSeule } from '../../lib/dates';
  import { t } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';
  import { dialogs } from '../../lib/stores/dialogs';
  // #865 — le geste des journaux, PARTAGÉ avec `DiagnosticsView`. Voir
  // `lib/journaux.ts` : aucune copie de la route ni du nom de fichier ici.
  import { lireJournaux, telechargerJournaux } from '../../lib/journaux';
  import '../../styles/tune-v2.css';

  type Card = {
    id: string;
    titre: string;
    sous: string;
    etat: 'inconnu' | 'idle' | 'running' | 'done' | 'off';
    ligne: string;
    fait?: number;
    total?: number;
    detail?: string;
    /** Le serveur n'expose pas d'avancement pour ce chantier. */
    sansJauge?: boolean;
    /**
     * L'identifiant SERVEUR du traitement suspendable que cette carte montre,
     * quand il en existe un (#1352).
     *
     * Absent sur la carte du scan, à dessein : le scan n'est pas suspendable
     * (`scan_pausable: false`) — il garde son « Arrêter », qui est ailleurs.
     * Les identifiants de cartes (`rg`, `dr`, `clap`…) sont plus anciens que
     * ceux du serveur et ne s'y superposent pas ; la correspondance est ici et
     * nulle part ailleurs.
     */
    traitement?: string;
  };

  /** L'analyse ReplayGain est-elle armée ? Le DR dépend du même interrupteur
   *  (`rattraper_un_lot_de_dr` n'est atteint que sous `EtatAnalyse::Active`),
   *  d'où ce partage plutôt qu'une seconde lecture de la config. */
  let cfgDrActive = false;

  let cards = $state<Card[]>([]);
  let loading = $state(true);
  let lastAt = $state<string | null>(null);
  let refreshing = $state(false);
  /** #2392 — l'instantané `output_providers` ; `null` = serveur antérieur à v0.9.115, pas de panneau. */
  let modulesSortie = $state<TableauFournisseurs | null>(null);

  // ── #1352 : la pause des traitements de fond ───────────────────────────
  //
  // L'écran REGARDAIT tourner des passes de plusieurs heures sans offrir le
  // moindre geste : sur le .18, la plage dynamique en est à 57 % de 47 118
  // pistes, et elle décode pendant qu'on écoute. Le seul bouton d'arrêt de
  // tout Tune était « Arrêter » sur le scan, et il est dans les Réglages.
  /** Suspendu ou non, par identifiant serveur. Vide = le serveur ne sait pas
   *  suspendre (< 0.9.159) : aucune carte ne portera de bouton. */
  let pauses = $state<Record<string, boolean>>({});
  let pausePossible = $state(false);
  let toutEnPause = $state(false);
  /** L'identifiant dont le clic est en vol, pour ne pas le rejouer. `'*'` pour
   *  l'interrupteur général. */
  let bascule = $state<string | null>(null);

  /** Ranger un instantané rendu par le serveur — celui du `GET` comme celui
   *  que rendent les quatre routes de pause, qui ont le MÊME corps. */
  function rangerLInstantane(inst: InstantaneTachesDeFond | null) {
    pausePossible = serveurSaitSuspendre(inst);
    pauses = pausesParTraitement(inst);
    toutEnPause = !!inst?.all_paused;
  }

  async function basculerTraitement(id: string, versLaPause: boolean) {
    bascule = id;
    try {
      rangerLInstantane(
        versLaPause ? await api.pauseBackgroundTask(id) : await api.resumeBackgroundTask(id),
      );
      // Les cartes lisent leur avancement ailleurs : on les relit pour que le
      // badge et la jauge redisent la même chose au même instant.
      void collect();
    } catch (e) {
      notifications.error(errText(e) ?? $t('common.error' as any));
    } finally {
      bascule = null;
    }
  }

  async function basculerTout(versLaPause: boolean) {
    bascule = '*';
    try {
      rangerLInstantane(
        versLaPause ? await api.pauseAllBackgroundTasks() : await api.resumeAllBackgroundTasks(),
      );
      void collect();
    } catch (e) {
      notifications.error(errText(e) ?? $t('common.error' as any));
    } finally {
      bascule = null;
    }
  }

  /**
   * Cette carte doit-elle porter un bouton ?
   *
   * Oui si le traitement TRAVAILLE, ou s'il est SUSPENDU — sans le second cas,
   * la pause serait un aller sans retour : une carte suspendue retombe souvent
   * à « au repos » du point de vue de sa propre route d'avancement, et plus
   * rien ne porterait « Reprendre ».
   *
   * Non sur une carte au repos, terminée, éteinte ou d'état inconnu : un bouton
   * qui ne ferait rien n'a pas sa place sur un écran dont toute la règle est de
   * ne montrer que ce qu'il sait.
   */
  function boutonSurLaCarte(c: Card): boolean {
    if (!pausePossible || !c.traitement) return false;
    return c.etat === 'running' || !!pauses[c.traitement];
  }

  /*
   * Portés de l'ancien écran Diagnostics, seul à les offrir.
   *
   * ASIO : après un plantage pendant la détection des pilotes, le serveur
   * BLOQUE la détection au démarrage suivant — sans quoi il replanterait en
   * boucle. Seul un geste de l'utilisateur la réarme ; sans ce bouton, elle
   * restait bloquée à vie dans cette interface.
   *
   * Réseau : multicast SSDP, port 8888, Internet, DNS, renderers vus — les
   * questions à poser quand « aucun appareil n'apparaît ». Lu à la demande.
   */
  let asioBloque = $state(false);
  let asioRearmement = $state(false);
  let asioRearme = $state(false);
  async function rearmerAsio() {
    if (!(await dialogs.confirm($t('diagnostics.asioWarmConfirm' as any)))) return;
    asioRearmement = true;
    try {
      await api.rearmAsioWarmScan();
      asioRearme = true;
      asioBloque = false;
      notifications.success($t('diagnostics.asioWarmRearmed' as any));
    } catch (e) {
      notifications.error(errText(e) ?? $t('common.error' as any));
    } finally {
      asioRearmement = false;
    }
  }

  let reseau = $state<Awaited<ReturnType<typeof api.getNetworkDiagnostics>> | null>(null);
  let reseauOuvert = $state(false);
  let reseauChargement = $state(false);
  async function lireReseau() {
    reseauChargement = true;
    try { reseau = await api.getNetworkDiagnostics(); } catch { reseau = null; }
    reseauChargement = false;
  }
  function basculerReseau() {
    reseauOuvert = !reseauOuvert;
    if (reseauOuvert) void lireReseau();
  }

  const anyRunning = $derived(cards.some((c) => c.etat === 'running'));

  async function collect() {
    refreshing = true;
    const out: Card[] = [];

    // ── Analyse de la bibliothèque ────────────────────────────────────────
    const [scan, report, stats] = await Promise.allSettled([
      api.getScanStatus(), api.getScanReport(), api.getLibraryStats(),
    ]);
    const totalTracks = stats.status === 'fulfilled' ? (stats.value?.tracks ?? 0) : 0;
    if (scan.status === 'fulfilled') {
      const scanning = !!scan.value?.scanning;
      const r = report.status === 'fulfilled' ? report.value : null;
      const bits: string[] = [];
      const n = (k: string, v: number) => $t(k as any).replace('{n}', $formatNombre(v));
      if (r?.inserted != null) bits.push(n('v2.health.added', r.inserted));
      if (r?.updated != null) bits.push(n('v2.health.updated', r.updated));
      if (r?.skipped != null) bits.push(n('v2.health.skipped', r.skipped));
      const failures = (r?.failed_paths?.length ?? 0) + (r?.error_dirs?.length ?? 0);
      // #1518 — le commentaire d'origine disait « le serveur signale "en
      // cours", pas un pourcentage ». C'est faux : `library.scan.progress`
      // porte `scanned` et `total` dès la phase « files ». Seule la phase
      // d'indexation est sans total (le serveur ne l'a pas encore), et là
      // seulement la carte reste sans jauge.
      const av = $avancementAnalyse;
      const pctScan = scanning ? pourcentAnalyse(av) : null;
      out.push({
        id: 'scan', titre: $t('v2.health.cardScan' as any),
        sous: $t('v2.health.cardScanSub' as any),
        etat: scanning ? 'running' : 'idle',
        ligne: scanning
          ? (pctScan !== null
              ? $t('v2.scan.progress' as any)
                  .replace('{f}', $formatNombre(av?.scanned ?? 0))
                  .replace('{t}', $formatNombre(av?.total ?? 0))
                  .replace('{p}', String(pctScan))
              : (av && av.scanned > 0
                  ? $t('v2.scan.indexing' as any).replace('{f}', $formatNombre(av.scanned))
                  : $t('v2.health.scanning' as any)))
          : (bits.length ? $t('v2.health.lastPass' as any).replace('{d}', bits.join(', '))
             : $t('v2.health.noScan' as any)),
        fait: pctScan !== null ? (av?.scanned ?? 0) : undefined,
        total: pctScan !== null ? (av?.total ?? 0) : undefined,
        detail: failures ? $t('v2.health.pathsFailed' as any).replace('{n}', String(failures)) : undefined,
        sansJauge: pctScan === null,
      });
    } else {
      out.push({ id: 'scan', titre: $t('v2.health.cardScan' as any), sous: $t('v2.health.cardScanSub' as any),
        etat: 'inconnu', ligne: $t('v2.health.unavailable' as any), sansJauge: true });
    }

    // ── Analyse acoustique (CLAP) ─────────────────────────────────────────
    const ac = await Promise.allSettled([api.getAcousticStatus()]);
    if (ac[0].status === 'fulfilled') {
      const s = ac[0].value;
      const done = s?.analysed_tracks ?? 0;
      // #4214 / #4254 — depuis 0.9.151 la route dit ce que la jauge des
      // Réglages affiche déjà : `processed / eligible`, où « eligible » EXCLUT
      // les pistes REPORTÉES (fichier qui ne répond pas, #1865), comptées à
      // part dans `deferred_tracks`. Deux écrans, un seul chiffre. Un serveur
      // plus ancien n'a pas ces champs : on retombe sur analysées / total.
      const eligible = typeof s?.eligible_tracks === 'number' ? s.eligible_tracks : undefined;
      const processed = typeof s?.processed_tracks === 'number' ? s.processed_tracks : undefined;
      const reportees = typeof s?.deferred_tracks === 'number' ? s.deferred_tracks : 0;
      const attendLesFichiers = s?.waiting_reason === 'unresolved_paths' && reportees > 0;
      const fait = processed ?? done;
      const total = eligible ?? totalTracks;
      const reporteesDetail = reportees > 0
        ? $t('v2.health.deferredPaths' as any).replace('{n}', $formatNombre(reportees))
        : undefined;
      if (!s?.available) {
        out.push({ id: 'clap', traitement: 'acoustic', titre: $t('v2.health.cardClap' as any), sous: $t('v2.health.cardClapSub' as any),
          etat: 'off', ligne: $t('v2.health.clapAbsent' as any) });
      } else if (!s.enabled) {
        out.push({ id: 'clap', traitement: 'acoustic', titre: $t('v2.health.cardClap' as any), sous: $t('v2.health.cardClapSub' as any),
          etat: 'off', ligne: $t('v2.health.clapDisabled' as any),
          detail: $t('v2.health.clapAnalysed' as any).replace('{n}', $formatNombre(done)) });
      } else {
        out.push({
          id: 'clap', traitement: 'acoustic', titre: $t('v2.health.cardClap' as any), sous: $t('v2.health.cardClapSub' as any),
          // Il ne reste QUE des reports : « au repos », avec la cause en
          // détail — pas « terminée », pas une jauge immobile sans un mot.
          etat: attendLesFichiers ? 'idle'
            : total && fait >= total ? 'done' : fait > 0 ? 'running' : 'idle',
          ligne: total
            ? $t('v2.health.clapProgress' as any).replace('{n}', $formatNombre(fait)).replace('{t}', $formatNombre(total))
            : $t('v2.health.clapDone' as any).replace('{n}', $formatNombre(fait)),
          detail: reporteesDetail,
          fait, total: total || undefined });
      }
    } else {
      out.push({ id: 'clap', traitement: 'acoustic', titre: $t('v2.health.cardClap' as any), sous: $t('v2.health.cardClapSub' as any),
        etat: 'inconnu', ligne: $t('v2.health.unavailable' as any) });
    }

    // ── ReplayGain ────────────────────────────────────────────────────────
    // #4144 — la route d'avancement existe DÉSORMAIS (`getReplayGainProgress`).
    // Ce qui n'a pas changé, et ne doit pas changer : quand le serveur ne
    // répond pas — v0.9.149 ou plus ancien, la route n'existe pas — la carte
    // montre la CONFIGURATION réelle et dit qu'elle ne connaît pas
    // l'avancement, plutôt qu'une jauge inventée ou, pire, une jauge vide qui
    // se lirait « 0 piste analysée ». La décision est dans
    // `lib/santeReplayGain.ts` : elle s'y garde sans monter l'écran.
    const cfg = await Promise.allSettled([api.getConfig(), api.getReplayGainProgress()]);
    if (cfg[0].status === 'fulfilled') {
      const c: any = cfg[0].value;
      const mode = c?.replaygain_mode ?? 'off';
      const analysis = c?.replaygain_analysis_enabled !== false && c?.replaygain_analysis_enabled !== 'false';
      const modeLabel = mode === 'off' ? $t('v2.health.rgOff' as any)
        : mode === 'track' ? $t('v2.health.rgTrack' as any) : $t('v2.health.rgAlbum' as any);
      // Le DR dépend du MÊME interrupteur : on le retient ici plutôt que de
      // relire la config une seconde fois.
      cfgDrActive = analysis;
      const jauge = jaugeReplayGain(mode !== 'off', cfg[1].status === 'fulfilled' ? cfg[1].value : null);
      out.push({
        id: 'rg', traitement: 'replaygain', titre: 'ReplayGain', sous: $t('v2.health.cardRgSub' as any),
        etat: jauge.etat,
        ligne: $t('v2.health.rgLine' as any).replace('{m}', modeLabel)
          .replace('{s}', analysis ? $t('v2.health.rgSourceBoth' as any) : $t('v2.health.rgSourceTags' as any)),
        fait: jauge.fait, total: jauge.total,
        // Le message d'absence ne s'affiche que quand l'absence est réelle.
        // Les reports (#4254) s'ajoutent au détail, quel qu'il soit : une
        // passe « à jour » sur un disque absent n'est pas à jour.
        detail: [
          jauge.attendLesFichiers && jauge.sansJauge
            ? undefined
            : jauge.sansJauge
              ? $t('v2.health.rgNoProgress' as any)
              : $t('v2.health.rgProgress' as any)
                  .replace('{n}', $formatNombre(jauge.fait ?? 0))
                  .replace('{t}', $formatNombre(jauge.total ?? 0)),
          jauge.reportees > 0
            ? $t('v2.health.deferredPaths' as any).replace('{n}', $formatNombre(jauge.reportees))
            : undefined,
        ].filter(Boolean).join(' ') || undefined,
        sansJauge: jauge.sansJauge });
    } else {
      out.push({ id: 'rg', traitement: 'replaygain', titre: 'ReplayGain', sous: $t('v2.health.cardRgSub' as any),
        etat: 'inconnu', ligne: $t('v2.health.unavailable' as any), sansJauge: true });
    }

    // ── Plage dynamique ───────────────────────────────────────────────────
    // #2218 — le DR s'affichait par piste et par album, se filtrait à la
    // recherche, mais AUCUNE carte n'en parlait : on ne pouvait pas savoir
    // combien de pistes en avaient un, ni d'où il venait.
    //
    // Cette carte vient APRÈS ReplayGain, et ce n'est pas décoratif : le DR
    // n'a pas de passe à lui. Il est le troisième maillon, derrière le
    // ReplayGain et les empreintes, dans le même créneau et sous le même
    // interrupteur (`rattraper_un_lot_de_dr`, appelé seulement quand les deux
    // autres n'ont plus rien). Une jauge sans cette explication laisserait
    // l'utilisateur devant un chiffre sans prise : le levier est sur la carte
    // d'à côté.
    const drc = await Promise.allSettled([api.getCompletenessStats()]);
    if (drc[0].status === 'fulfilled' && drc[0].value?.with_dynamic_range !== undefined) {
      const c = drc[0].value;
      const avec = c.with_dynamic_range ?? 0;
      const total = c.total_tracks ?? 0;
      const mesure = c.dynamic_range_from_analysis ?? 0;
      const tague = c.dynamic_range_from_tag ?? 0;
      const ecartees = c.dynamic_range_unavailable ?? 0;
      // Reportées (#4254) : fichier qui ne répond pas. Ni faites, ni écartées,
      // ni « en attente derrière ReplayGain » — en attente d'un disque.
      // Serveur ≥ 0.9.152 ; absent avant, donc 0.
      const reportees = typeof c.dynamic_range_deferred === 'number' ? c.dynamic_range_deferred : 0;
      // `cfgDr` est la config déjà lue plus haut pour ReplayGain : le DR
      // dépend du MÊME réglage, on ne le relit pas.
      const analyseActive = cfgDrActive;
      const restantes = Math.max(0, total - avec - ecartees - reportees);

      out.push({
        id: 'dr', traitement: 'dynamic_range',
        titre: $t('v2.health.cardDr' as any),
        sous: $t('v2.health.cardDrSub' as any),
        etat: !analyseActive ? 'off' : restantes === 0 && reportees === 0 ? 'done' : 'idle',
        // La ligne dit la RÉPARTITION, pas seulement le total : un DR tagué
        // n'a pas la même valeur qu'un DR mesuré.
        ligne: $t('v2.health.drLine' as any)
          .replace('{n}', $formatNombre(avec))
          .replace('{t}', $formatNombre(total))
          .replace('{m}', $formatNombre(mesure))
          .replace('{g}', $formatNombre(tague)),
        fait: avec,
        total: total || undefined,
        // Le détail porte la CAUSE, jamais un simple compteur.
        detail: !analyseActive
          ? $t('v2.health.drOffBecauseRg' as any)
          : [
              restantes > 0
                ? $t('v2.health.drQueuedBehindRg' as any).replace('{n}', $formatNombre(restantes))
                : ecartees > 0
                  ? $t('v2.health.drUnavailable' as any).replace('{n}', $formatNombre(ecartees))
                  : undefined,
              reportees > 0
                ? $t('v2.health.deferredPaths' as any).replace('{n}', $formatNombre(reportees))
                : undefined,
            ].filter(Boolean).join(' ') || undefined });
    } else {
      // Serveur antérieur au comptage : se déclarer indisponible, surtout pas
      // afficher « 0 piste » — qui se lirait comme une bibliothèque sans DR.
      out.push({ id: 'dr', traitement: 'dynamic_range', titre: $t('v2.health.cardDr' as any), sous: $t('v2.health.cardDrSub' as any),
        etat: 'inconnu', ligne: $t('v2.health.unavailable' as any), sansJauge: true });
    }

    // ── Enrichissement des métadonnées ────────────────────────────────────
    const en = await Promise.allSettled([api.getBatchEnrichStatus()]);
    if (en[0].status === 'fulfilled') {
      const s = en[0].value;
      const done = s?.enriched ?? 0, total = s?.total ?? 0;
      out.push({
        id: 'enrich', traitement: 'enrichment', titre: $t('v2.health.cardEnrich' as any), sous: $t('v2.health.cardEnrichSub' as any),
        etat: s?.status === 'running' ? 'running' : s?.status === 'done' ? 'done' : 'idle',
        ligne: total
          ? $t('v2.health.enrichProgress' as any).replace('{n}', $formatNombre(done)).replace('{t}', $formatNombre(total))
          : $t('v2.health.enrichDone' as any).replace('{n}', $formatNombre(done)),
        fait: done, total: total || undefined,
        detail: s?.errors ? $t('v2.health.enrichErrors' as any).replace('{n}', $formatNombre(s.errors)) : undefined });
    } else {
      out.push({ id: 'enrich', traitement: 'enrichment', titre: $t('v2.health.cardEnrich' as any), sous: $t('v2.health.cardEnrichSub' as any),
        etat: 'inconnu', ligne: $t('v2.health.unavailable' as any) });
    }

    // ── Pochettes d'artistes ──────────────────────────────────────────────
    const ar = await Promise.allSettled([api.enrichArtistImagesStatus()]);
    if (ar[0].status === 'fulfilled') {
      const s = ar[0].value;
      const r = s?.result;
      const manquantes = s?.artists_without_image ?? 0;
      out.push({
        id: 'covers', traitement: 'artist_images', titre: $t('v2.health.cardCovers' as any), sous: $t('v2.health.cardCoversSub' as any),
        etat: r?.phase && r.phase !== 'done' ? 'running' : r ? 'done' : 'idle',
        ligne: r?.total
          ? $t('v2.health.coversLine' as any).replace('{n}', $formatNombre(r.processed ?? 0))
              .replace('{t}', $formatNombre(r.total)).replace('{f}', $formatNombre(r.enriched ?? 0))
          : $t('v2.health.coversNone' as any),
        fait: r?.processed, total: r?.total,
        detail: manquantes ? $t('v2.health.coversMissing' as any).replace('{n}', $formatNombre(manquantes)) : undefined });
    } else {
      out.push({ id: 'covers', traitement: 'artist_images', titre: $t('v2.health.cardCovers' as any), sous: $t('v2.health.cardCoversSub' as any),
        etat: 'inconnu', ligne: $t('v2.health.unavailable' as any) });
    }

    // ── Pause des traitements de fond (#1352) ─────────────────────────────
    // `Promise.allSettled` comme partout ici : un serveur < 0.9.159 rend 404,
    // l'écran se tait sur la pause et le reste des cartes n'en souffre pas.
    const tdf = await Promise.allSettled([api.getBackgroundTasks()]);
    rangerLInstantane(tdf[0].status === 'fulfilled' ? tdf[0].value : null);

    // ── Modules de sortie (#2392) ─────────────────────────────────────────
    // Un seul appel, celui de Diagnostics ; un serveur qui n'envoie pas
    // `output_providers` ne fait apparaître aucun panneau.
    const diag = await Promise.allSettled([api.getServerDiagnostics()]);
    modulesSortie = diag[0].status === 'fulfilled'
      ? tableauFournisseurs(diag[0].value?.output_providers)
      : null;
    asioBloque = diag[0].status === 'fulfilled' && !!(diag[0].value as any)?.asio_warm_scan?.blocked_after_crash;

    cards = out;
    lastAt = $heureSeule(new Date());
    loading = false;
    refreshing = false;
  }

  $effect(() => { collect(); });

  // #1518 — les chiffres de l'analyse arrivent par `library.scan.progress`.
  // Sans cet abonnement la carte resterait muette : `GET /scan/status`, seul,
  // ne porte qu'un booléen.
  $effect(() => abonnerAvancementAnalyse((h) => tuneWS.onEvent(h)));

  // Sondage UNIQUEMENT tant qu'un traitement tourne : un écran de santé qui
  // interroge le serveur en boucle alors que rien ne bouge est lui-même un
  // problème de santé.
  $effect(() => {
    if (!anyRunning) return;
    const h = setInterval(() => { void collect(); }, 5000);
    return () => clearInterval(h);
  });

  const ETATS: Record<string, { txt: string; cls: string }> = $derived({
    running: { txt: $t('v2.health.stRunning' as any), cls: 'run' },
    done: { txt: $t('v2.health.stDone' as any), cls: 'ok' },
    idle: { txt: $t('v2.health.stIdle' as any), cls: 'idle' },
    off: { txt: $t('v2.health.stOff' as any), cls: 'off' },
    inconnu: { txt: $t('v2.health.stUnknown' as any), cls: 'unk' } });
  const pct = (c: Card) => (c.total && c.fait != null ? Math.min(100, Math.round((c.fait / c.total) * 100)) : null);

  // ── #865 : les JOURNAUX ────────────────────────────────────────────────
  //
  // 🔴 Ils n'existaient nulle part dans la coquille `?v2`. Le client actuel
  // les sert depuis `DiagnosticsView` — la vue `diagnostics` — mais la
  // nouvelle coquille rend `TuneHealthV2` sous cette même vue, et cet écran ne
  // parlait que des traitements de fond. Un testeur en `?v2` à qui on demande
  // ses journaux ne pouvait donc RIEN envoyer : pas de page, pas de bouton,
  // pas de fichier. C'est le coût invisible de chaque signalement.
  //
  // On les rebranche ICI, et pas dans les Réglages : c'est l'écran de santé,
  // c'est là qu'on vient quand quelque chose ne va pas, et c'est la vue que
  // l'ancienne interface montait déjà pour ça. Le geste lui-même est celui de
  // `DiagnosticsView`, extrait dans `lib/journaux.ts` pour qu'il n'y ait pas
  // deux vérités — il y en avait déjà deux dans le client actuel, et elles
  // avaient divergé.
  let journauxOuverts = $state(false);
  let journaux = $state('');
  let journauxSource = $state('');
  let journauxEnCours = $state(false);
  let exportEnCours = $state(false);

  async function basculerJournaux() {
    journauxOuverts = !journauxOuverts;
    if (!journauxOuverts) return;
    journauxEnCours = true;
    try {
      const j = await lireJournaux();
      journaux = j.texte || $t('diagnostics.noLogs' as any);
      journauxSource = j.source;
    } catch {
      journaux = $t('diagnostics.logsError' as any);
      journauxSource = 'error';
    }
    journauxEnCours = false;
  }

  async function exporterJournaux() {
    exportEnCours = true;
    try {
      // Le libellé « aucun journal » est passé TRADUIT : le module ne parle
      // à personne, et un fichier vide se lit comme un export raté.
      await telechargerJournaux({ siVide: $t('diagnostics.noLogs' as any) });
    } catch (e: any) {
      notifications.error($t('common.error' as any) + ' : ' + (errText(e) ?? $t('common.serverUnreachable' as any)));
    }
    exportEnCours = false;
  }
</script>

<section class="v2-health tune-v2">
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$t('v2.health.eyebrow' as any)}</div>
      <h1>{$t('v2.nav.processing' as any)}</h1>
    </div>
    <div class="v2-actions">
      <div class="meta">
        {#if lastAt}<span>{$t('v2.health.readAt' as any).replace('{h}', lastAt)}</span>{/if}
        {#if anyRunning}<span class="live">{$t('v2.health.autoFollow' as any)}</span>{/if}
      </div>
      <!-- #1352 — l'interrupteur général. En tête d'écran, à côté d'Actualiser :
           c'est le geste d'un soir d'écoute, il ne se cherche pas carte par
           carte. Absent tant que le serveur ne sait pas suspendre. -->
      {#if pausePossible}
        <button
          class="lnk"
          onclick={() => basculerTout(!toutEnPause)}
          disabled={bascule !== null}
        >
          {$t((toutEnPause ? 'v2.health.resumeAll' : 'v2.health.pauseAll') as any)}
        </button>
      {/if}
      <button class="v2-btn" onclick={() => collect()} disabled={refreshing}>
        {$t((refreshing ? 'v2.health.refreshing' : 'v2.health.refresh') as any)}
      </button>
    </div>
  </header>

  <div class="scroll">
    {#if loading}
      <div class="state">{$t('v2.health.loading' as any)}</div>
    {:else}
      <div class="cards">
        {#each cards as c (c.id)}
          {@const p = pct(c)}
          {@const enPause = !!(c.traitement && pauses[c.traitement])}
          <article class="card {enPause ? 'pause' : ETATS[c.etat].cls}">
            <div class="chead">
              <div>
                <h2>{c.titre}</h2>
                <div class="sub">{c.sous}</div>
              </div>
              <!-- #1352 — « En pause » PRIME sur l'état propre de la carte : un
                   traitement suspendu dont la route d'avancement continue de
                   dire « en cours » afficherait sinon deux vérités à la fois. -->
              {#if enPause}
                <span class="badge pause">{$t('v2.health.stPaused' as any)}</span>
              {:else}
                <span class="badge {ETATS[c.etat].cls}">{ETATS[c.etat].txt}</span>
              {/if}
            </div>

            <div class="line">{c.ligne}</div>

            {#if p !== null}
              <div class="bar"><span style="width:{p}%"></span></div>
              <div class="pct">{p} %</div>
            {:else if c.sansJauge}
              <div class="nogauge">{$t('v2.health.noProgress' as any)}</div>
            {/if}

            {#if c.detail}<div class="detail">{c.detail}</div>{/if}

            {#if boutonSurLaCarte(c)}
              <div class="cactions">
                <button
                  class="lnk sm"
                  onclick={() => basculerTraitement(c.traitement!, !enPause)}
                  disabled={bascule !== null}
                >
                  {$t((enPause ? 'v2.health.resume' : 'v2.health.pause') as any)}
                </button>
              </div>
            {/if}
          </article>
        {/each}
      </div>

      {#if modulesSortie}
        <section class="modules">
          <h2>{$t('diagnostics.outputModules' as any)}</h2>
          <div class="sub">{$t('diagnostics.outputModulesHint' as any)}</div>
          <OutputModulesPanel tableau={modulesSortie} variante="v2" />
        </section>
      {/if}

      {#if asioBloque || asioRearme}
        <section class="modules" role={asioRearme ? undefined : 'alert'}>
          {#if asioRearme}
            <h2>{$t('diagnostics.asioWarmRearmed' as any)}</h2>
          {:else}
            <h2>{$t('diagnostics.asioWarmTitle' as any)}</h2>
            <div class="sub">{$t('diagnostics.asioWarmMessage' as any)}</div>
            <button class="lnk" onclick={rearmerAsio} disabled={asioRearmement}>
              {$t((asioRearmement ? 'diagnostics.asioWarmRearming' : 'diagnostics.asioWarmRearm') as any)}
            </button>
          {/if}
        </section>
      {/if}

      <section class="modules">
        <button class="lnk" onclick={basculerReseau} aria-expanded={reseauOuvert}>{$t('diagnostics.network' as any)}</button>
        {#if reseauOuvert}
          {#if reseauChargement}
            <div class="sub">{$t('common.loading' as any)}</div>
          {:else if reseau}
            <ul class="reseau">
              <li>{reseau.multicast_ssdp ? '✅' : '❌'} {$t('diagnostics.multicastSsdp' as any)}</li>
              <li>{reseau.port_8888 ? '✅' : '❌'} {$t('diagnostics.port8888' as any)}</li>
              <li>{reseau.internet ? '✅' : '❌'} {$t('diagnostics.internet' as any)}</li>
              {#each Object.entries(reseau.dns_resolution ?? {}) as [domaine, ok] (domaine)}
                <li class="ind">{ok ? '✅' : '❌'} {$t('diagnostics.dnsResolution' as any)} · <code>{domaine}</code></li>
              {/each}
              {#each reseau.renderers ?? [] as rd (rd.host + rd.name)}
                <li class="ind">{rd.available ? '✅' : '❌'} {rd.name} <code>{rd.host}</code></li>
              {/each}
            </ul>
          {:else}
            <div class="sub">{$t('diagnostics.networkUnavailable' as any)}</div>
          {/if}
        {/if}
      </section>

      <!-- #865 — les JOURNAUX. Le bloc est en dehors du `{#if modulesSortie}`
           et ne dépend d'aucune route facultative : il doit être là même —
           surtout — quand le serveur va mal. -->
      <section class="journaux">
        <h2>{$t('v2.health.cardLogs' as any)}</h2>
        <div class="sub">{$t('settings.downloadLogsTitle' as any)}</div>
        <div class="jactions">
          <button class="lnk" onclick={basculerJournaux} disabled={journauxEnCours}>
            {$t((journauxOuverts ? 'diagnostics.hideLogs' : 'diagnostics.showLogs') as any)}
          </button>
          <button class="lnk" onclick={exporterJournaux} disabled={exportEnCours}>
            {$t((exportEnCours ? 'diagnostics.exporting' : 'diagnostics.exportLogs') as any)}
          </button>
          {#if journauxSource && journauxOuverts}
            <span class="jsrc">{journauxSource}</span>
          {/if}
        </div>
        {#if journauxOuverts}
          <pre class="jtexte">{journauxEnCours ? $t('common.loading' as any) : journaux}</pre>
        {/if}
      </section>

      <p class="foot">
        {$t('v2.hint.processingFromSettings' as any)}
        <button class="lnk sm" onclick={() => activeView.set('settings')}>{$t('v2.eq.openSettings' as any)}</button>
      </p>
    {/if}
  </div>
</section>

<style>
  .v2-health{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .meta{display:flex; gap:14px; margin-left:auto; font:11px var(--v2-mono); color:var(--v2-txt3)}
  .meta .live{color:var(--v2-acc1)}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:var(--v2-r-pill); padding:8px 15px; font:600 12px var(--v2-sans)}
  .lnk:hover:not(:disabled){border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .lnk:disabled{opacity:.5; cursor:default}
  .lnk.sm{padding:5px 12px; font-size:11.5px; margin-left:8px}

  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:30px 0; color:var(--v2-txt3)}

  .cards{display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:16px}
  .card{border:1px solid var(--v2-line); border-radius:14px; background:var(--v2-surface2); padding:16px 18px 18px}
  .card.run{border-color:var(--v2-acc2)}
  .chead{display:flex; align-items:flex-start; justify-content:space-between; gap:14px}
  .chead h2{font-size:15px; font-weight:700}
  .sub{margin-top:3px; font-size:11.5px; color:var(--v2-txt3)}
  .badge{flex:0 0 auto; font:9.5px var(--v2-mono); letter-spacing:.1em; text-transform:uppercase;
    padding:3px 9px; border-radius:999px; border:1px solid var(--v2-line2); color:var(--v2-txt3)}
  .badge.run{color:var(--v2-on-acc); border-color:transparent; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .badge.ok{color:var(--v2-acc-tint); border-color:var(--v2-acc2)}
  .badge.unk{color:var(--v2-danger); border-color:var(--v2-danger-bd)}
  /* #1352 — une carte suspendue se distingue d'une carte au repos SANS passer
     pour une erreur : c'est un état voulu, pas une panne. */
  .badge.pause{color:var(--v2-txt2); border-color:var(--v2-txt3)}
  .card.pause{border-color:var(--v2-txt3)}
  .cactions{margin-top:13px; display:flex; gap:10px; flex-wrap:wrap}

  .line{margin-top:13px; font-size:13px; color:var(--v2-txt2); line-height:1.5}
  .bar{margin-top:11px; height:6px; border-radius:4px; background:var(--v2-line); overflow:hidden}
  .bar span{display:block; height:100%; border-radius:4px;
    background:linear-gradient(90deg,var(--v2-acc1),var(--v2-acc2)); transition:width .4s ease}
  .pct{margin-top:6px; font:10.5px var(--v2-mono); color:var(--v2-txt3); text-align:right}
  .nogauge{margin-top:11px; font:10.5px var(--v2-mono); color:var(--v2-txt3); font-style:italic}
  .detail{margin-top:9px; font-size:11.5px; color:var(--v2-txt3)}
  .foot{margin-top:22px; font-size:12.5px; color:var(--v2-txt3)}
  .reseau{list-style:none; margin:10px 0 0; padding:0; display:flex; flex-direction:column; gap:4px; font-size:13px; color:var(--v2-txt2)}
  .reseau .ind{padding-left:18px}
  .modules{margin-top:22px; border:1px solid var(--v2-line); border-radius:14px; background:var(--v2-surface2); padding:16px 18px 18px}
  .modules h2{font-size:15px; font-weight:700}
  .modules .sub{margin-bottom:12px}

  /* #865 — le bloc des journaux, dans l'enveloppe des autres sections de
     l'écran plutôt qu'avec un style à lui. */
  .journaux{margin-top:22px; border:1px solid var(--v2-line); border-radius:14px;
    background:var(--v2-surface2); padding:16px 18px 18px}
  .journaux h2{font-size:15px; font-weight:700}
  .journaux .sub{margin-bottom:12px}
  .jactions{display:flex; align-items:center; gap:10px; flex-wrap:wrap}
  .jsrc{font:10.5px var(--v2-mono); color:var(--v2-txt3)}
  /* Le journal est long et ses lignes le sont aussi : il défile dans les deux
     sens, et la page, elle, ne déborde pas. */
  .jtexte{margin-top:12px; max-height:380px; overflow:auto; padding:12px;
    border:1px solid var(--v2-line2); border-radius:10px; background:var(--v2-bg);
    font:11.5px/1.55 var(--v2-mono); color:var(--v2-txt2); white-space:pre; tab-size:2}
</style>
