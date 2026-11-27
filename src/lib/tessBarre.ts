/**
 * TESS W5 — le chemin du signal vu depuis la barre de lecture (maquette A4).
 *
 * Source : le bloc `tess` que le serveur (T16, `tune-core/src/tess/chemin.rs`)
 * ajoute au chemin du signal de la zone (`zone.signal_path.tess`). Ce bloc est
 * déjà RAPPROCHÉ de ce qui tourne : une étape `effective` modifie réellement
 * les échantillons. Ce module ne contient que des fonctions pures :
 *
 *   - l'ordre affiché est celui de `steps`, à la lettre (Q9 : Headroom →
 *     greffons → Upsampling → Volume → Dither ; vers DSD, Volume → DSD
 *     modulator). Rien n'est trié ni recalculé ici ;
 *   - le badge est celui du serveur. « Bit-perfect » n'est jamais déduit côté
 *     client : un chemin altéré ne peut pas s'en réclamer ;
 *   - en mode Pure, l'étape TESS (l'encadré) disparaît. Ce qui modifie encore
 *     les échantillons (volume logiciel, et le dither qu'il exige) reste
 *     écrit, hors de l'encadré : le serveur garde alors son badge.
 */
import { dbLisible, libelleOuRepli } from './tess';

export type BadgeTess = 'bit_perfect' | 'processed_by_tess' | 'outside_tess' | 'altered_outside_tess';
const BADGES: BadgeTess[] = ['bit_perfect', 'processed_by_tess', 'outside_tess', 'altered_outside_tess'];

export interface EtapeTessBarre {
  name?: string;
  code: string;
  plugin_id?: string | null;
  fixed?: boolean;
  requested?: boolean;
  effective?: boolean;
  reason?: string | null;
  detail?: string | null;
  params?: Record<string, any> | null;
}

export interface CheminTessBarre {
  badge: string;
  headroom_db?: number;
  volume?: { control?: string; placement?: string | null; db?: number | null } | null;
  steps: EtapeTessBarre[];
}

export interface VueTessBarre {
  /** Badge connu du client, sinon `null` (rien n'est affiché). */
  badge: BadgeTess | null;
  /** Les étapes de l'encadré TESS, dans l'ordre du serveur. Vide en Pure. */
  encadre: EtapeTessBarre[];
  /** En Pure : ce qui touche encore les échantillons, hors de l'encadré. */
  horsEncadre: EtapeTessBarre[];
}

const estObjet = (x: unknown): x is Record<string, any> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

const EXTREMITES = new Set(['source', 'output']);

/** Le bloc `tess` d'un chemin du signal, s'il est lisible ; sinon `null`. */
export function lireCheminTessBarre(signalPath: unknown): CheminTessBarre | null {
  if (!estObjet(signalPath)) return null;
  const t = signalPath.tess;
  if (!estObjet(t) || typeof t.badge !== 'string' || !Array.isArray(t.steps)) return null;
  const steps = t.steps.filter((e: unknown): e is EtapeTessBarre => estObjet(e) && typeof e.code === 'string');
  return { ...(t as CheminTessBarre), steps };
}

/**
 * Pure est-il actif ? Le chemin historique le dit (`signal_path.pure`, #3973) ;
 * sinon une étape éteinte pour `pure_mode` le dit.
 */
export function estPure(signalPath: unknown, c: CheminTessBarre): boolean {
  if (estObjet(signalPath) && signalPath.pure === true) return true;
  return c.steps.some((e) => e.reason === 'pure_mode');
}

