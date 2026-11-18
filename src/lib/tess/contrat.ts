/**
 * TESS — le contrat de l'API vu du client web (lots W3 et W5).
 *
 * Référence : `docs/tess/contrat.md` et `tune-core/src/tess/api.rs` sur
 * `batch/tess-20261118` (tune-server-rust). Ce module ne fait que LIRE ce que
 * le serveur publie ; il ne décide de rien.
 *
 * Règles du contrat (§ 0) appliquées ici :
 * - un client IGNORE les champs qu'il ne connaît pas et lit toute valeur
 *   d'énumération inconnue comme `unknown` (`normaliserZoneTess`) ;
 * - un serveur sans TESS répond 404 (ou 405) à `GET /zones/{id}/tess` :
 *   `lireZoneTess` rend alors `null` et TOUT ce qui touche à TESS reste caché ;
 * - un refus (`PUT`) est un `RefusTess` : `{ status, code, detail, plugin_id }`.
 */
import { BASE, fetchJSON } from '../api';

/** `tess::VERSION_CONTRAT` côté serveur. */
export const VERSION_CONTRAT_TESS = 1;

export type CodeEtapeTess =
  | 'source' | 'headroom' | 'plugin' | 'upsampling' | 'volume'
  | 'quantization' | 'dsd_modulator' | 'output' | 'unknown';
export type BadgeTess = 'bit_perfect' | 'processed_by_tess' | 'outside_tess' | 'unknown';
export type ControleVolumeTess = 'software' | 'device' | 'fixed' | 'unknown';
export type PlacementVolumeTess = 'at_render' | 'before_dsd_modulator' | 'unknown';

const CODES_ETAPE: readonly CodeEtapeTess[] = ['source', 'headroom', 'plugin', 'upsampling', 'volume', 'quantization', 'dsd_modulator', 'output'];
const BADGES: readonly BadgeTess[] = ['bit_perfect', 'processed_by_tess', 'outside_tess'];
const CONTROLES: readonly ControleVolumeTess[] = ['software', 'device', 'fixed'];
const PLACEMENTS: readonly PlacementVolumeTess[] = ['at_render', 'before_dsd_modulator'];

/** Une étape résolue du chemin du signal (`EtapeResolue`). */
export interface EtapeTess {
  code: CodeEtapeTess;
  plugin_id: string | null;
  fixed: boolean;
  requested: boolean;
  effective: boolean;
  /** Motif d'extinction (`MotifEtape`), gardé tel quel : un motif inconnu s'affiche par son `detail`. */
  reason: string | null;
  detail: string | null;
  params: Record<string, unknown> | null;
  latency_frames: number | null;
}

export interface MaillonTess {
  id: string;
  enabled: boolean;
  settings: Record<string, unknown> | null;
}

/** La chaîne d'une zone, telle que le serveur l'a enregistrée (`ChaineTess`). */
export interface ChaineTess {
  version: number;
  bypass_all?: boolean;
  plugins?: MaillonTess[];
  fixed?: Record<string, unknown>;
  [champ: string]: unknown;
}

export interface GreffonCatalogueTess {
  id: string;
  name: string;
  category: string;
  /** `free` ou `premium` ; inconnu = traité comme Premium (contrat § 2). */
  entitlement: string;
  feature: string | null;
  origin: string;
  settings_schema?: unknown;
  placement?: { channels?: string; position?: string; exclusive_group?: { id: string; priority: number } | null };
}

export interface ApplicabiliteTess {
  status: 'applied' | 'outside_tess' | 'unknown';
  reason?: string;
  detail?: string;
}

export interface ZoneTess {
  contract_version: number;
  zone_id: number;
  transport: string;
  applicability: ApplicabiliteTess;
  chain: ChaineTess;
  active_preset: string | null;
  headroom_db: number;
  volume: { control: ControleVolumeTess; placement: PlacementVolumeTess | null; db: number | null };
  badge: BadgeTess;
  signal_path: EtapeTess[];
  catalog: { plugins: GreffonCatalogueTess[]; groups: { id: string; policy: string }[] };
}

/** Corps d'un refus 400, 402 ou 409 (`RefusTess`). */
export interface RefusTess {
  status: number;
  code: string;
  detail: string;
  plugin_id: string | null;
}

const objet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const texte = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const nombre = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
function connu<T extends string>(v: unknown, valeurs: readonly T[]): T | 'unknown' {
  return typeof v === 'string' && (valeurs as readonly string[]).includes(v) ? (v as T) : 'unknown';
}

export function normaliserEtape(v: unknown): EtapeTess | null {
  if (!objet(v)) return null;
  return {
    code: connu(v.code, CODES_ETAPE),
    plugin_id: texte(v.plugin_id),
    fixed: v.fixed === true,
    requested: v.requested !== false,
    effective: v.effective === true,
    reason: texte(v.reason),
    detail: texte(v.detail),
    params: objet(v.params) ? v.params : null,
    latency_frames: nombre(v.latency_frames),
  };
}

