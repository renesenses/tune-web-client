/**
 * « Ce qui tourne » — l'écran État du serveur dit quelles tâches de fond
 * travaillent, lesquelles cèdent à la lecture ou sont en pause, et pourquoi.
 *
 * renesenses/tune-server-rust#4681, étape 4 du chantier « priorité de la
 * lecture ». Tout se lit dans `GET /system/background-tasks`, déjà sondé par
 * l'écran toutes les 5 s :
 *
 *  - `pausable[]` : les traitements nommés (`replaygain`, `fingerprints`,
 *    `dynamic_range`, `acoustic`, `enrichment`, `artist_images`,
 *    `identification`), leur `state` (`en_cours` | `en_pause` | `au_repos`) et
 *    `throttled_for_playback` (ils ont cédé à la lecture dans les 90 s) ;
 *  - `scan` : `running` et `throttled_for_playback` ;
 *  - `tasks[]` : les tâches INSCRITES au registre le temps qu'elles vivent,
 *    avec leur libellé et parfois leur avancement ;
 *  - `playback_priority` : une zone joue-t-elle, depuis quand, la politique en
 *    vigueur et les compteurs des freins ;
 *  - depuis l'étape 3 du serveur (#6310) : `activity` et `reason` sur chaque
 *    traitement et sur le scan — quand ils sont publiés, ils PRIMENT sur la
 *    déduction faite à partir de `state` / `throttled_for_playback` (gardée
 *    pour un serveur plus ancien) — et `playback_priority.background_compute`,
 *    le pool du calcul de fond en basse priorité.
 *
 * Règle de l'écran : rien n'est inventé. Un champ absent (serveur plus ancien)
 * ne produit aucune ligne ; un identifiant que ce client ne sait pas nommer
 * n'est pas montré ; une durée n'est citée que si le serveur la publie.
 */
import type { InstantaneTachesDeFond, TacheDeFond } from './tachesDeFond';

/** Les passes qui DÉCODENT : pendant la lecture, elles s'arrêtent (elles ne
 *  ralentissent pas) et reprennent seules quand plus rien ne joue. */
export const PASSES_QUI_DECODENT = ['replaygain', 'fingerprints', 'dynamic_range', 'acoustic'] as const;

/** Les traitements que ce client sait nommer, dans l'ordre de l'écran. */
export const TRAITEMENTS_CONNUS = [
  'replaygain',
  'fingerprints',
  'dynamic_range',
  'acoustic',
  'enrichment',
  'artist_images',
  'identification',
] as const;

/**
 * Les inscriptions du registre qui appartiennent à un traitement nommé : le
 * serveur (`routes/system/taches_de_fond.rs`, `etat_de`) dit « en cours » pour
 * ces traitements précisément parce qu'une de ces inscriptions existe. On les
 * rattache à leur ligne (pour l'avancement) au lieu de les montrer deux fois.
 */
export const INSCRIPTIONS_DU_TRAITEMENT: Record<string, readonly string[]> = {
  enrichment: ['enrich_all', 'bios', 'credits_enrich_auto'],
  artist_images: ['artist_artwork', 'artwork'],
  identification: ['identification_lot'],
};

/** Le nom de chaque traitement, en clés ÉCRITES en entier : la garde i18n
 *  lit les clés appelées, elle ne devine pas une composition. */
export const NOM_DU_TRAITEMENT: Record<string, string> = {
  replaygain: 'v2.health.running.task.replaygain',
  fingerprints: 'v2.health.running.task.fingerprints',
  dynamic_range: 'v2.health.running.task.dynamic_range',
  acoustic: 'v2.health.running.task.acoustic',
  enrichment: 'v2.health.running.task.enrichment',
  artist_images: 'v2.health.running.task.artist_images',
  identification: 'v2.health.running.task.identification',
};

export type EtatLigne = 'en_cours' | 'ralentie' | 'cedee' | 'en_pause';

