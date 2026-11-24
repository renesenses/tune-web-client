/**
 * TESS — Tune Engine for Sound Shaping : le contrat vu du client (lot W1).
 *
 * Référence : `docs/tess/contrat.md` et `tune-core/src/tess/` du dépôt
 * serveur (lot T01, fusionné dans `batch/tess-20261118`). Ce module ne
 * contient que des TYPES et des FONCTIONS PURES : aucune requête, aucun
 * magasin. L'écran (`components/v2/tess/`) s'appuie dessus.
 *
 * Règles du contrat appliquées ici :
 *   - un client ignore les champs qu'il ne connaît pas et lit toute valeur
 *     d'énumération inconnue comme `unknown` (§ 0) ;
 *   - la chaîne renvoyée au `PUT` part du JSON BRUT reçu : on ne touche qu'aux
 *     champs que l'on modifie (reste n° 1 de la relecture de T01 : un client
 *     ancien ne doit pas perdre les champs d'un serveur plus récent) ;
 *   - l'ordre affiché est l'ordre de `signal_path`, celui que le serveur a
 *     résolu (Q9 : Upsampling → Volume → Dither, exception DSD) — l'écran ne
 *     le recalcule jamais ;
 *   - groupe exclusif crossfeed / Crossfeed Pro / Crosstalk : décision du
 *     18/11 (« B ») — une chaîne ne peut pas en cocher deux ; l'écran empêche
 *     la combinaison et dit pourquoi (le serveur refuse en 409).
 */

/** Version du contrat que ce client sait lire (`tess::VERSION_CONTRAT`). */
export const VERSION_CONTRAT_TESS = 1;
/** Version du format de chaîne que ce client écrit (`tess::VERSION_CHAINE`). */
export const VERSION_CHAINE_TESS = 1;
/** Le groupe exclusif du catalogue de référence. */
export const GROUPE_CROSSFEED = 'crossfeed_crosstalk';

export type CategorieTess = 'equalisation' | 'spatial' | 'room_and_filters' | 'restoration_and_routing';
export const CATEGORIES_TESS: CategorieTess[] = ['equalisation', 'spatial', 'room_and_filters', 'restoration_and_routing'];

export interface LienGreffonTess {
  id: string;
  enabled: boolean;
  settings?: Record<string, unknown> | null;
  [autre: string]: unknown;
}

export interface ChaineTess {
  version: number;
  bypass_all?: boolean;
  plugins?: LienGreffonTess[];
  fixed?: Record<string, any>;
  [autre: string]: unknown;
}

export interface DescripteurGreffonTess {
  id: string;
  name: string;
  category: string;
  entitlement: string;
  feature: string | null;
  origin: string;
  settings_schema: Record<string, unknown>;
  placement: {
    channels: string;
    position: string;
    exclusive_group: { id: string; priority: number } | null;
  };
}

export interface CatalogueTess {
  plugins: DescripteurGreffonTess[];
  groups?: { id: string; policy: string }[];
}

export interface EtapeTess {
  code: string;
  plugin_id: string | null;
  fixed: boolean;
  requested: boolean;
  effective: boolean;
  reason: string | null;
  detail: string | null;
  params: Record<string, any> | null;
  latency_frames: number | null;
}

export interface ReponseTessZone {
  contract_version: number;
  zone_id: number;
  transport: string;
  applicability: { status: string; reason?: string; detail?: string };
  chain: ChaineTess;
  active_preset: string | null;
  headroom_db: number;
  volume: { control: string; placement: string | null; db: number | null };
  badge: string;
  signal_path: EtapeTess[];
  catalog: CatalogueTess;
}

export interface RefusTess {
  status: number;
  code: string;
  detail: string;
  plugin_id: string | null;
}

export interface PreReglageTess {
  id: string;
  name: string;
  builtin?: boolean;
  chain: ChaineTess;
}

export interface PreReglagesTess {
  apply_mode?: string;
  presets: PreReglageTess[];
}

/** Nom fourni par le serveur au préréglage Pure (contrat § 5) : traduit à
 *  l'affichage tant que l'utilisateur ne l'a pas renommé. */
export const NOM_PURE_DU_SERVEUR = 'Pure — no processing';

