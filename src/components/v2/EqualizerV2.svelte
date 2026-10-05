<script lang="ts">
  import { atteintLeSon } from '../../lib/porteeReglage';
  /**
   * Égaliseur — nouveau client (direction Levente).
   *
   * Égaliseur GRAPHIQUE sur les grilles ISO (10 / 15 / 31 bandes), avec
   * réglages tout faits, courbes gauche/droite déliables, et report honnête
   * de ce que le serveur a réellement appliqué.
   *
   * Le CROSSFEED n'est plus ici : il a son écran (Bertrand, 27/08). C'est un
   * réglage de casque, pas une correction de courbe.
   *
   * PÉRIMÈTRE ASSUMÉ : le sous-mode PARAMÉTRIQUE (bandes libres
   * fréquence/gain/Q/type) et l'assistant « Tune Master Profiler » de l'écran
   * actuel ne sont pas repris ici. Ce sont deux outils à part entière ; les
   * esquisser produirait des courbes fausses. L'écran le dit et y renvoie.
   *
   * La règle des canaux vient de `lib/eqGraphicChannels` — on la RÉUTILISE au
   * lieu de la réécrire : elle a ses tests, et deux implémentations d'un
   * découpage gauche/droite finiraient par diverger.
   */
  import * as api from '../../lib/api';
  import { rafraichirGreffonEgaliseur } from '../../lib/stores/egaliseur';
  import { zoneRequise } from '../../lib/zoneRequise';
  import type { EqBand, MergedPlugin } from '../../lib/api';
  import { currentZoneId, currentZone } from '../../lib/stores/zones';
  import { notifications } from '../../lib/stores/notifications';
  import { dialogs } from '../../lib/stores/dialogs';
  import { activeView } from '../../lib/stores/navigation';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { t } from '../../lib/i18n';
  import { NEUTRAL_PARAMETRIC_BAND } from '../../lib/eqReset';
  import ParametricEq from '../partages/ParametricEq.svelte';
  import VoilePur from './VoilePur.svelte';
  import { audiophileEnabled } from '../../lib/stores/audiophile';
  import ProfilerV2 from './ProfilerV2.svelte';
  import CompensationNiveauV2 from './CompensationNiveauV2.svelte';
  import { bandesGraphiques } from '../../lib/eqGraphicChannels';
  import { estCourbeGraphique } from '../../lib/eqHydratation';
  import { bilanImportPeq, db, nomDuFichierPeq, TAILLE_MAX_FICHIER_PEQ, type BilanImportPeq } from '../../lib/eqImportPeq';
  import '../../styles/tune-v2.css';

  const level = $derived($preferences.settingsLevel);
  /** web#1674 — la zone courante est en PURE : l'égaliseur n'y agit pas.
   *  L'état est celui du bouton PURE (`audiophileEnabled`), pas une relecture. */
  const pur = $derived($audiophileEnabled);
  const showExpert = $derived(atLeast(level, 'expert'));

  // Grilles ISO : octave (10), 2/3 d'octave (15), 1/3 d'octave (31) — les
  // repères de REW. La résolution est une clé SERVEUR : web, iPad et mobile
  // partagent la même grille.
  const GRIDS: Record<number, number[]> = {
    10: [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
    15: [25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000],
    31: [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800,
         1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000],
  };
  // Q adapté à la largeur de bande ; 10 bandes garde le 1.0 historique pour ne
  // pas changer le rendu des réglages existants.
  const GRID_Q: Record<number, number> = { 10: 1.0, 15: 2.15, 31: 4.32 };
  const MIN_GAIN = -12, MAX_GAIN = 12;

  /**
   * Éditeur PARAMÉTRIQUE — le dernier manque face au client actuel
   * (Bertrand, 04/09/2026 : « la der »).
   *
   * `ParametricEq.svelte` est REPRIS tel quel : 393 lignes qui dessinent la
   * courbe de réponse réelle, calculée avec les mêmes biquads RBJ que
   * `tune-core/src/audio/eq.rs`. Le réécrire en version v2 imposerait de
   * maintenir deux fois une transposition de filtres — le genre de duplication
   * qui finit par diverger sans que personne ne s'en aperçoive à l'oreille.
   *
   * Il ne s'habille qu'en variables `--tune-*`, que `tune-v2.css` ponte déjà —
   * mêmes raisons que `TransportBar`, `RendererConfig` et `ZoneDeviceEditor`.
   *
   * DEUX MODES, UNE SEULE ROUTE. Graphique et paramétrique produisent tous
   * deux un tableau de bandes pour `POST /zones/{id}/eq` : ce qui change est
   * la façon de les composer, pas ce qu'on envoie. Le mode courant décide donc
   * seulement quelle liste part.
   */
  let sousMode = $state<'graphique' | 'parametrique' | 'assistant'>('graphique');
  /** Incrémenté à chaque courbe enregistrée : `CompensationNiveauV2` se relit. */
  let revisionDsp = $state(0);
  let pBandes = $state<EqBand[]>([]);

  const PRESETS: { key: string; labelKey: string; gains: number[] }[] = [
    { key: 'flat',         labelKey: 'v2.eq.presetFlat',      gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { key: 'bass_boost',   labelKey: 'v2.eq.presetBass',      gains: [8, 6, 4, 2, 0, 0, 0, 0, 0, 0] },
    { key: 'treble_boost', labelKey: 'v2.eq.presetTreble',    gains: [0, 0, 0, 0, 0, 1, 3, 5, 7, 8] },
    { key: 'loudness',     labelKey: 'v2.eq.presetLoudness',  gains: [6, 4, 0, -2, -1, 0, 2, 4, 5, 6] },
    { key: 'rock',         labelKey: 'v2.eq.presetRock',      gains: [5, 3, 0, -2, -1, 2, 4, 5, 5, 4] },
    { key: 'jazz',         labelKey: 'v2.eq.presetJazz',      gains: [3, 2, 0, 2, -1, -1, 0, 2, 4, 5] },
    { key: 'classical',    labelKey: 'v2.eq.presetClassical', gains: [0, 0, 0, 0, 0, 0, -2, -3, -2, -1] },
  ];

  let bandCount = $state(10);
  const BANDS = $derived(GRIDS[bandCount] ?? GRIDS[10]);
  let gains = $state<number[]>(Array(10).fill(0));
  /** Courbe du canal DROIT. `null` = courbes liées, et c'est le défaut : une
   *  seule passe part au serveur, sans champ `channel`. */
  let gainsRight = $state<number[] | null>(null);
  let editing = $state<'left' | 'right'>('left');
  let enabled = $state(true);
  let loading = $state(true);
  let error = $state<string | null>(null);
  /**
   * Ticket 177 (Levente, fil 1974) — « l'EQ a oublié mes réglages ».
   *
   * La courbe EN SERVICE n'a pas pu être relue (`GET /zones/{id}/eq` en
   * échec). L'écran tombait alors dans la branche « aucune courbe » et
   * dessinait des curseurs à plat — sans un mot, alors que le serveur
   * appliquait toujours ses bandes ; et le premier geste écrasait la vraie
   * courbe par celle, plate, de l'écran. On n'affiche plus rien d'éditable :
   * on le dit, et on propose de relire.
   */
  let lectureEchouee = $state(false);
  /** Le numéro de la dernière lecture : une réponse plus ancienne, arrivée
   *  après (changement de zone, rechargement), ne remplace plus l'écran. */
  let numeroLecture = 0;
  /**
   * La courbe en service est PARAMÉTRIQUE (ou l'est devenue au dernier
   * enregistrement). Sur l'onglet Graphique, ses bandes n'ont pas de curseur :
   * la grille paraît à plat, et « Plat » s'allumait comme préréglage actif
   * alors que l'égaliseur corrigeait toujours. On ne l'allume plus, et une
   * note le dit.
   */
  let courbeEnServiceParametrique = $state(false);

  /**
   * Égaliseur en greffon FACULTATIF (v0.9.156).
   *
   * Il n'est plus activé d'office : il s'installe depuis le catalogue.
   * `GET /plugins/equalizer` dit s'il est installé, s'il faut le PROPOSER
   * (une configuration existait avant la mise à jour) et si des réglages sont
   * conservés. Un vieux serveur ne rend pas ces champs, ou refuse la route :
   * on garde l'écran d'avant — `undefined` n'est JAMAIS « non installé »,
   * sinon un serveur d'hier montrerait un égaliseur « à installer » qui
   * tourne déjà.
   */
  let greffon = $state<Pick<MergedPlugin, 'installed' | 'install_proposed' | 'existing_configuration'> | null>(null);
  let installation = $state(false);
  let redemarrageRequis = $state(false);
  /** Compteur relu par l'effet de chargement : l'incrémenter recharge l'écran. */
  let rechargement = $state(0);
  const nonInstalle = $derived(greffon?.installed === false);
  const installationProposee = $derived(nonInstalle && greffon?.install_proposed === true);

  const curve = $derived(gainsRight !== null && editing === 'right' ? gainsRight : gains);

  /** Rééchantillonne une courbe d'une grille vers une autre, par plus proche
   *  voisin en fréquence : changer de résolution ne doit jamais remettre la
   *  courbe à plat. */
  function resample(src: number[], from: number[], to: number[]): number[] {
    return to.map((f) => {
      let best = 0, d = Infinity;
      from.forEach((g, i) => { const dd = Math.abs(Math.log2(f / g)); if (dd < d) { d = dd; best = i; } });
      return src[best] ?? 0;
    });
  }

  $effect(() => {
    const zid = $currentZoneId;
    void rechargement; // relu exprès : l'installation du greffon relance le chargement
    loading = true;
    const lecture = ++numeroLecture;
    const msgIndisponible = $t('v2.eq.errUnavailable' as any);
    // web#1750 — une autre zone, une autre courbe : « Enregistrer » ne doit
    // pas l'écrire dans le préréglage qu'on éditait sur la précédente.
    enCoursId = null;
    // Le greffon se lit SANS zone : « pas installé » se dit même quand aucune
    // zone n'est choisie, sinon l'écran réclamerait une zone pour un
    // égaliseur qui n'existe pas encore.
    const lectureGreffon = api.getPluginDetail('equalizer')
      .then((p) => { greffon = p ?? null; }, () => { greffon = null; });
    const lectureZone = zid == null ? Promise.resolve() : Promise.allSettled([api.getEqExpertSettings(), api.getEq(zid)])
      .then(([res, eq]) => {
        if (lecture !== numeroLecture) return;
        if (eq.status === 'rejected') {
          // Ticket 177 — surtout pas la branche « à plat » ci-dessous.
          lectureEchouee = true;
          error = msgIndisponible;
          return;
        }
        lectureEchouee = false;
        if (res.status === 'fulfilled') bandCount = res.value.expert_bands ?? 10;
        const grid = GRIDS[bandCount] ?? GRIDS[10];
        // #5171 — `null` : serveur antérieur au réglage, contrôle caché.
        reserve = eq.status === 'fulfilled' ? lireReserve(eq.value?.headroom_mode) : null;
        if (eq.status === 'fulfilled' && eq.value) {
          enabled = eq.value.enabled ?? true;
          const bands = eq.value.bands ?? [];
          // #1646 : le serveur ne renvoie pas de mode. Seule une grille que
          // l'éditeur graphique peut réémettre à l'identique est graphique.
          // Toute autre courbe garde ses bandes exactes dans le PEQ ; sinon
          // le premier geste réécrirait une courbe arbitrairement plate.
          pBandes = bands.map((b) => ({ ...b }));
          sousMode = bands.length && !estCourbeGraphique(bands, grid, GRID_Q[bandCount] ?? 1.0)
            ? 'parametrique' : 'graphique';
          courbeEnServiceParametrique = sousMode === 'parametrique';
          const left = bands.filter((b) => b.channel === undefined || b.channel === 0);
          const right = bands.filter((b) => b.channel === 1);
          gains = grid.map((f) => left.find((b) => Math.abs(b.freq - f) < 0.51)?.gain ?? 0);
          gainsRight = right.length ? grid.map((f) => right.find((b) => Math.abs(b.freq - f) < 0.51)?.gain ?? 0) : null;
        } else {
          gains = Array(grid.length).fill(0);
          gainsRight = null;
          pBandes = [];
          sousMode = 'graphique';
          courbeEnServiceParametrique = false;
        }
        error = null;
      })
      .catch(() => { error = msgIndisponible; });
    Promise.allSettled([lectureGreffon, lectureZone]).finally(() => { loading = false; });
  });

  /**
   * Installer PUIS activer, dans cet ordre — la même mécanique que
   * `PluginsV2` (`installPlugin` → `enablePlugin`), pas une autre route.
   *
   * `restart_required` est CRU : si le serveur dit qu'il faut redémarrer, on
   * ne promet pas que l'égaliseur marche tout de suite. Le message reste
   * affiché après le rechargement, jusqu'au redémarrage.
   */
  async function installerGreffon() {
    if (installation) return;
    installation = true;
    error = null;
    // Résolues AVANT l'attente : un `$t()` dans un `catch` est invisible au build.
    const msgOk = $t('v2.eq.pluginInstalled' as any);
    const msgKo = $t('v2.eq.pluginInstallError' as any);
    try {
      const inst = await api.installPlugin('equalizer');
      const act = await api.enablePlugin('equalizer');
      if (inst?.restart_required || act?.restart_required) redemarrageRequis = true;
      notifications.success(msgOk);
      rechargement++;
      // Le bouton EQ de Lecture en cours suit le même magasin : sans ce
      // rafraîchissement, il ne reviendrait qu'au prochain chargement de la
      // page — on aurait installé l'égaliseur sans le voir apparaître.
      void rafraichirGreffonEgaliseur();
    } catch {
      error = msgKo;
      notifications.error(msgKo);
    } finally {
      installation = false;
    }
  }

  // Le serveur applique au flux en cours quand il le peut (#1725). Quand il ne
  // le peut pas — zone réseau, mode PURE — et qu'on écoute, on pousse un
  // curseur et on n'entend rien : ce silence se raconte comme « l'égaliseur
  // ne fonctionne pas ». On le dit, UNE fois.
  let nextTrackWarned = false;
  function reportReach(appliedLive: boolean | undefined) {
    const listening = $currentZone?.state === 'playing';
    if (appliedLive === false && listening) {
      if (!nextTrackWarned) { nextTrackWarned = true; notifications.info($t('eq.effectNextTrack' as any)); }
    } else if (appliedLive === true) {
      nextTrackWarned = false;
    }
  }

  /**
   * tune-server-rust#5171 — la réserve anti-saturation. `null` quand le
   * serveur ne publie pas `headroom_mode` : il ne connaît pas le réglage, le
   * contrôle est caché.
   */
  let reserve = $state<api.HeadroomMode | null>(null);
  function lireReserve(v: unknown): api.HeadroomMode | null {
    return v === 'safe' || v === 'realistic' ? v : null;
  }
  let reserveEnCours = $state(false);
  async function choisirReserve(mode: api.HeadroomMode) {
    const zid = zoneRequise();
    if (zid == null || reserveEnCours || reserve === mode) return;
    // Résolu AVANT l'attente : un `$t()` dans un `catch` est invisible au build.
    const msgKo = $t('v2.eq.errRefused' as any);
    const avant = reserve;
    reserve = mode;
    reserveEnCours = true;
    try {
      const res = await api.setEqHeadroomMode(zid, mode);
      reserve = lireReserve(res?.headroom_mode) ?? mode;
      reportReach(atteintLeSon(res?.applied_live, res?.portee));
      // La réserve change ce que l'égaliseur retire : la compensation aussi.
      revisionDsp++;
      error = null;
    } catch (e: any) {
      reserve = avant;
      if (e?.message !== 'premium_required') error = msgKo;
    } finally {
      reserveEnCours = false;
    }
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  function queueSave() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void save(); }, 300);
  }
  async function save() {
    const zid = zoneRequise();
    if (zid == null) return;
    const bands: EqBand[] = sousMode === 'parametrique'
      ? $state.snapshot(pBandes)
      : bandesGraphiques(BANDS, gains, gainsRight, GRID_Q[bandCount] ?? 1.0);
    try {
      const res: any = await api.setEq(zid, { bands, enabled });
      courbeEnServiceParametrique = sousMode === 'parametrique';
      reportReach(atteintLeSon(res?.applied_live, res?.portee));
      // La courbe a changé : ce que la compensation rend aussi (#4685).
      revisionDsp++;
      error = null;
    } catch (e: any) {
      // Un refus silencieux, c'est un égaliseur qui « ne marche pas » : les
      // curseurs bougent, la courbe tient à l'écran, et le son ne change
      // jamais. On le remonte.
      if (e?.message !== 'premium_required') error = $t('v2.eq.errRefused' as any);
    }
  }

  /**
   * Toucher une bande ALLUME l'égaliseur.
   *
   * Sans cela la courbe partirait avec `enabled: false` : les points bougent à
   * l'écran, la courbe se dessine, et le son ne change jamais. C'est la même
   * garde que dans le client actuel.
   */
  function surChangementParametrique() {
    if (!enabled) enabled = true;
    queueSave();
  }

  /**
   * Passer au paramétrique SÈME la courbe depuis le graphique.
   *
   * Arriver sur un éditeur vide effacerait le réglage en cours au premier
   * enregistrement. On reprend donc les bandes non nulles ; s'il n'y en a
   * aucune, une bande neutre pour avoir un point à saisir.
   */
  function versParametrique() {
    if (!pBandes.length) {
      const depart = bandesGraphiques(BANDS, gains, gainsRight, GRID_Q[bandCount] ?? 1.0)
        .filter((b) => b.gain !== 0);
      pBandes = depart.length ? depart : [{ ...NEUTRAL_PARAMETRIC_BAND }];
    }
    sousMode = 'parametrique';
  }

  function setGain(i: number, v: number) {
    if (gainsRight !== null && editing === 'right') gainsRight = gainsRight.map((g, k) => (k === i ? v : g));
    else gains = gains.map((g, k) => (k === i ? v : g));
    queueSave();
  }
  function applyPreset(p: { gains: number[] }) {
    enCoursId = null;
    const next = bandCount === 10 ? [...p.gains] : resample(p.gains, GRIDS[10], BANDS);
    if (gainsRight !== null && editing === 'right') gainsRight = next; else gains = next;
    save();
  }
  /*
   * « Mes préréglages » — enregistrés CÔTÉ SERVEUR, donc partagés entre
   * appareils. Portés de l'ancien écran Égaliseur, seul à les offrir : ici on
   * choisissait parmi sept courbes figées, jamais la sienne.
   */
  let mesPresets = $state<api.EqProPreset[]>([]);

  /**
   * MIROIR LOCAL de la liste serveur — restauré de l'ancien écran, où il
   * existait (`EqualizerView.svelte`, `PRESETS_CACHE_KEY`) et a disparu avec
   * lui le 19/09 (phase 5, `d5ed7deb`).
   *
   * Sans lui, un serveur qui ne répond pas produisait `mesPresets = []` et
   * RIEN d'autre : une liste vide, muette, dont on ne peut que conclure que
   * ses préréglages ont été supprimés. Ils sont côté serveur, intacts.
   *
   * La clé est celle de v1, volontairement : c'est le même tiroir, pour la
   * même liste. La FORME stockée, elle, a changé — v1 y écrivait son propre
   * `CustomEqPreset` (`mode`/`gains`), v2 y écrit le préréglage serveur tel
   * qu'il arrive. Un reste de v1 est donc écarté à la lecture par
   * `estPresetServeur` plutôt qu'appliqué à moitié : un préréglage sans
   * bandes appliquerait une courbe plate en se présentant comme la sienne.
   */
  const CLE_CACHE_PRESETS = 'tune-eq-presets-cache';

  /** Le serveur n'a pas rendu la liste au dernier chargement. */
  let presetsServeurEchec = $state(false);
  /**
   * La liste affichée vient du miroir local, et il faut le dire.
   *
   * 🔴 LA CONDITION PORTE LE SENS. `eq.presetsLoadFailed` affirme « cette
   * liste vient du cache local » : la montrer sur une liste VIDE — stockage
   * indisponible, fenêtre privée, cache jamais écrit — serait un mensonge de
   * plus. v1 ne faisait pas cette distinction (son avertissement ne dépendait
   * que de l'échec serveur) ; c'est le seul point où l'on s'en écarte, et
   * dans le sens de la vérité.
   */
  const presetsDuCache = $derived(presetsServeurEchec && mesPresets.length > 0);

  /**
   * Ce qui ressemble vraiment à un préréglage serveur. Tout le reste est
   * écarté : un cache venu d'une autre version, ou trafiqué à la main, ne
   * doit pas remonter jusqu'aux curseurs.
   */
  function estPresetServeur(v: unknown): v is api.EqProPreset {
    if (!v || typeof v !== 'object') return false;
    const p = v as Record<string, unknown>;
    return typeof p.id === 'string' && p.id.length > 0
      && typeof p.name === 'string' && p.name.length > 0
      && (p.eq_type === 'graphic' || p.eq_type === 'parametric')
      && Array.isArray(p.bands);
  }

  /**
   * Le miroir local, ou `null` s'il n'y en a pas.
   *
   * Le stockage local est FAILLIBLE : fenêtre privée, données effacées, quota
   * atteint, `localStorage` refusé par la politique du navigateur — l'accès
   * lui-même peut lever. Tout est donc dans le `try`, y compris la lecture de
   * la propriété, et un échec rend `null` : l'écran reste juste, simplement
   * sans filet.
   */
  function lireCachePresets(): api.EqProPreset[] | null {
    try {
      const brut = localStorage.getItem(CLE_CACHE_PRESETS);
      if (!brut) return null;
      const lu: unknown = JSON.parse(brut);
      if (!Array.isArray(lu)) return null;
      return lu.filter(estPresetServeur);
    } catch (e) {
      console.warn('EQ miroir local des préréglages (lecture) —', e);
      return null;
    }
  }

  /** Rafraîchit le miroir. Un stockage qui refuse n'interrompt rien. */
  function ecrireCachePresets(liste: api.EqProPreset[]) {
    try {
      localStorage.setItem(CLE_CACHE_PRESETS, JSON.stringify(liste));
    } catch (e) {
      console.warn('EQ miroir local des préréglages (écriture) —', e);
    }
  }

  /**
   * QUEL préréglage est en vigueur — Thierry Clémont, 22/09/2026 : « quelle
   * égalisation est-elle choisie ? aucun moyen de le savoir alors qu'il eût
   * suffi de la surligner ».
   *
   * Rien ne le mémorisait : ni l'écran, ni le serveur, qui ne garde que les
   * bandes. On le RETROUVE donc en comparant la courbe affichée à chaque
   * préréglage — la seule façon honnête, et celle qui survit à un
   * rechargement de page comme à un changement de zone. Dès qu'un curseur
   * bouge, plus rien ne correspond : la marque s'éteint toute seule, ce qui
   * est exactement ce qu'on veut dire.
   */
  function memeGain(a: number | null | undefined, b: number | null | undefined): boolean {
    // Un dixième de dB : les courbes voyagent en JSON et repassent par des
    // arrondis d'affichage ; exiger l'égalité binaire ferait clignoter la
    // marque sans raison.
    return Math.abs((a ?? 0) - (b ?? 0)) < 0.05;
  }

  /** Le préréglage intégré dont la courbe est exactement celle affichée. */
  const presetActif: string | null = $derived.by(() => {
    if (sousMode !== 'graphique') return null;
    // Ticket 177 — la grille à plat d'une courbe paramétrique n'est pas « Plat ».
    if (courbeEnServiceParametrique) return null;
    // Les sept courbes sont écrites sur la grille à DIX bandes : sur une
    // autre résolution, la comparaison n'aurait pas de sens.
    if (bandCount !== 10) return null;
    if (gainsRight !== null) return null;
    return PRESETS.find((p) => p.gains.every((g, i) => memeGain(g, gains[i])))?.key ?? null;
  });

  /** La courbe affichée est-elle exactement celle de ce préréglage personnel ? */
  function correspond(p: api.EqProPreset): boolean {
    const bandes = p.bands ?? [];
    if (!bandes.length) return false;
    if (p.eq_type === 'parametric') {
      if (sousMode !== 'parametrique') return false;
      return bandes.length === pBandes.length
        && bandes.every((b, i) => b.freq === pBandes[i].freq && memeGain(b.gain, pBandes[i].gain));
    }
    if (sousMode !== 'graphique' || gainsRight !== null) return false;
    if (courbeEnServiceParametrique) return false;
    return bandes.length === BANDS.length
      && bandes.every((b, i) => b.freq === BANDS[i] && memeGain(b.gain, gains[i]));
  }

  /** Le préréglage PERSONNEL dont la courbe est celle affichée. */
  const mienActif: string | null = $derived.by(() => mesPresets.find(correspond)?.id ?? null);

  /**
   * web#1750 — le préréglage personnel EN COURS D'ÉDITION : le dernier
   * appliqué ou enregistré. `mienActif` ne suffit pas : il s'éteint au premier
   * curseur touché, c'est-à-dire précisément quand on voudrait « Enregistrer ».
   *
   * Il s'efface quand la courbe cesse d'en descendre : préréglage intégré,
   * remise à plat, changement de zone (une autre zone, une autre courbe), ou
   * suppression du préréglage. Il SURVIT au passage graphique/paramétrique :
   * « Enregistrer » écrit alors la courbe dans le mode affiché.
   */
  let enCoursId = $state<string | null>(null);
  const presetEnCours = $derived(mesPresets.find((p) => p.id === enCoursId) ?? null);
  /** « Modifié, non enregistré » : la courbe affichée n'est plus la sienne. */
  const modifie = $derived(presetEnCours != null && !correspond(presetEnCours));
  async function chargerMesPresets() {
    // 1) Peinture immédiate depuis le miroir — l'ordre de v1.
    const cache = lireCachePresets();
    if (cache?.length) mesPresets = cache;
    // 2) Source de vérité : le serveur, partagé entre appareils.
    try {
      mesPresets = await api.listEqPresets();
      presetsServeurEchec = false;
      ecrireCachePresets($state.snapshot(mesPresets));
    } catch (e) {
      // 🔴 ON NE VIDE PLUS LA LISTE. Elle reste celle du miroir, et
      // l'avertissement dit d'où elle vient — la taire revenait à annoncer
      // une suppression qui n'a pas eu lieu.
      presetsServeurEchec = true;
      console.warn('EQ liste des préréglages serveur —', e);
    }
  }
  $effect(() => { void chargerMesPresets(); });

  /** La courbe affichée, sous la forme d'un préréglage. */
  function courbeAEnregistrer(nom: string) {
    const eq_type = sousMode === 'parametrique' ? 'parametric' : 'graphic';
    const bands: EqBand[] = sousMode === 'parametrique'
      ? $state.snapshot(pBandes)
      : bandesGraphiques(BANDS, gains, null, GRID_Q[bandCount] ?? 1.0);
    return { name: nom, eq_type, bands };
  }

  /**
   * Écrit la courbe sous ce nom. Un préréglage de ce nom existe déjà : il est
   * mis à jour SUR PLACE (`PUT`, même id) — plus de « supprimer puis
   * recréer », dont un échec de suppression laissait un doublon.
   */
  async function ecrirePreset(nom: string, cible: api.EqProPreset | undefined) {
    // Résolus AVANT l'attente : un `$t()` dans un `catch` est invisible au build.
    const msgOk = $t('eq.presetSaved' as any).replace('{name}', nom);
    const msgKo = $t('eq.presetSaveFailed' as any);
    const corps = courbeAEnregistrer(nom);
    try {
      const ecrit = cible ? await api.updateEqPreset(cible.id, corps) : await api.createEqPreset(corps);
      mesPresets = cible
        ? mesPresets.map((p) => (p.id === cible.id ? ecrit : p))
        : [...mesPresets, ecrit];
      enCoursId = ecrit.id;
      ecrireCachePresets($state.snapshot(mesPresets));
      notifications.success(msgOk);
    } catch {
      notifications.error(msgKo);
    }
  }

  /** « Enregistrer » : le préréglage en cours, sans redemander son nom. */
  async function enregistrer() {
    const p = presetEnCours;
    if (!p) return;
    await ecrirePreset(p.name, p);
  }

  /** « Enregistrer sous » : un nom, prérempli avec celui du préréglage en cours. */
  async function enregistrerSous() {
    const saisi = await dialogs.prompt($t('eq.presetNamePlaceholder' as any), presetEnCours?.name ?? '');
    const nom = saisi?.trim();
    if (!nom) return;
    await ecrirePreset(nom, mesPresets.find((p) => p.name === nom));
  }

  function appliquerMonPreset(p: api.EqProPreset) {
    enCoursId = p.id;
    const bandes = p.bands ?? [];
    if (p.eq_type === 'parametric') {
      pBandes = bandes.map((b) => ({ ...b }));
      sousMode = 'parametrique';
    } else {
      const g = bandes.map((b) => b.gain);
      const grille = bandes.map((b) => b.freq);
      // Enregistré sur une autre grille : on rééchantillonne sur la courante.
      gains = g.length === BANDS.length ? g : resample(g, grille, BANDS);
      sousMode = 'graphique';
    }
    if (!enabled) enabled = true;
    void save();
  }

  async function supprimerMonPreset(p: api.EqProPreset) {
    const avant = mesPresets;
    mesPresets = mesPresets.filter((x) => x.id !== p.id);
    try {
      await api.deleteEqPreset(p.id);
      if (enCoursId === p.id) enCoursId = null;
      // Le miroir ne suit qu'une suppression CONFIRMÉE : anticiper ferait
      // disparaître du cache un préréglage que le serveur a gardé.
      ecrireCachePresets($state.snapshot(mesPresets));
    } catch {
      // La suppression n'a pas eu lieu : la liste revient, et on le dit.
      mesPresets = avant;
      notifications.error($t('common.error' as any));
    }
  }

  /**
   * web#1647 — importer un fichier PEQ (AutoEq « ParametricEQ.txt »). Le
   * serveur l'analyse et l'enregistre dans « Mes presets » ; on l'ouvre en
   * paramétrique, sauf si le fichier demande plus de marge que ses gains n'en
   * justifient : il est alors seulement ajouté, et l'écran dit pourquoi.
   */
  let fichierPeq: HTMLInputElement | null = $state(null);
  let importEnCours = $state(false);
  let bilanPeq = $state<BilanImportPeq | null>(null);
  async function importerPeq(e: Event) {
    const champ = e.currentTarget as HTMLInputElement;
    const fichier = champ.files?.[0];
    champ.value = '';
    if (!fichier) return;
    // Résolus AVANT l'attente : un `$t()` dans un `catch` est invisible au build.
    const msgTropGros = $t('eq.importPeqTooLarge' as any);
    const msgKo = $t('eq.importPeqFailed' as any);
    const msgOk = $t('eq.importPeqDone' as any);
    if (fichier.size > TAILLE_MAX_FICHIER_PEQ) {
      notifications.error(msgTropGros);
      return;
    }
    importEnCours = true;
    try {
      const texte = await fichier.text();
      const r = await api.importAutoEqPreset({ text: texte, name: nomDuFichierPeq(fichier.name) });
      const bilan = bilanImportPeq(r);
      bilanPeq = bilan;
      mesPresets = [...mesPresets.filter((p) => p.id !== r.preset.id), r.preset];
      ecrireCachePresets($state.snapshot(mesPresets));
      notifications.success(msgOk.replace('{name}', bilan.nom).replace('{count}', String(bilan.bandes)));
      if (!bilan.alerte) appliquerMonPreset(r.preset);
    } catch (err) {
      // 402 : `fetchJSON` a déjà dit le refus Premium dans la langue de l'écran.
      if ((err as { status?: number })?.status !== 402) {
        const detail = err instanceof Error ? err.message : String(err);
        notifications.error(msgKo.replace('{detail}', detail));
      }
    } finally {
      importEnCours = false;
    }
  }

  function reset() {
    enCoursId = null;
    gains = Array(BANDS.length).fill(0);
    if (gainsRight !== null) gainsRight = Array(BANDS.length).fill(0);
    save();
  }
  function toggle() { enabled = !enabled; save(); }
  async function setBands(n: number) {
    const from = BANDS, prevRight = gainsRight;
    bandCount = n;
    const to = GRIDS[n];
    gains = resample(gains, from, to);
    if (prevRight) gainsRight = resample(prevRight, from, to);
    try { await api.setEqExpertSettings(n); } catch { /* vieux serveur : la grille reste locale */ }
    save();
  }
  /** Délier : la droite part de la gauche, à l'identique. Rien ne doit changer
   *  à ce qu'on entend — c'est une préparation, pas un réglage. */
  function unlink() { gainsRight = [...gains]; editing = 'left'; save(); }
  /** Relier : la courbe qui SURVIT est celle de gauche. Il faut en choisir
   *  une ; une moyenne inventerait une courbe que personne n'a réglée. */
  function relink() { gainsRight = null; editing = 'left'; save(); }

  function freqLabel(f: number): string { return f >= 1000 ? `${f / 1000}k` : `${f}`; }