/** Ce que la barre affiche, d'après le bloc du serveur. */
export function vueTessBarre(c: CheminTessBarre, pure: boolean): VueTessBarre {
  const badge = (BADGES as string[]).includes(c.badge) ? (c.badge as BadgeTess) : null;
  const milieu = c.steps.filter((e) => !EXTREMITES.has(e.code));
  if (pure) {
    // L'étape TESS disparaît ; seul ce qui modifie ENCORE les échantillons
    // reste dit (le volume logiciel, que Pure laisse appliqué — décision T07).
    return { badge, encadre: [], horsEncadre: milieu.filter((e) => e.effective === true) };
  }
  if (badge === 'outside_tess') return { badge, encadre: [], horsEncadre: [] };
  // Une étape effective, ou demandée mais éteinte (avec son motif) : la
  // barre ne cache pas un traitement demandé qui ne s'applique pas.
  const encadre = milieu.filter((e) => e.effective === true || (e.requested === true && !!e.reason));
  return { badge, encadre, horsEncadre: [] };
}

type Tr = (cle: string) => string;

/**
 * rc14 (tune-server-rust#9555) — la marge PROPRE du modulateur DSD, publiée à
 * part sur l'étape `dsd_modulator` (`params.modulator_margin_db`). Jamais
 * additionnée à la marge de l'utilisateur (étape `headroom`, `params.db`).
 * Serveur ancien, champ absent ou non numérique : `null`, rien ne s'affiche.
 */