/** Une ligne de l'écran. Les textes sont des CLÉS i18n et leurs paramètres. */
export type LigneCeQuiTourne = {
  id: string;
  /** Clé i18n du nom, ou `null` quand le serveur donne un libellé (`libelle`). */
  nomCle: string | null;
  libelle?: string;
  etat: EtatLigne;
  /** Clé i18n du « pourquoi », absente quand il n'y a rien à expliquer. */
  raisonCle?: string;
  params?: Record<string, string | number>;
  /** Avancement publié par le registre, quand il y en a un. */
  avancement?: { fait: number; total: number; detail: string };
};

/** Les activités publiées par le serveur (#6310). Un autre mot est ignoré :
 *  l'écran retombe alors sur sa déduction. */
export const ACTIVITES = ['working', 'throttled', 'yielded', 'paused', 'idle'] as const;
export type Activite = (typeof ACTIVITES)[number];

const activiteDe = (v: unknown): Activite | null =>
  typeof v === 'string' && (ACTIVITES as readonly string[]).includes(v) ? (v as Activite) : null;

/** Le calcul de fond en basse priorité (`playback_priority.background_compute`). */
export type CalculDeFond = {
  /** La politique envoie le calcul aux fils baissés. */
  pool: boolean;
  /** Le serveur a armé la baisse. */
  arme: boolean;
  /** `nice_10` | `qos_background` | `thread_mode_background` | `none`, ou
   *  `null` tant qu'aucun fil n'est né. */
  cpu: string | null;
  /** `idle` | `best_effort_7` | `qos_background` | `thread_mode_background` |
   *  `none`, ou `null`. */
  io: string | null;
  fils: number | null;
  filsLibres: number | null;
  travaux: number | null;
  /** `policy.background_compute_low_priority === false` : réglage coupé. */
  regleCoupe: boolean;
};

/** Les valeurs de `cpu` / `io` que ce client sait nommer, en clés ÉCRITES en
 *  entier (la garde i18n ne devine pas une composition). */
export const NOM_DE_LA_PRIORITE: Record<string, string> = {
  nice_10: 'v2.health.running.prio.nice_10',
  qos_background: 'v2.health.running.prio.qos_background',
  thread_mode_background: 'v2.health.running.prio.thread_mode_background',
  idle: 'v2.health.running.prio.idle',
  best_effort_7: 'v2.health.running.prio.best_effort_7',
  none: 'v2.health.running.prio.none',
};

/** La clé i18n d'une priorité publiée, ou `null` si inconnue (rien d'inventé). */
export function clePriorite(v: string | null): string | null {
  return v !== null && Object.prototype.hasOwnProperty.call(NOM_DE_LA_PRIORITE, v) ? NOM_DE_LA_PRIORITE[v] : null;
}

export type CeQuiTourne = {
  /** `null` : le serveur ne publie pas `playback_priority` (rien à en dire). */
  lecture: null | {
    active: boolean;
    zones: number;
    depuisEpochS: number | null;
    freinsDesactives: boolean;
  };
  lignes: LigneCeQuiTourne[];
  /** Traitements nommés au repos : comptés, pas listés. */
  auRepos: number;
  freins: null | {
    fichiersDeScanRetenus: number;
    lecturesDifferees: number;
    lecturesDiffereesMs: number;
    ecrituresDifferees: number;
    ecrituresDiffereesMs: number;
    prioriteBasseAppliquee: number;
  };
  /** `null` : le serveur ne publie pas le bloc (antérieur à #6310). */
  calcul: CalculDeFond | null;
};

const nombre = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

function avancementDe(t: TacheDeFond | undefined): LigneCeQuiTourne['avancement'] {
  const p = t?.progress;
  if (!p || !(p.total > 0)) return undefined;
  return { fait: p.processed, total: p.total, detail: p.detail ?? '' };
}

/**
 * Ce que l'écran affiche, ou `null` quand le serveur ne publie ni l'état des
 * traitements ni la priorité de lecture : la section se tait plutôt que de
 * dire « rien ne tourne » sans le savoir.
 */