</script>

<section class="v2-eq tune-v2">
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$t('v2.eq.eyebrow' as any)}</div>
      <h1>{$t('v2.eq.title' as any)}</h1>
    </div>
    {#if !nonInstalle}
      <div class="v2-actions">
        <label class="sw">
          <input type="checkbox" checked={enabled} onchange={toggle} disabled={pur} />
          <span class="slider"></span>
        </label>
        <span class="onoff">{enabled ? $t('v2.eq.on' as any) : $t('v2.eq.off' as any)}</span>
        <button class="v2-btn" onclick={reset} disabled={pur}>{$t('v2.eq.reset' as any)}</button>
      </div>
    {/if}
  </header>

  {#if error}<div class="err">{error}</div>{/if}
  {#if redemarrageRequis}<div class="restart plugin-restart">{$t('v2.eq.pluginRestart' as any)}</div>{/if}

  <div class="scroll">
    {#if loading}
      <div class="state">{$t('v2.tool.loading' as any)}</div>
    {:else if nonInstalle}
      <!-- Greffon absent : pas de curseurs qui bougent pour rien. Une phrase,
           UN bouton — et, si une configuration existait avant la mise à jour,
           la vérité : les réglages sont là, il suffit de réinstaller. -->
      <div class="plugin">
        {#if installationProposee}
          <div class="plugin-banner">{$t('v2.eq.pluginProposed' as any)}</div>
        {/if}
        <p class="plugin-text">{$t('v2.eq.pluginNotInstalled' as any)}</p>
        <button class="v2-btn plugin-install" disabled={installation} onclick={installerGreffon}>
          {installation ? $t('v2.eq.pluginInstalling' as any) : $t('v2.eq.pluginInstall' as any)}
        </button>
      </div>
    {:else if $currentZoneId == null}
      <div class="state">{$t('v2.eq.noZone' as any)}</div>
    {:else if lectureEchouee}
      <!-- Ticket 177 — la courbe en service n'a pas pu être relue : rien
           d'éditable, sinon le premier geste la remplacerait par une courbe
           plate que personne n'a réglée. -->
      <div class="state lecture-echouee">
        <p>{$t('v2.eq.readFailed' as any)}</p>
        <button class="v2-btn" onclick={() => rechargement++}>{$t('v2.eq.retry' as any)}</button>
      </div>
    {:else}
      <!-- web#1674 — en PURE, l'écran est VOILÉ : un message, et tous les
           réglages grisés d'un bloc par le fieldset (boutons, curseurs, et
           ceux des sous-écrans). Hors PURE, le fieldset ne change rien. -->
      {#if pur}<VoilePur cle="v2.pure.veilEq" />{/if}
      <fieldset class="reglages" class:voile={pur} disabled={pur} aria-disabled={pur}>
      <div class="presets">
        {#each PRESETS as p (p.key)}
          {@const actif = presetActif === p.key}
          <button class:actif aria-pressed={actif} onclick={() => applyPreset(p)}>{$t(p.labelKey as any)}</button>
        {/each}
      </div>
      <div class="presets mes">
        <span class="mesl">{$t('eq.myPresets' as any)}</span>
        {#each mesPresets as p (p.id)}
          {@const actif = mienActif === p.id}
          <span class="mien">
            <button class:actif aria-pressed={actif} onclick={() => appliquerMonPreset(p)}>{p.name}</button>
            <button class="x" onclick={() => supprimerMonPreset(p)}
              title={$t('eq.deletePreset' as any)} aria-label={$t('eq.deletePreset' as any)}>×</button>
          </span>
        {/each}
        <!-- web#1750 — « Enregistrer » et « Enregistrer sous », comme partout
             ailleurs. Sans préréglage en cours, il n'y a rien à mettre à jour :
             le seul geste est d'en créer un. -->
        {#if presetEnCours}
          {#if modifie}<span class="modif">{$t('eq.presetModified' as any)}</span>{/if}
          <button class="enreg" disabled={!modifie} onclick={enregistrer}
            title={$t('eq.saveTitle' as any).replace('{name}', presetEnCours.name)}>{$t('eq.save' as any)}</button>
          <button class="enreg-sous" onclick={enregistrerSous}>{$t('eq.saveAs' as any)}</button>
        {:else}
          <button class="enreg-sous" onclick={enregistrerSous}>+ {$t('eq.savePreset' as any)}</button>
        {/if}
        <!-- web#1647 — un fichier PEQ (AutoEq, Equalizer APO) au lieu de dix
             bandes saisies à la main. -->
        <button class="import-peq" disabled={importEnCours} onclick={() => fichierPeq?.click()}
          title={$t('eq.importPeqTitle' as any)}>{$t('eq.importPeq' as any)}</button>
        <input class="import-peq-fichier" type="file" accept=".txt,text/plain" hidden
          bind:this={fichierPeq} onchange={importerPeq} />
      </div>
      {#if bilanPeq}
        <!-- Le bilan est DIT, pas avalé : bandes retenues, lignes écartées,
             préampli du fichier non appliqué en plus de la réserve de Tune. -->
        <div class="bilan-peq" class:alerte={bilanPeq.alerte} role="status">
          <p>{$t('eq.importPeqSummary' as any).replace('{name}', bilanPeq.nom).replace('{count}', String(bilanPeq.bandes))}</p>
          {#if bilanPeq.lignesIgnorees}
            <p class="ignores">{$t('eq.importPeqIgnored' as any).replace('{lines}', bilanPeq.lignesIgnorees)}</p>
          {/if}
          {#if bilanPeq.preampDb !== null && bilanPeq.reserveDb !== null}
            <p>{$t('eq.importPeqPreamp' as any).replace('{preamp}', db(bilanPeq.preampDb)).replace('{reserved}', db(bilanPeq.reserveDb))}</p>
          {/if}
          {#if bilanPeq.alerte}
            <p class="avert">{$t('eq.importPeqWarning' as any)}</p>
          {/if}
        </div>
      {/if}

      <!-- La liste vient du miroir local : elle peut être périmée, et
           enregistrer échouera de la même façon. Ce chemin part au montage,
           sans geste de l'utilisateur — une notification y serait du bruit,
           mais se taire laissait croire que le serveur avait répondu, donc que
           les préréglages absents avaient été supprimés. -->
      {#if presetsDuCache}
        <p class="mes-cache">{$t('eq.presetsLoadFailed' as any)}</p>
      {/if}

      {#if showExpert}
        <!--
          Graphique ou paramétrique. Niveau Expert seulement : le paramétrique
          demande de savoir ce qu'est un Q, et le proposer plus tôt encombrerait
          l'écran de quelqu'un qui cherchait juste « plus de graves ».
        -->
        <div class="modes">
          <button class:on={sousMode === 'graphique'} onclick={() => (sousMode = 'graphique')}>
            {$t('v2.eq.modeGraphic' as any)}
          </button>
          <button class:on={sousMode === 'parametrique'} onclick={versParametrique}>
            {$t('v2.eq.modeParametric' as any)}
          </button>
          <!--
            L'ASSISTANT n'ecrit pas de bandes : il envoie un profil
            (`eq_profile`) sur une AUTRE route, `PATCH /zones/{id}/dsp`, et le
            serveur en deduit la correction. C'est pourquoi il remplace tout le
            volet plutot que de s'y ajouter — melanger les deux enverrait deux
            corrections concurrentes a la meme zone.
          -->
          <button class:on={sousMode === 'assistant'} onclick={() => (sousMode = 'assistant')}>
            {$t('v2.eq.modeAssistant' as any)}
          </button>
        </div>
      {/if}

      {#if sousMode === 'assistant'}
        <ProfilerV2 />
      {:else if sousMode === 'parametrique'}
        <ParametricEq bind:bands={pBandes} {enabled} onchange={surChangementParametrique} />
      {:else}

      {#if showExpert}
        <div class="ctrls">
          <span class="cl">{$t('v2.eq.resolution' as any)}</span>
          <div class="seg">
            {#each [10, 15, 31] as n (n)}
              <button class:on={bandCount === n} onclick={() => setBands(n)}>{$t('v2.eq.bands' as any).replace('{count}', String(n))}</button>
            {/each}
          </div>
          <span class="cl sep">{$t('v2.eq.channels' as any)}</span>
          {#if gainsRight === null}
            <button class="lnk" onclick={unlink}>{$t('v2.eq.unlink' as any)}</button>
            <span class="note">{$t('v2.eq.unlinkNote' as any)}</span>
          {:else}
            <div class="seg">
              <button class:on={editing === 'left'} onclick={() => (editing = 'left')}>{$t('v2.eq.left' as any)}</button>
              <button class:on={editing === 'right'} onclick={() => (editing = 'right')}>{$t('v2.eq.right' as any)}</button>
            </div>
            <button class="lnk" onclick={relink}>{$t('v2.eq.relink' as any)}</button>
            <span class="note">{$t('v2.eq.relinkNoteA' as any)} <b>{$t('v2.eq.relinkNoteLeft' as any)}</b> {$t('v2.eq.relinkNoteB' as any)}</span>
          {/if}
        </div>
      {/if}

      {#if courbeEnServiceParametrique}
        <p class="note-peq">{$t('v2.eq.graphicHidesParametric' as any)}</p>
      {/if}
      <div class="board" class:off={!enabled}>
        {#each BANDS as f, i (f)}
          <div class="band">
            <span class="g">{curve[i] > 0 ? '+' : ''}{(curve[i] ?? 0).toFixed(1)}</span>
            <!-- Verticalite par CSS (`writing-mode`) : l'attribut `orient` est un
                 heritage Firefox, absent des types et sans effet ailleurs. -->
            <input class="v" type="range" min={MIN_GAIN} max={MAX_GAIN} step="0.5"
              value={curve[i] ?? 0} disabled={!enabled}
              oninput={(e) => setGain(i, Number((e.currentTarget as HTMLInputElement).value))}
              aria-label={`${freqLabel(f)} Hz`} />
            <span class="f">{freqLabel(f)}</span>
          </div>
        {/each}
      </div>


      {/if}
      <!-- tune-server-rust#5171 — la réserve, hors du choix de mode elle aussi :
           elle protège la courbe quelle que soit la façon de la composer.
           Cachée quand le serveur ne connaît pas le réglage. -->
      {#if reserve}
        <div class="ctrls reserve">
          <span class="cl">{$t('v2.eq.headroom' as any)}</span>
          <div class="seg" role="radiogroup" aria-label={$t('v2.eq.headroom' as any)}>
            <button role="radio" aria-checked={reserve === 'safe'} class:on={reserve === 'safe'}
              disabled={reserveEnCours} onclick={() => choisirReserve('safe')}>{$t('v2.eq.headroomSafe' as any)}</button>
            <button role="radio" aria-checked={reserve === 'realistic'} class:on={reserve === 'realistic'}
              disabled={reserveEnCours} onclick={() => choisirReserve('realistic')}>{$t('v2.eq.headroomRealistic' as any)}</button>
          </div>
          <span class="note">{$t('v2.eq.headroomHelp' as any)}</span>
        </div>
      {/if}
      <!-- tune-server-rust#4685 — hors du choix de mode : la compensation vaut
           pour la courbe, quelle que soit la façon de la composer. -->
      <CompensationNiveauV2 revision={revisionDsp} />
      </fieldset>
    {/if}
  </div>
</section>

<style>
  .v2-eq{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .onoff{font:11px var(--v2-mono); color:var(--v2-txt3); margin-right:auto}
  .reglages{border:0; margin:0; padding:0; min-width:0}
  .note-peq{margin:0 0 12px; font-size:12px; line-height:1.45; color:var(--v2-txt3)}
  .lecture-echouee{display:flex; flex-direction:column; align-items:flex-start; gap:12px}
  .lecture-echouee p{margin:0}
  .reglages.voile{opacity:.45; pointer-events:none; user-select:none}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:var(--v2-r-pill); padding:8px 15px; font:600 12px var(--v2-sans)}
  .lnk:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .lnk.sm{padding:5px 12px; font-size:11.5px; margin-left:8px}
  .modes{display:flex; gap:7px; margin:2px 0 18px}
  .modes button{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2);
    cursor:pointer; border-radius:999px; padding:6px 15px; font:600 12px var(--v2-sans)}
  .modes button:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .modes button.on{border-color:var(--v2-acc1); color:var(--v2-acc1)}

  .sw{position:relative; flex:0 0 auto; width:46px; height:26px; cursor:pointer; margin-bottom:3px}
  .sw input{position:absolute; opacity:0; width:0; height:0}
  .slider{position:absolute; inset:0; border-radius:999px; background:var(--v2-line2); transition:.18s}
  .slider::before{content:""; position:absolute; left:3px; top:3px; width:20px; height:20px; border-radius:50%;
    background:var(--v2-knob); transition:.18s}
  .sw input:checked + .slider{background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .sw input:checked + .slider::before{transform:translateX(20px)}

  .err{margin:0 30px 10px; padding:10px 14px; border-radius:10px; font-size:12.5px;
    color:var(--v2-danger); border:1px solid var(--v2-danger-bd)}
  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:26px 0; color:var(--v2-txt3)}
  .restart{margin:0 30px 10px; padding:9px 14px; border-radius:10px; font-size:12.5px;
    border:1px solid var(--v2-acc2); background:var(--v2-acc-soft); color:var(--v2-acc-tint)}

  .plugin{display:flex; flex-direction:column; align-items:flex-start; gap:14px; max-width:64ch; padding:26px 0}
  .plugin-banner{padding:12px 16px; border-radius:11px; font-size:12.5px; line-height:1.55;
    border:1px solid var(--v2-acc2); background:var(--v2-acc-soft); color:var(--v2-acc-tint)}
  .plugin-text{font-size:13.5px; line-height:1.55; color:var(--v2-txt2)}
  .plugin-install:disabled{opacity:.55; cursor:progress}

  .presets{display:flex; gap:7px; flex-wrap:wrap; padding:2px 0 16px}
  .presets.mes{align-items:center; margin-top:-8px}
  .mesl{font:10px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3)}
  .mien{display:inline-flex}
  .mien .x{padding:0 7px}
  .modif{font:italic 11.5px var(--v2-sans); color:var(--v2-acc-tint)}
  .bilan-peq{margin:-8px 0 16px; padding:9px 14px; border-radius:10px; font-size:12.5px; line-height:1.5;
    border:1px solid var(--v2-line2); color:var(--v2-txt2)}
  .bilan-peq p{margin:0}
  .bilan-peq.alerte{border-color:var(--v2-acc2); background:var(--v2-acc-soft); color:var(--v2-acc-tint)}
  .presets button:disabled{opacity:.45; cursor:default}
  /* Un avertissement, pas une erreur : la liste est utilisable, elle est
     seulement peut-être périmée. D'où le ton d'accentuation et non le rouge
     de `.err`, qui dirait à tort que rien ne marche. */
  .mes-cache{margin:-8px 0 16px; padding:9px 14px; border-radius:10px; font-size:12.5px; line-height:1.5;
    border:1px solid var(--v2-acc2); background:var(--v2-acc-soft); color:var(--v2-acc-tint)}
  .presets button{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    font:600 12px var(--v2-sans); padding:8px 15px; border-radius:var(--v2-r-pill); transition:.15s}
  .presets button:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  /* Le préréglage EN VIGUEUR. Bordure ET fond teinté : la seule bordure se
     confond avec le survol, et un écran se lit d'un coup d'œil, sans
     promener la souris. */
  .presets button.actif{color:var(--v2-acc1); border-color:var(--v2-acc1);
    background:color-mix(in srgb, var(--v2-acc1) 14%, transparent)}

  .ctrls{display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:0 0 18px}
  .cl{font:10px var(--v2-mono); letter-spacing:.12em; text-transform:uppercase; color:var(--v2-txt3)}
  .cl.sep{margin-left:12px}
  .seg{display:flex; gap:2px; padding:3px; border-radius:11px; background:var(--v2-surface2); border:1px solid var(--v2-line)}
  .seg button{border:0; background:transparent; color:var(--v2-txt2); font:600 11.5px var(--v2-sans);
    padding:6px 12px; border-radius:8px; cursor:pointer}
  .seg button.on{color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .note{font-size:11px; color:var(--v2-txt3)}
  .ctrls.reserve{padding-top:18px}
  .note b{color:var(--v2-txt2)}

  .board{display:flex; align-items:flex-end; gap:4px; padding:18px 16px 10px; border-radius:14px;
    border:1px solid var(--v2-line); background:var(--v2-surface2); overflow-x:auto}
  .board.off{opacity:.4}
  .board::-webkit-scrollbar{height:8px}.board::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .band{display:flex; flex-direction:column; align-items:center; gap:8px; flex:1 1 0; min-width:34px}
  .band .g{font:10px var(--v2-mono); color:var(--v2-acc2); min-height:13px}
  .band .f{font:9.5px var(--v2-mono); color:var(--v2-txt3); white-space:nowrap}
  .band .v{writing-mode:vertical-lr; direction:rtl; width:22px; height:190px; accent-color:var(--v2-acc1); cursor:pointer}

  .more{margin-top:20px; padding:13px 16px; border-radius:11px; font-size:12.5px; line-height:1.55;
    color:var(--v2-txt3); border:1px dashed var(--v2-line2)}
  .more b{color:var(--v2-txt2)}
</style>