/** Le nom affiché d'un préréglage. */
export function nomDuPreReglage(p: PreReglageTess, nomPureTraduit: string): string {
  return p.builtin && p.id === 'pure' && p.name === NOM_PURE_DU_SERVEUR ? nomPureTraduit : p.name;
}

/** Un étage du préréglage chargé qui ne s'applique pas sur cette sortie (T17). */
export interface NonAppliqueTess {
  plugin_id: string | null;
  reason: string;
  detail?: string | null;
}

/** La réponse de `POST /zones/{id}/tess/presets/{preset_id}/apply` (T17). */
export interface ChargementPreReglageTess {
  preset_id: string;
  apply_mode: string;
  not_applied: NonAppliqueTess[];
  zone: ReponseTessZone;
}

const estObjet = (x: unknown): x is Record<string, any> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/** Une réponse de `GET|PUT /zones/{id}/tess` lisible par CE client ? */
export function estReponseTess(x: unknown): x is ReponseTessZone {
  return estObjet(x)
    && typeof x.contract_version === 'number'
    && estObjet(x.chain)
    && Array.isArray(x.signal_path)
    && estObjet(x.catalog)
    && Array.isArray(x.catalog.plugins);
}

/** Un refus du contrat (`refusal`, en 400, 402 ou 409) ? */
export function estRefusTess(x: unknown): x is RefusTess {
  return estObjet(x) && typeof x.status === 'number' && typeof x.code === 'string';
}

/**
 * Le contrat est-il celui que ce client sait lire ? `contract_version` ne
 * monte que quand un champ change de SENS (§ 0) : face à une version que l'on
 * ne connaît pas, l'écran reste caché et les anciens écrans servent.
 */
export function contratCompris(r: ReponseTessZone): boolean {
  return r.contract_version === VERSION_CONTRAT_TESS;
}

/**
 * Pourquoi un greffon DÉCOCHÉ l'a été par le serveur, et non par l'utilisateur
 * (contrat § 8, marques de T02 tenues par le serveur) :
 * - `inert_on_network` (D2) : repli mono décoché d'office sur une sortie
 *   réseau, où l'ancien interrupteur n'agissait pas ;
 * - `replaced_in_group` (décision B) : membre du groupe crossfeed décoché à la
 *   migration au profit du gagnant nommé.
 * Un greffon coché, ou sans marque reconnue, rend `null` : rien à expliquer.
 */
export type MarqueServeurTess =
  | { genre: 'inert_on_network' }
  | { genre: 'replaced_in_group'; par: string };

export function marqueServeur(lien: LienGreffonTess): MarqueServeurTess | null {
  if (lien.enabled) return null;
  const s = estObjet(lien.settings) ? lien.settings : null;
  if (!s) return null;
  if (typeof s.replaced_in_group === 'string' && s.replaced_in_group !== '') {
    return { genre: 'replaced_in_group', par: s.replaced_in_group };
  }
  if (s.inert_on_network === true) return { genre: 'inert_on_network' };
  return null;
}

export function liensDe(chaine: ChaineTess): LienGreffonTess[] {
  return Array.isArray(chaine.plugins) ? chaine.plugins : [];
}

export function descripteur(catalogue: CatalogueTess | null | undefined, id: string): DescripteurGreffonTess | undefined {
  return catalogue?.plugins?.find((p) => p.id === id);
}

/** Un droit inconnu est traité comme Premium (contrat § 2). */
export function estPremium(d: DescripteurGreffonTess | undefined): boolean {
  return d?.entitlement !== 'free';
}

/**
 * Le groupe exclusif d'un greffon : celui du manifeste, sinon (paquets déjà
 * publiés, contrat § 2) le préfixe `crossfeed-` et les deux ids du groupe.
 */
export function groupeDe(catalogue: CatalogueTess | null | undefined, id: string): string | null {
  const d = descripteur(catalogue, id);
  const g = d?.placement?.exclusive_group?.id;
  if (g) return g;
  if (id === 'crossfeed' || id === 'crosstalk' || id.startsWith('crossfeed-')) return GROUPE_CROSSFEED;
  return null;
}

/**
 * Cocher `id` mettrait-il deux membres d'un même groupe en service ? Rend
 * l'id du membre déjà coché qui l'empêche, ou `null`.
 */
