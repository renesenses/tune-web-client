/**
 * #1394 — poser la photo de l'appareil d'une zone, APRÈS avoir dit où elle va.
 *
 * Le ticket demandait d'abord ceci : « Le consentement est implicite. La photo
 * quitte la machine sans que l'utilisateur l'ait lu quelque part. »
 *
 * Mesuré le 07/10/2026 sur la tête serveur : la photo NE QUITTE PAS la
 * machine. `POST /zones/{id}/image` la range dans le cache d'images et dans
 * les `settings` (`zone_{id}_image`), et aucune route ne la pousse vers le
 * catalogue communautaire. Mais rien, à l'écran, ne le disait au moment du
 * geste : l'entrée « Changer l'image… » de la roue crantée — le chemin
 * PRINCIPAL depuis le 20/09 — envoyait le fichier dès sa sélection, sans un
 * mot. La seule mention (« Elle reste sur ce serveur ») vivait dans les
 * Réglages, en niveau Avancé, invisibles par défaut.
 *
 * Désormais, les DEUX chemins passent par ici, et rien ne part avant que
 * l'utilisateur ait lu, puis validé :
 *  - OÙ va la photo : ce serveur, et lui seul ; ni Mozaiklabs ni personne ;
 *  - la consigne de prise de vue du ticket : l'appareil seul, pas de
 *    personne, pas d'écran à données personnelles, rien qui identifie le
 *    domicile.
 *
 * Annuler n'envoie rien. C'est aussi le préalable de la tranche suivante : le
 * jour où une photo pourra être PROPOSÉE au catalogue, la case « Partager
 * cette photo » trouvera sa place dans ce même dialogue — pas avant, car une
 * case qui ne fait rien serait un mensonge sur ce qui part.
 */
import { shareZoneImage, uploadZoneImage } from './api';
import type { Zone } from './types';

/** Les paragraphes du dialogue, dans l'ordre où on les lit. */
export const CLES_AVANT_ENVOI = [
  'v2.zone.photoConsentWhere',
  'v2.zone.photoConsentGuide',
  'v2.zone.photoConsentConfirm',
] as const;

/** Le texte du dialogue : un paragraphe par clé (le dialogue rend `pre-line`). */
export function messageAvantEnvoi(traduire: (cle: string) => string): string {
  return CLES_AVANT_ENVOI.map((c) => traduire(c)).join('\n\n');
}

export interface DepsPhotoAppareil {
  /** `dialogs.confirm` : vrai si l'utilisateur valide. */
  confirmer: (message: string) => Promise<boolean>;
  traduire: (cle: string) => string;
  /** L'envoi au serveur ; `api.uploadZoneImage` par défaut. */
  envoyer?: (zoneId: number, fichier: File) => Promise<{ image_path: string }>;
}

/**
 * Demande l'accord, puis envoie. `null` = l'utilisateur a refusé : RIEN n'est
 * parti. Une erreur d'envoi remonte telle quelle, l'appelant la dit.
 */
export async function poserPhotoAppareil(
  zoneId: number,
  fichier: File,
  deps: DepsPhotoAppareil,
): Promise<{ image_path: string } | null> {
  if (!(await deps.confirmer(messageAvantEnvoi(deps.traduire)))) return null;
  return (deps.envoyer ?? uploadZoneImage)(zoneId, fichier);
}

/**
 * #2109 — PROPOSER la photo au catalogue communautaire : un second geste,
 * distinct de la pose, et lui aussi précédé d'un accord lu.
 *
 * Poser une photo la garde sur ce serveur (ci-dessus, et le dialogue le dit).
 * La proposer l'envoie à Mozaiklabs, avec la marque et le modèle de la zone.
 * Le site l'enregistre EN ATTENTE : rien ne redescend chez personne avant que
 * Bertrand l'ait approuvée (décision du 20/09/2026). Le dialogue le dit, au
 * futur, et rappelle la consigne de prise de vue.
 */
export const CLES_AVANT_PROPOSITION = [
  'v2.zone.photoShareWhere',
  'v2.zone.photoConsentGuide',
  'v2.zone.photoShareConfirm',
] as const;

/** Le bouton n'a de sens que si ce serveur sait proposer, et qu'il y a une photo. */
export function propositionPossible(z: Pick<Zone, 'image_path' | 'image_share_status'>): boolean {
  return !!z.image_path && z.image_share_status !== undefined;
}

/** La clé du texte qui explique un refus du serveur, ou `null`. */
export function cleRefusProposition(err: unknown): string | null {
  const statut = (err as { status?: number } | null)?.status;
  if (statut === 409) return 'v2.zone.photoShareNeedsDevice';
  if (statut === 422) return 'v2.zone.photoShareUnknownBrand';
  return null;
}

export interface DepsProposition {
  confirmer: (message: string) => Promise<boolean>;
  traduire: (cle: string) => string;
  /** `api.shareZoneImage` par défaut. */
  proposer?: (zoneId: number) => Promise<{ image_share_status: 'pending' | null }>;
}

/**
 * Demande l'accord, puis propose. `null` = refusé : RIEN n'est parti. Une
 * erreur du serveur remonte telle quelle (voir `cleRefusProposition`).
 */
export async function proposerPhotoAuCatalogue(
  zoneId: number,
  deps: DepsProposition,
): Promise<{ image_share_status: 'pending' | null } | null> {
  const message = CLES_AVANT_PROPOSITION.map((c) => deps.traduire(c)).join('\n\n');
  if (!(await deps.confirmer(message))) return null;
  return (deps.proposer ?? shareZoneImage)(zoneId);
}
