// Rôle maître / agent entre deux serveurs Tune (tune-server-rust#4626).
//
// Un serveur AGENT prête ses sorties locales à un serveur MAÎTRE, qui les voit
// comme des zones. L'appairage se fait par un code à six chiffres affiché sur
// l'agent : aucun accès libre sur le réseau.
//
// Routes serveur : `/api/v1/agent-tune/…` (`routes/agent_tune.rs`).
// Importé via la barrel `lib/api`.
import { BASE, fetchJSON } from './_client';

const RACINE = () => `${BASE}/agent-tune`;

/** Une sortie que l'agent prête. */
export interface SortieAgentExposee {
  device_id: string;
  nom: string;
}

/** Un maître appairé, vu depuis l'agent. */
export interface MaitreAppaire {
  maitre_id: string;
  nom: string;
  appaire_le: number;
}

/** Côté agent : `GET /agent-tune/agent`. */
export interface EtatAgentTune {
  agent_id: string;
  nom: string;
  maitres: MaitreAppaire[];
  sorties: SortieAgentExposee[];
}

/** Un agent appairé, vu depuis le maître (jamais de jeton). */
export interface AgentAppaire {
  agent_id: string;
  nom: string;
  host: string;
  port: number;
  appaire_le: number;
  sorties_inscrites: number;
}

/** Un serveur Tune du réseau qui sait être agent. */
export interface CandidatAgent {
  agent_id: string;
  nom: string | null;
  version: string | null;
  host: string;
  port: number;
  appaire: boolean;
}

export interface ZoneRattachee {
  zone_id: number;
  device_id: string;
  nom: string;
}

/** La réponse de `etatAgentTune`, ou `null` si elle n'a pas la forme attendue
 *  (serveur ancien, réponse d'une autre route). */
export function etatAgentTuneLisible(r: unknown): EtatAgentTune | null {
  const e = r as EtatAgentTune | null | undefined;
  return e && Array.isArray(e.sorties) && Array.isArray(e.maitres) ? e : null;
}

export function etatAgentTune() {
  return fetchJSON<EtatAgentTune>(`${RACINE()}/agent`);
}

/** Émet un code d'appairage (remplace le précédent). */
export function emettreCodeAgent() {
  return fetchJSON<{ code: string; expire_dans_s: number }>(`${RACINE()}/agent/code`, {
    method: 'POST',
  });
}

export function revoquerMaitre(maitreId: string) {
  return fetchJSON<{ ok: boolean }>(`${RACINE()}/agent/maitres/${encodeURIComponent(maitreId)}`, {
    method: 'DELETE',
  });
}

export function listerAgentsTune() {
  return fetchJSON<{ agents: AgentAppaire[]; candidats: CandidatAgent[] }>(`${RACINE()}/agents`);
}

export function appairerAgentTune(host: string, port: number, code: string) {
  return fetchJSON<{ agent: AgentAppaire; zones: ZoneRattachee[] }>(`${RACINE()}/agents`, {
    method: 'POST',
    body: JSON.stringify({ host, port, code }),
  });
}

export function oublierAgentTune(agentId: string) {
  return fetchJSON<{ ok: boolean }>(`${RACINE()}/agents/${encodeURIComponent(agentId)}`, {
    method: 'DELETE',
  });
}

/** Un code saisi est-il recevable ? Six chiffres, espaces tolérés. */
export function codeAgentRecevable(saisie: string): boolean {
  return /^\d{6}$/.test(saisie.replace(/\s+/g, ''));
}

/** Le code tel qu'on l'envoie : sans espaces. */
export function codeAgentNormalise(saisie: string): string {
  return saisie.replace(/\s+/g, '');
}

/** Le code tel qu'on l'affiche : « 123 456 ». */
export function codeAgentAffiche(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/** Secondes restantes avant l'expiration d'un code émis à `emisA` (ms). */
export function secondesRestantesCode(emisA: number, dureeS: number, maintenant: number): number {
  return Math.max(0, Math.ceil(dureeS - (maintenant - emisA) / 1000));
}