/**
 * Lit une réponse de zone. `null` si ce n'est pas une réponse TESS (pas de
 * `contract_version` numérique, pas de chemin du signal) : l'écran reste caché
 * plutôt que d'afficher un état inventé.
 */
export function normaliserZoneTess(v: unknown): ZoneTess | null {
  if (!objet(v) || nombre(v.contract_version) === null || !Array.isArray(v.signal_path)) return null;
  const app = objet(v.applicability) ? v.applicability : {};
  const statut = app.status === 'applied' || app.status === 'outside_tess' ? app.status : 'unknown';
  const vol = objet(v.volume) ? v.volume : {};
  const catalogue = objet(v.catalog) ? v.catalog : {};
  const chain = objet(v.chain) && nombre(v.chain.version) !== null ? (v.chain as ChaineTess) : { version: 1 };
  return {
    contract_version: v.contract_version as number,
    zone_id: nombre(v.zone_id) ?? 0,
    transport: texte(v.transport) ?? 'other',
    applicability: {
      status: statut,
      ...(texte(app.reason) ? { reason: app.reason as string } : {}),
      ...(texte(app.detail) ? { detail: app.detail as string } : {}),
    },
    chain: {
      ...chain,
      plugins: Array.isArray(chain.plugins)
        ? chain.plugins.filter(objet).map((m) => ({
            id: String(m.id ?? ''),
            enabled: m.enabled === true,
            settings: objet(m.settings) ? m.settings : null,
          }))
        : [],
    },
    active_preset: texte(v.active_preset),
    headroom_db: nombre(v.headroom_db) ?? 0,
    volume: {
      control: connu(vol.control, CONTROLES),
      placement: vol.placement == null ? null : connu(vol.placement, PLACEMENTS),
      db: nombre(vol.db),
    },
    badge: connu(v.badge, BADGES),
    signal_path: v.signal_path.map(normaliserEtape).filter((e): e is EtapeTess => e !== null),
    catalog: {
      plugins: Array.isArray(catalogue.plugins) ? (catalogue.plugins.filter(objet) as unknown as GreffonCatalogueTess[]) : [],
      groups: Array.isArray(catalogue.groups) ? (catalogue.groups.filter(objet) as unknown as { id: string; policy: string }[]) : [],
    },
  };
}

export function estRefusTess(v: unknown): v is RefusTess {
  return objet(v) && typeof v.code === 'string' && typeof v.status === 'number';
}

/** Un greffon est-il Premium ? Un droit inconnu compte comme Premium (contrat § 2). */
export function greffonPremium(zone: Pick<ZoneTess, 'catalog'>, id: string): boolean {
  const d = zone.catalog.plugins.find((p) => p.id === id);
  return !d || d.entitlement !== 'free';
}

/**
 * `GET /zones/{id}/tess`. `null` = ce serveur n'annonce pas TESS (404, 405,
 * réponse illisible) : rien de TESS ne s'affiche. Sans bandeau d'erreur — un
 * serveur antérieur n'est pas en panne.
 */
export async function lireZoneTess(zoneId: number): Promise<ZoneTess | null> {
  let statut = 0;
  try {
    const r = await fetchJSON<unknown>(
      `${BASE}/zones/${zoneId}/tess`,
      undefined,
      (s) => { statut = s; return s === 404 || s === 405; },
      true,
    );
    if (statut === 404 || statut === 405) return null;
    return normaliserZoneTess(r);
  } catch {
    return null;
  }
}

export type ResultatEcritureTess = { ok: true; zone: ZoneTess } | { ok: false; refus: RefusTess };

/**
 * `PUT /zones/{id}/tess`. Les refus 400, 402 et 409 sont RENDUS (jamais levés)
 * pour que l'écran les dise à l'endroit du geste.
 */
export async function ecrireChaineTess(zoneId: number, chaine: ChaineTess): Promise<ResultatEcritureTess> {
  let statut = 0;
  const r = await fetchJSON<unknown>(
    `${BASE}/zones/${zoneId}/tess`,
    { method: 'PUT', body: JSON.stringify(chaine) },
    (s) => { statut = s; return s === 400 || s === 402 || s === 409; },
    true,
  );
  if (statut !== 0) {
    return {
      ok: false,
      refus: estRefusTess(r) ? r : { status: statut, code: 'unknown', detail: '', plugin_id: null },
    };
  }
  const zone = normaliserZoneTess(r);
  if (!zone) return { ok: false, refus: { status: 0, code: 'invalid_response', detail: '', plugin_id: null } };
  return { ok: true, zone };
}