export function ceQuiTourne(inst: InstantaneTachesDeFond | null | undefined): CeQuiTourne | null {
  if (!inst) return null;
  const pp = inst.playback_priority;
  const pausable = Array.isArray(inst.pausable) ? inst.pausable : null;
  if (!pausable && !pp) return null;

  const lignes: LigneCeQuiTourne[] = [];
  let auRepos = 0;
  const taches = Array.isArray(inst.tasks) ? inst.tasks : [];
  const rattachees = new Set<string>();
  const toutSuspendu = inst.all_paused === true;
  const pauseEntreElementsMs = nombre(pp?.pause_between_items_ms) ?? nombre(pp?.policy?.pause_between_items_ms);

  for (const id of TRAITEMENTS_CONNUS) {
    const t = pausable?.find((p) => p && p.id === id);
    if (!t) continue;
    const inscriptions = INSCRIPTIONS_DU_TRAITEMENT[id] ?? [];
    const inscrite = taches.find((x) => inscriptions.includes(x.id));
    for (const x of taches) if (inscriptions.includes(x.id)) rattachees.add(x.id);
    const nomCle = NOM_DU_TRAITEMENT[id];
    const decode = (PASSES_QUI_DECODENT as readonly string[]).includes(id);

    // Le serveur dit lui-même ce que fait la tâche (#6310) : il prime.
    const act = activiteDe(t.activity);
    if (act !== null) {
      if (act === 'paused') {
        lignes.push({
          id, nomCle, etat: 'en_pause',
          raisonCle: toutSuspendu ? 'v2.health.running.why.allPaused' : 'v2.health.running.why.paused',
        });
      } else if (act === 'yielded') {
        lignes.push({ id, nomCle, etat: 'cedee', raisonCle: 'v2.health.running.why.decodeYield' });
      } else if (act === 'throttled') {
        lignes.push({ id, nomCle, etat: 'ralentie', ...raisonDuRalenti(pauseEntreElementsMs), avancement: avancementDe(inscrite) });
      } else if (act === 'working') {
        lignes.push({ id, nomCle, etat: 'en_cours', avancement: avancementDe(inscrite) });
      } else {
        auRepos += 1;
      }
      continue;
    }

    if (t.paused || t.state === 'en_pause') {
      lignes.push({
        id, nomCle, etat: 'en_pause',
        raisonCle: toutSuspendu ? 'v2.health.running.why.allPaused' : 'v2.health.running.why.paused',
      });
      continue;
    }
    const cede = t.throttled_for_playback === true;
    if (cede && decode) {
      // Une passe qui décode s'ARRÊTE pendant la lecture : son état propre
      // peut dire « au repos », elle attend pourtant la fin de l'écoute.
      lignes.push({ id, nomCle, etat: 'cedee', raisonCle: 'v2.health.running.why.decodeYield' });
      continue;
    }
    if (t.state === 'en_cours') {
      if (cede) {
        lignes.push({ id, nomCle, etat: 'ralentie', ...raisonDuRalenti(pauseEntreElementsMs), avancement: avancementDe(inscrite) });
      } else {
        lignes.push({ id, nomCle, etat: 'en_cours', avancement: avancementDe(inscrite) });
      }
      continue;
    }
    auRepos += 1;
  }

  // Le scan : pas suspendable, mais il cède lui aussi (2 fichiers à la fois
  // au lieu de 32 par défaut, une pause entre deux paquets).
  const scan = inst.scan;
  const actScan = activiteDe(scan?.activity);
  const scanTourne = actScan !== null ? actScan === 'working' || actScan === 'throttled' : scan?.running === true;
  if (scanTourne) {
    if (actScan !== null ? actScan === 'throttled' : scan?.throttled_for_playback === true) {
      const largeur = nombre(pp?.policy?.scan_width);
      const pauseMs = nombre(pp?.policy?.pause_between_files_ms);
      lignes.push({
        id: 'scan', nomCle: 'v2.health.running.task.scan', etat: 'ralentie',
        ...(largeur !== null && pauseMs !== null
          ? { raisonCle: 'v2.health.running.why.scanNarrow', params: { n: largeur, ms: pauseMs } }
          : { raisonCle: 'v2.health.running.why.slowed' }),
      });
    } else {
      lignes.push({ id: 'scan', nomCle: 'v2.health.running.task.scan', etat: 'en_cours' });
    }
  }

  // Les autres inscriptions du registre : nommées par le serveur lui-même.
  for (const x of taches) {
    if (!x || typeof x.id !== 'string' || rattachees.has(x.id)) continue;
    lignes.push({
      id: `tache:${x.id}`, nomCle: x.label ? null : 'v2.health.running.task.other',
      libelle: x.label || undefined, etat: 'en_cours', avancement: avancementDe(x),
    });
  }

  const lecture = pp
    ? {
        active: pp.playback_active === true,
        zones: Array.isArray(pp.playing_zone_ids) ? pp.playing_zone_ids.length : 0,
        depuisEpochS: nombre(pp.since_epoch_s),
        freinsDesactives: pp.policy?.enabled === false,
      }
    : null;

  const b = pp?.brakes;
  const freins = b && typeof b === 'object'
    ? {
        fichiersDeScanRetenus: nombre(b.scan_files_throttled) ?? 0,
        lecturesDifferees: nombre(b.sqlite_reads_deferred) ?? 0,
        lecturesDiffereesMs: nombre(b.sqlite_reads_deferred_ms) ?? 0,
        ecrituresDifferees: nombre(b.sqlite_writes_deferred) ?? 0,
        ecrituresDiffereesMs: nombre(b.sqlite_writes_deferred_ms) ?? 0,
        prioriteBasseAppliquee: nombre(b.low_io_priority_applied) ?? 0,
      }
    : null;

  const bc = pp?.background_compute;
  const calcul: CalculDeFond | null = bc && typeof bc === 'object'
    ? {
        pool: bc.low_priority_pool === true,
        arme: bc.armed === true,
        cpu: typeof bc.cpu === 'string' ? bc.cpu : null,
        io: typeof bc.io === 'string' ? bc.io : null,
        fils: nombre(bc.threads),
        filsLibres: nombre(bc.idle_threads),
        travaux: nombre(bc.jobs_done),
        regleCoupe: pp?.policy?.background_compute_low_priority === false,
      }
    : null;

  return { lecture, lignes, auRepos, freins, calcul };
}

