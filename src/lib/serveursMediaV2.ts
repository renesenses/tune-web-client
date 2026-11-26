/**
 * Écran Réseau › Serveurs multimédia : ce que l'écran AFFICHE, construit côté
 * web à partir de ce que l'API renvoie déjà (harmonisation UI, rc14).
 *
 * Aucun changement de contrat serveur. Trois règles :
 *  - plus jamais d'uuid, de route d'API ni de nom de réglage interne au
 *    premier niveau : ils ne vivent que dans « Details », repliés, et dans le
 *    diagnostic copié pour le support ;
 *  - un texte BRUT du serveur (souvent en français codé en dur, quelle que
 *    soit la langue de l'interface) n'est jamais affiché tel quel au premier
 *    niveau : une phrase générique traduite le remplace, le brut part replié ;
 *  - chaque source porte UN état, UNE action principale et, s'il le faut, un
 *    message clair suivi du bouton qui corrige.
 */
import type { MediaServer } from './types';
import type { UpnpLibrarySource } from './api';
import type { Axe } from './indexationUpnp';

// ── Serveurs ───────────────────────────────────────────────────────────────

export type EtatServeur = 'connected' | 'thisServer' | 'offline';

/** Clé i18n de chaque état de serveur (littérales : `check-i18n` les lit). */
export const CLE_ETAT_SERVEUR: Record<EtatServeur, string> = {
  connected: 'v2.ms.state.connected',
  thisServer: 'v2.ms.state.thisServer',
  offline: 'v2.ms.state.offline',
};

/** L'état de la carte d'un serveur. `this_server` est publié par la
 *  découverte ; un serveur antérieur ne l'envoie pas, la mention disparaît. */
export function etatServeur(s: MediaServer): EtatServeur {
  if (s.presence === 'absent' || s.reachable === false) return 'offline';
  if (s.this_server === true) return 'thisServer';
  return 'connected';
}

const IP = /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/;
/** Identifiants techniques qui n'ont rien à faire dans un nom : l'identifiant
 *  RINCON des Sonos, un uuid. */
const IDENTIFIANT = /^(?:RINCON_[0-9A-F]+|uuid:.*|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Le nom convivial d'un serveur.
 *
 *  Les Sonos s'annoncent « 192.168.1.20 - Sonos Play:1 - RINCON_B8E9… » : on
 *  retire l'adresse (elle s'affiche à part, en petit) et l'identifiant. Si
 *  rien ne reste, l'adresse sert de nom. */
export function nomConvivial(s: Pick<MediaServer, 'name' | 'host'>): string {
  return nettoyerNom(s.name ?? '') || s.host || '';
}

export function nettoyerNom(nom: string): string {
  const morceaux = nom.split(/\s+-\s+/).map((m) => m.trim()).filter(Boolean);
  const gardes = morceaux.filter((m) => !IP.test(m) && !IDENTIFIANT.test(m));
  return gardes.join(' - ').trim();
}

/** L'icône de la carte : un serveur Tune, une enceinte, ou un serveur tiers. */
export function iconeServeur(s: MediaServer, estTune: boolean): 'tune' | 'speaker' | 'server' {
  if (estTune) return 'tune';
  const quoi = `${s.manufacturer ?? ''} ${s.model ?? ''} ${s.name ?? ''}`;
  return /sonos|speaker|play:\d|bose|denon home|heos/i.test(quoi) ? 'speaker' : 'server';
}

// ── Sources de bibliothèque ────────────────────────────────────────────────

/** Le nom d'une source, une seule fois.
 *
 *  Le serveur compose `nom du serveur · nom envoyé à l'ajout`, et l'écran
 *  envoyait jusqu'ici un chemin qui COMMENÇAIT par le nom du serveur : d'où
 *  « Asset UPnP: Mac-Studio-6 · Asset UPnP: Mac-Studio-6 ». On découpe sur
 *  « · », on retire les doublons et le préfixe répété, puis on sépare le
 *  produit (« Asset UPnP ») du nom (« Mac-Studio-6 ») quand il est écrit
 *  « Produit: Nom ». */
export function nomDeSource(brut: string): { nom: string; produit: string | null; chemin: string | null } {
  const parts = (brut ?? '').split(/\s+·\s+/).map((p) => p.trim()).filter(Boolean);
  const tete = parts[0] ?? '';
  const reste: string[] = [];
  for (const p of parts.slice(1)) {
    let q = p;
    if (q === tete) continue;
    if (q.startsWith(`${tete} / `)) q = q.slice(tete.length + 3).trim();
    if (q && !reste.includes(q)) reste.push(q);
  }
  const net = nettoyerNom(tete) || tete;
  const m = net.match(/^([^:]{2,40}):\s+(.+)$/);
  const [produit, nom] = m ? [m[1].trim(), m[2].trim()] : [null, net];
  return { nom, produit, chemin: reste.length ? reste.join(' / ') : null };
}

