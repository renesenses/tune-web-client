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
import { uploadZoneImage } from './api';

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