export function conflitExclusif(chaine: ChaineTess, catalogue: CatalogueTess | null | undefined, id: string): string | null {
  const g = groupeDe(catalogue, id);
  if (!g) return null;
  const autre = liensDe(chaine).find((l) => l.id !== id && l.enabled && groupeDe(catalogue, l.id) === g);
  return autre ? autre.id : null;
}

const doitEtreDernier = (catalogue: CatalogueTess | null | undefined, id: string) =>
  descripteur(catalogue, id)?.placement?.position === 'last_plugin'
  || descripteur(catalogue, id)?.placement?.channels === 'remaps';

/** La liste respecte-t-elle « dernier greffon » (même décoché, contrat § 3) ? */
export function ordreValide(liens: LienGreffonTess[], catalogue: CatalogueTess | null | undefined): boolean {
  return liens.every((l, i) => i === liens.length - 1 || !doitEtreDernier(catalogue, l.id));
}

/** Copie de la chaîne BRUTE avec une nouvelle liste de greffons. */
function avecLiens(chaine: ChaineTess, liens: LienGreffonTess[]): ChaineTess {
  return { ...chaine, plugins: liens };
}

/** Coche ou décoche. `null` si la case violerait l'exclusivité du groupe. */
export function basculerGreffon(
  chaine: ChaineTess, catalogue: CatalogueTess | null | undefined, id: string, actif: boolean,
): ChaineTess | null {
  if (actif && conflitExclusif(chaine, catalogue, id)) return null;
  return avecLiens(chaine, liensDe(chaine).map((l) => (l.id === id ? { ...l, enabled: actif } : l)));
}

export function retirerGreffon(chaine: ChaineTess, id: string): ChaineTess {
  return avecLiens(chaine, liensDe(chaine).filter((l) => l.id !== id));
}

/**
 * Ajoute un greffon du catalogue, au bout de la liste mais AVANT un greffon
 * « dernier » (réaffectation des canaux). Il arrive coché, sauf s'il est
 * Premium sans abonnement (le serveur refuserait en 402) ou si un autre membre
 * de son groupe est déjà coché. `null` : absent du catalogue ou déjà là.
 */
export function ajouterGreffon(
  chaine: ChaineTess, catalogue: CatalogueTess | null | undefined, id: string, premium: boolean,
): ChaineTess | null {
  const d = descripteur(catalogue, id);
  if (!d) return null;
  const liens = liensDe(chaine);
  if (liens.some((l) => l.id === id)) return null;
  const actif = (premium || !estPremium(d)) && !conflitExclusif(chaine, catalogue, id);
  const lien: LienGreffonTess = { id, enabled: actif, settings: null };
  const copie = [...liens];
  const dernier = copie.findIndex((l) => doitEtreDernier(catalogue, l.id));
  if (dernier >= 0 && !doitEtreDernier(catalogue, id)) copie.splice(dernier, 0, lien);
  else copie.push(lien);
  return ordreValide(copie, catalogue) ? avecLiens(chaine, copie) : null;
}

/**
 * Déplace le greffon d'index `de` à l'index `vers` (glisser-déposer, ou
 * flèches du clavier). `null` si rien ne bouge ou si l'ordre deviendrait
 * invalide (un greffon « dernier » ne quitte pas la dernière place).
 */
export function deplacerGreffon(
  chaine: ChaineTess, catalogue: CatalogueTess | null | undefined, de: number, vers: number,
): ChaineTess | null {
  const liens = [...liensDe(chaine)];
  if (de === vers || de < 0 || vers < 0 || de >= liens.length || vers >= liens.length) return null;
  const [l] = liens.splice(de, 1);
  liens.splice(vers, 0, l);
  return ordreValide(liens, catalogue) ? avecLiens(chaine, liens) : null;
}

export function avecBypassAll(chaine: ChaineTess, bypass: boolean): ChaineTess {
  return { ...chaine, bypass_all: bypass };
}

/** Une ligne de la colonne « Signal path ». */
export type LigneChemin =
  | { genre: 'extremite'; etape: EtapeTess }
  | { genre: 'fixe'; etape: EtapeTess }
  | { genre: 'greffon'; etape: EtapeTess | null; lien: LienGreffonTess; index: number }
  | { genre: 'ajout' };

const EXTREMITES = new Set(['source', 'output']);