/** Ce que l'écran envoie comme nom à l'ajout : le chemin SOUS le serveur,
 *  jamais le nom du serveur (le serveur le préfixe déjà). Rien à la racine. */
export function nomPourAjout(fil: string[]): string | undefined {
  const sous = fil.slice(1).map((t) => t.trim()).filter(Boolean);
  return sous.length ? sous.join(' / ') : undefined;
}

export type EtatSource =
  | 'offline' | 'incomplete' | 'upToDate' | 'syncing' | 'waiting'
  | 'paused' | 'failed' | 'confirm' | 'thisServer';

export type Ton = 'ok' | 'warn' | 'off' | 'err' | 'busy';

export const CLE_ETAT_SOURCE: Record<EtatSource, string> = {
  offline: 'v2.ms.state.offline',
  incomplete: 'v2.ms.state.incomplete',
  upToDate: 'v2.ms.state.upToDate',
  syncing: 'v2.ms.state.syncing',
  waiting: 'v2.ms.state.waiting',
  paused: 'v2.ms.state.paused',
  failed: 'v2.ms.state.failed',
  confirm: 'upnp.sync.confirmation',
  thisServer: 'v2.ms.state.thisServer',
};

const TON: Record<EtatSource, Ton> = {
  offline: 'off', incomplete: 'warn', upToDate: 'ok', syncing: 'busy', waiting: 'busy',
  paused: 'off', failed: 'err', confirm: 'warn', thisServer: 'off',
};

/** Les plafonds que le serveur sait nommer (`report.parcours.plafond.nature`). */
const AXES: Record<string, Axe> = { profondeur: 'profondeur', pistes: 'pistes', conteneurs: 'conteneurs' };

export const CLE_PLAFOND: Record<Axe, { message: string; bouton: string }> = {
  profondeur: { message: 'v2.ms.ceiling.depth', bouton: 'v2.ms.ceiling.raiseDepth' },
  pistes: { message: 'v2.ms.ceiling.tracks', bouton: 'v2.ms.ceiling.raiseTracks' },
  conteneurs: { message: 'v2.ms.ceiling.containers', bouton: 'v2.ms.ceiling.raiseContainers' },
};

export interface MessageSource {
  /** Clé i18n de la phrase. */
  cle: string;
  ton: 'warn' | 'off' | 'err';
  /** Le plafond à relever, quand le message en désigne un. */
  axe?: Axe;
  /** Clé i18n du bouton qui corrige. */
  bouton?: string;
}

export interface VueSource {
  etat: EtatSource;
  ton: Ton;
  cleEtat: string;
  message: MessageSource | null;
  /** UNE action principale : relancer (`retry`) ou synchroniser (`sync`). */
  action: 'sync' | 'retry' | null;
  /** Le texte brut du serveur, pour « Details » seulement. */
  brut: string[];
}

/** Présence connue des serveurs, d'après la découverte. `null` tant que la
 *  liste n'est pas chargée : on ne conclut alors rien de l'absence d'un udn. */
export interface Presence { presents: Set<string>; absents: Set<string> }

export function presenceDe(servers: MediaServer[] | null): Presence | null {
  if (!servers) return null;
  const presents = new Set<string>();
  const absents = new Set<string>();
  for (const s of servers) (s.presence === 'absent' ? absents : presents).add(s.id);
  return { presents, absents };
}

/** Le code d'erreur du rapport stocké. Le serveur le conserve (`source.report
 *  = report`, synchronisation_upnp.rs) ; un rapport d'échec interne n'a que
 *  `error`, d'où le repli sur la présence. */
function codeDe(src: UpnpLibrarySource): string | null {
  const c = src.report?.code;
  return typeof c === 'string' && c ? c : null;
}

/** Un serveur hors du réseau : code `unknown_server`, ou — repli quand le
 *  rapport n'a pas de code — udn absent de la découverte. */
export function estHorsReseau(src: UpnpLibrarySource, presence: Presence | null): boolean {
  if (codeDe(src) === 'unknown_server') return true;
  if (!presence) return false;
  return presence.absents.has(src.udn) || !presence.presents.has(src.udn);
}

export function texteBrut(src: UpnpLibrarySource): string[] {
  const r = src.report ?? {};
  const out: string[] = [];
  const pousser = (v: unknown) => {
    if (typeof v === 'string' && v.trim() && !out.includes(v.trim())) out.push(v.trim());
  };
  pousser(r.raison);
  pousser(r.error);
  pousser(r.detail);
  pousser(r.parcours?.plafond?.message);
  for (const e of r.erreurs ?? []) pousser(e);
  for (const e of r.reserves ?? []) pousser(e);
  return out;
}