export function margeModulateurDsd(e: { code: string; params?: Record<string, any> | null } | null | undefined): number | null {
  if (!e || e.code !== 'dsd_modulator') return null;
  const v = e.params?.modulator_margin_db;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** « Marge du modulateur DSD : −3 dB », ou `''` quand le serveur ne la publie pas. */
export function ligneMargeModulateurDsd(e: { code: string; params?: Record<string, any> | null } | null | undefined, tr: Tr): string {
  const m = margeModulateurDsd(e);
  if (m == null) return '';
  return tr('tess.dsdModulatorMargin').replace('{db}', m === 0 ? '0 dB' : dbLisible(m));
}
/** `$tn` : une clé plurielle (ICU) rendue pour `n`. */
type Trn = (cle: string, n: number) => string;

/** Le nom d'une étape : greffon traduit, sinon étage fixe traduit. */
export function nomEtapeBarre(e: EtapeTessBarre, tr: Tr): string {
  if (e.code === 'plugin' && e.plugin_id) {
    const cle = `tess.plugin.${e.plugin_id}`;
    return libelleOuRepli(tr(cle), cle, e.name ?? e.plugin_id);
  }
  const cle = `tess.step.${e.code}`;
  return libelleOuRepli(tr(cle), cle, e.name ?? tr('tess.step.unknown'));
}

function motif(e: EtapeTessBarre, tr: Tr): string {
  if (!e.reason) return '';
  const cle = `tess.reason.${e.reason}`;
  return libelleOuRepli(tr(cle), cle, e.detail ?? e.reason);
}

const RATE_DSD = /^dsd\d+$/i;
const rateDsd = (v: unknown): string => (typeof v === 'string' && RATE_DSD.test(v) ? v.toUpperCase() : '');

/**
 * rc14 (tune-server-rust#9575) — la cadence DSD RÉELLEMENT JOUÉE, lue sur le
 * chemin du signal (`params.rate` de l'étape `upsampling` en DSD, sinon du
 * `dsd_modulator`). Chaîne vide : serveur ancien ou pas de DSD, l'appelant
 * garde alors son repli (la cible de la chaîne).
 */
export function cadenceJoueeDsd(etapes: ReadonlyArray<{ code: string; params?: Record<string, any> | null }>): string {
  const up = etapes.find((e) => e.code === 'upsampling' && e.params?.target === 'dsd');
  return rateDsd(up?.params?.rate) || rateDsd(etapes.find((e) => e.code === 'dsd_modulator')?.params?.rate);
}

/**
 * La cadence annoncée pour la piste suivante (`params.pending_rate`), en
 * clair et traduite ; chaîne vide si absente, illisible ou identique à celle
 * qui joue. Le `detail` anglais du serveur n'est jamais affiché.
 */
export function annonceCadenceSuivante(
  etapes: ReadonlyArray<{ code: string; params?: Record<string, any> | null }>, tr: Tr,
): string {
  const e = etapes.find((x) => (x.code === 'upsampling' || x.code === 'dsd_modulator') && rateDsd(x.params?.pending_rate));
  const suivante = rateDsd(e?.params?.pending_rate);
  if (suivante) return suivante === cadenceJoueeDsd(etapes) ? '' : tr('tess.dsd.atNextTrack').replace('{rate}', suivante);
  // `pending_target` : la prochaine piste QUITTE le DSD (serveur #9575, `chaine_cible`) —
  // « off » (cible éteinte, Pure) ou « pcm ». Toute autre valeur est tue.
  const cible = etapes.find((x) => x.code === 'upsampling' || x.code === 'dsd_modulator')?.params?.pending_target;
  const cle = cible === 'off' ? 'tess.dsd.nextOff' : cible === 'pcm' ? 'tess.dsd.nextPcm' : '';
  return cle && cadenceJoueeDsd(etapes) ? tr(cle) : '';
}

function khz(hz: unknown): string {
  if (typeof hz !== 'number' || !Number.isFinite(hz) || hz <= 0) return '';
  const k = hz / 1000;
  return `${Number.isInteger(k) ? k : k.toFixed(1)} kHz`;
}

/**
 * Les paramètres d'une étape, en une ligne (maquette A4 : « −3 dB (auto) »,
 * « room_96k.wav », « 31 bands · Jazz », « Software · −18 dB »). Seuls les
 * paramètres publiés par le serveur sont écrits : rien n'est inventé.
 */
export function resumeEtapeBarre(e: EtapeTessBarre, c: CheminTessBarre, tr: Tr, trn: Trn): string {
  if (e.effective !== true && e.reason) return motif(e, tr);
  const p = estObjet(e.params) ? e.params : {};
  const db0 = (v: number) => (v === 0 ? '0 dB' : dbLisible(v));
  switch (e.code) {
    case 'headroom': {
      const db = typeof c.headroom_db === 'number' ? c.headroom_db : typeof p.db === 'number' ? p.db : null;
      const mode = p.mode === 'auto' ? tr('tess.headroomAuto') : p.mode === 'manual' ? tr('tess.headroomManual') : '';
      return [db == null ? '' : db0(db), mode].filter(Boolean).join(' · ');
    }
    case 'plugin': {
      const morceaux: string[] = [];
      if (typeof p.filter === 'string' && p.filter) morceaux.push(p.filter);
      if (typeof p.bands === 'number') morceaux.push(trn('tess.bands', p.bands));
      if (typeof p.preset === 'string' && p.preset) morceaux.push(p.preset);
      return morceaux.join(' · ');
    }
    case 'upsampling': {
      if (p.target === 'dsd') {
        const suivante = annonceCadenceSuivante([e], tr);
        return [String(p.rate ?? 'DSD').toUpperCase(), p.filter, suivante].filter(Boolean).join(' · ');
      }
      const ratio = typeof p.max_ratio === 'number' ? `×${p.max_ratio}` : '';
      return ['PCM', ratio, khz(p.max_rate_hz), typeof p.filter === 'string' ? p.filter : ''].filter(Boolean).join(' · ');
    }
    case 'volume': {
      const control = c.volume?.control ?? p.control;
      const cle = `tess.vol.${control}`;
      const mode = control ? libelleOuRepli(tr(cle), cle, String(control)) : '';
      const db = typeof c.volume?.db === 'number' ? c.volume.db : typeof p.db === 'number' ? p.db : null;
      return [mode, db == null ? '' : db0(db)].filter(Boolean).join(' · ');
    }
    case 'quantization': {
      const d = typeof p.dither === 'string' ? p.dither : '';
      if (!d) return '';
      const cle = `tess.dither.${d}`;
      return libelleOuRepli(tr(cle), cle, d);
    }
    case 'dsd_modulator':
      return typeof p.rate === 'string' ? p.rate.toUpperCase() : '';
    default:
      return e.reason ? motif(e, tr) : '';
  }
}