/**
 * Les lignes de la colonne, DANS L'ORDRE RENVOYÉ PAR LE SERVEUR.
 *
 * - chaque étape de `signal_path` donne une ligne, à sa place ; une étape
 *   d'un code inconnu reste une ligne fixe (jamais masquée) ;
 * - un greffon de la chaîne absent de `signal_path` (serveur qui ne l'aurait
 *   pas résolu) est rangé après le dernier greffon : on doit toujours pouvoir
 *   le décocher ou le retirer ;
 * - « + Add plugin » suit le dernier greffon, sinon le headroom, sinon la
 *   source.
 */
export function lignesDuChemin(r: Pick<ReponseTessZone, 'chain' | 'signal_path'>): LigneChemin[] {
  const liens = liensDe(r.chain);
  const indexDe = new Map(liens.map((l, i) => [l.id, i] as const));
  const vus = new Set<string>();
  const lignes: LigneChemin[] = [];
  for (const e of r.signal_path) {
    if (e.code === 'plugin' && e.plugin_id != null && indexDe.has(e.plugin_id) && !vus.has(e.plugin_id)) {
      vus.add(e.plugin_id);
      const index = indexDe.get(e.plugin_id)!;
      lignes.push({ genre: 'greffon', etape: e, lien: liens[index], index });
    } else if (e.code === 'plugin' && e.plugin_id != null && vus.has(e.plugin_id)) {
      continue;
    } else {
      lignes.push({ genre: EXTREMITES.has(e.code) ? 'extremite' : 'fixe', etape: e });
    }
  }
  let ancre = -1;
  lignes.forEach((l, i) => { if (l.genre === 'greffon') ancre = i; });
  if (ancre < 0) ancre = lignes.findIndex((l) => l.genre === 'fixe' && l.etape.code === 'headroom');
  if (ancre < 0) ancre = lignes.findIndex((l) => l.genre === 'extremite' && l.etape.code === 'source');
  const orphelins: LigneChemin[] = liens
    .map((lien, index) => ({ lien, index }))
    .filter(({ lien }) => !vus.has(lien.id))
    .map(({ lien, index }) => ({ genre: 'greffon', etape: null, lien, index }));
  lignes.splice(ancre + 1, 0, ...orphelins, { genre: 'ajout' });
  return lignes;
}

/** « FLAC 24/96 », « PCM 24/96 », « DSD128 » d'après les `params` d'une étape. */
export function resumeFlux(p: Record<string, any> | null | undefined): string {
  if (!p) return '';
  const genre = typeof p.kind === 'string' ? p.kind.toUpperCase() : '';
  const hz = typeof p.sample_rate_hz === 'number' ? p.sample_rate_hz : null;
  if (genre === 'DSD') {
    return typeof p.rate === 'string' ? p.rate.toUpperCase() : 'DSD';
  }
  const k = hz ? (hz % 1000 === 0 ? String(hz / 1000) : (hz / 1000).toFixed(1)) : '';
  const bits = typeof p.bits === 'number' ? String(p.bits) : '';
  const format = typeof p.format === 'string' ? p.format.toUpperCase() : genre;
  return [format, bits && k ? `${bits}/${k}` : k].filter(Boolean).join(' ');
}

/** « −3 dB » avec le vrai signe moins. */
export function dbLisible(db: number | null | undefined): string {
  if (typeof db !== 'number' || !Number.isFinite(db)) return '';
  const v = Math.round(db * 10) / 10;
  return `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v)} dB`;
}

/**
 * L'icône TESS, option C « Wave T » de la maquette A5 (choisie le 17/11) :
 * un T dont la barre est une onde. Trait unique, même grammaire que les
 * icônes de la barre latérale (un chemin `d` en 24 × 24, tracé au trait).
 */
export const ICONE_TESS = 'M12 21V10M12 10c0-3.5-1.8-5.5-4-5.5S4.2 6 3.5 8.5M12 10c0-3.5 1.8-5.5 4-5.5s3.8 1.5 4.5 4';

/**
 * Libellé traduit d'une clé construite, ou `repli` si la clé n'existe pas
 * (`$t` rend alors la clé nue). L'appelant écrit `tr(`…`)` lui-même : c'est
 * ce qui permet à `check-i18n` de lire la famille de clés composée.
 */
export function libelleOuRepli(traduit: string, cle: string, repli: string): string {
  return traduit === cle ? repli : traduit;
}