export function vueSource(src: UpnpLibrarySource, presence: Presence | null): VueSource {
  const r = src.report ?? {};
  const brut = texteBrut(src);
  const vue = (etat: EtatSource, message: MessageSource | null, action: VueSource['action']): VueSource =>
    ({ etat, ton: TON[etat], cleEtat: CLE_ETAT_SOURCE[etat], message, action, brut });

  if (src.status === 'this_server' || codeDe(src) === 'this_server') {
    return vue('thisServer', { cle: 'v2.ms.thisServerMsg', ton: 'off' }, null);
  }
  if (src.status === 'running') return vue('syncing', null, null);
  if (src.status === 'confirmation') return vue('confirm', null, null);
  if (!src.enabled) return vue('paused', null, 'sync');
  if (src.status === 'pending') return vue('waiting', null, null);

  if (src.status === 'unavailable' && estHorsReseau(src, presence)) {
    return vue('offline', { cle: 'v2.ms.offlineMsg', ton: 'off' }, 'retry');
  }
  if (src.status === 'unavailable' || src.status === 'error') {
    return vue('failed', { cle: 'v2.ms.genericFailure', ton: 'err' }, 'retry');
  }
  if (src.status === 'partial') {
    const axe = AXES[String(r.parcours?.plafond?.nature ?? '')];
    if (axe) {
      return vue('incomplete', { cle: CLE_PLAFOND[axe].message, ton: 'warn', axe, bouton: CLE_PLAFOND[axe].bouton }, 'sync');
    }
    return vue('incomplete', { cle: 'v2.ms.genericLimitation', ton: 'warn' }, 'sync');
  }
  if (src.status === 'ready') {
    return vue('upToDate', (r.erreurs?.length ?? 0) > 0 ? { cle: 'v2.ms.genericLimitation', ton: 'warn' } : null, 'sync');
  }
  // Un état que cet écran ne connaît pas encore : on le dit sans l'inventer.
  return vue('failed', brut.length ? { cle: 'v2.ms.genericFailure', ton: 'err' } : null, 'retry');
}

/** Les détails techniques, repliés sous « Details ». Ni uuid ni route. */
export interface DetailsSource {
  profondeur: number | null;
  profondeurAtteinte: boolean;
  pistes: number | null;
  albums: number | null;
  /** `null` = inconnu ; `'incomplete'` = rien retiré parce que le parcours est incomplet. */
  retirees: number | 'incomplete' | null;
}

export function detailsSource(src: UpnpLibrarySource): DetailsSource {
  const r = src.report ?? {};
  const prof = r.parcours?.plafonds?.profondeur_max;
  const sup = r.supprimees;
  const retirees = typeof sup === 'number' ? sup
    : Array.isArray(sup) ? sup.length
    : src.status === 'partial' ? 'incomplete' : null;
  return {
    profondeur: typeof prof === 'number' ? prof : null,
    profondeurAtteinte: r.parcours?.plafond?.nature === 'profondeur',
    pistes: typeof r.pistes?.distinctes === 'number' ? r.pistes.distinctes : null,
    albums: typeof r.albums_ajoutes === 'number' ? r.albums_ajoutes : null,
    retirees,
  };
}

/** Le diagnostic copié pour le support : identifiants et texte brut. C'est le
 *  SEUL endroit où l'uuid et le code voyagent — dans le presse-papiers, à la
 *  demande, jamais à l'écran. */
export function texteDiagnostic(src: UpnpLibrarySource, serveur?: MediaServer | null): string {
  const r = src.report ?? {};
  const lignes = [
    `source: ${src.name}`,
    `key: ${src.key}`,
    `udn: ${src.udn}`,
    `container: ${src.container}`,
    `status: ${src.status}${src.enabled ? '' : ' (paused)'}`,
  ];
  if (codeDe(src)) lignes.push(`code: ${codeDe(src)}`);
  if (r.message_key) lignes.push(`message_key: ${r.message_key}`);
  const plafond = r.parcours?.plafond;
  if (plafond?.nature) lignes.push(`ceiling: ${plafond.nature}=${plafond.valeur ?? '∞'} (${plafond.reglage ?? '?'})`);
  if (src.last_attempt) lignes.push(`last_attempt: ${new Date(src.last_attempt * 1000).toISOString()}`);
  if (src.last_success) lignes.push(`last_success: ${new Date(src.last_success * 1000).toISOString()}`);
  if (serveur) lignes.push(`server: ${serveur.name} @ ${serveur.host}:${serveur.port} (${serveur.presence ?? 'unknown'})`);
  const brut = texteBrut(src);
  if (brut.length) lignes.push('', ...brut);
  return lignes.join('\n');
}