/** Le « pourquoi » d'une tâche ralentie : la pause publiée, sinon générique. */
function raisonDuRalenti(pauseMs: number | null): Pick<LigneCeQuiTourne, 'raisonCle' | 'params'> {
  return pauseMs !== null && pauseMs > 0
    ? { raisonCle: 'v2.health.running.why.itemPause', params: { s: Math.round(pauseMs / 100) / 10 } }
    : { raisonCle: 'v2.health.running.why.slowed' };
}

/**
 * La phrase sur le calcul de fond : clé i18n et paramètres, ou `null` sans
 * bloc publié. Réglage coupé, pas encore armé, ou armé avec la priorité
 * réellement obtenue (`cpu` / `io`, nommées seulement si connues).
 */
export function phraseCalcul(
  c: CeQuiTourne | null,
): { cle: string; params: Record<string, string | number>; cpuCle: string | null; ioCle: string | null } | null {
  const k = c?.calcul;
  if (!k) return null;
  const base = { cpuCle: clePriorite(k.cpu), ioCle: clePriorite(k.io) };
  if (k.regleCoupe || !k.pool) return { cle: 'v2.health.running.compute.off', params: {}, ...base };
  if (!k.arme) return { cle: 'v2.health.running.compute.notArmed', params: {}, ...base };
  return {
    cle: 'v2.health.running.compute.on',
    params: { n: k.fils ?? 0, libres: k.filsLibres ?? 0, faits: k.travaux ?? 0 },
    ...base,
  };
}

/** La ligne d'en-tête sur la lecture : clé i18n et paramètres, ou `null`. */
export function phraseLecture(
  c: CeQuiTourne | null,
): { cle: string; params: Record<string, string | number> } | null {
  const l = c?.lecture;
  if (!l) return null;
  if (!l.active) return { cle: 'v2.health.running.playbackIdle', params: {} };
  if (l.zones > 1) return { cle: 'v2.health.running.playbackMany', params: { n: l.zones } };
  return { cle: 'v2.health.running.playbackOne', params: {} };
}

/** Remplacer `{nom}` par sa valeur, comme le reste de l'écran. */
export function remplir(gabarit: string, params: Record<string, string | number> = {}): string {
  return gabarit.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
}
