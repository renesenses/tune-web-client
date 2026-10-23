/**
 * Consentement au partage des écoutes avec le compte (renesenses/tune-server-rust#6840).
 *
 * « Mes écoutes, tous serveurs » (#6510) n'envoie rien au compte mozaiklabs.fr
 * sans un « Oui » de l'utilisateur. À partir de la rc8, la question est POSÉE
 * au démarrage, sur un serveur relié à un compte, au lieu d'un envoi désactivé
 * sans question. Consentement actif (CNIL/RGPD) : aucune case précochée, et
 * rien ne part avant la réponse — c'est le serveur qui le garantit, pas cette
 * fenêtre.
 *
 * Le serveur publie l'état dans `GET /system/config`, sous
 * `cloud_listens_consent` :
 *
 *     { state: 'a_demander' | 'accepte' | 'refuse', linked: boolean,
 *       answered_at: string | null, dismissals: number, max_dismissals: number }
 *
 * et reçoit la réponse par `PATCH /system/config` sous la même clé :
 * `accepte`, `refuse` ou `fermee` (fenêtre fermée sans réponse). Fermée une
 * fois, la question revient au démarrage suivant ; fermée deux fois, le
 * serveur la clôt (`refuse`) et elle ne revient plus. Le réglage reste dans
 * Réglages › Système › Cloud.
 */

/** Clé de l'état publié ET de la réponse (`ecoutes_au_compte::CLE_REPONSE`). */
export const CLE_CONSENTEMENT_ECOUTES = 'cloud_listens_consent';

export type EtatConsentementEcoutes = 'a_demander' | 'accepte' | 'refuse';
export type ReponseConsentementEcoutes = 'accepte' | 'refuse' | 'fermee';

export interface ConsentementEcoutes {
  state: EtatConsentementEcoutes;
  linked: boolean;
  answered_at: string | null;
  dismissals: number;
  max_dismissals: number;
}

const ETATS: readonly string[] = ['a_demander', 'accepte', 'refuse'];

/**
 * L'état publié, ou `null` si le serveur ne le publie pas (serveur d'avant
 * la rc8) ou le publie mal. `null` ne pose jamais la question : on ne
 * demande pas un consentement qu'aucun serveur n'enregistrerait.
 */
export function lireConsentementEcoutes(config: unknown): ConsentementEcoutes | null {
  if (!config || typeof config !== 'object') return null;
  const c = (config as Record<string, unknown>)[CLE_CONSENTEMENT_ECOUTES];
  if (!c || typeof c !== 'object') return null;
  const o = c as Record<string, unknown>;
  if (typeof o.state !== 'string' || !ETATS.includes(o.state)) return null;
  return {
    state: o.state as EtatConsentementEcoutes,
    linked: o.linked === true,
    answered_at: typeof o.answered_at === 'string' ? o.answered_at : null,
    dismissals: typeof o.dismissals === 'number' ? o.dismissals : 0,
    max_dismissals: typeof o.max_dismissals === 'number' ? o.max_dismissals : 2,
  };
}

/** La fenêtre s'ouvre seulement sur un serveur relié, et jamais répondu. */
export function questionAPoser(c: ConsentementEcoutes | null): boolean {
  return !!c && c.linked && c.state === 'a_demander';
}

/**
 * Posée une fois par DÉMARRAGE de l'application (chargement de la page), pas
 * à chaque montage de la coquille : sans ce drapeau, revenir sur la coquille
 * rouvrirait la fenêtre qu'on vient de fermer, et la deuxième fermeture
 * clôturerait la question dans la même minute.
 */
let poseeCeDemarrage = false;

export function marquerPoseeCeDemarrage(): void {
  poseeCeDemarrage = true;
}

export function dejaPoseeCeDemarrage(): boolean {
  return poseeCeDemarrage;
}

/** Pour les bancs : simule un nouveau démarrage. */
export function _reinitialiserDemarrage(): void {
  poseeCeDemarrage = false;
}

/** Le corps du `PATCH /system/config` qui porte la réponse. */
export function corpsDeReponse(r: ReponseConsentementEcoutes): Record<string, unknown> {
  return { [CLE_CONSENTEMENT_ECOUTES]: r };
}
