/**
 * Ce que la zone doit AFFICHER du périphérique réellement ouvert (#2207).
 *
 * La règle vit ici, pas dans le balisage, pour deux raisons :
 *
 * 1. Elle est éprouvable sans monter un composant — les tests de ce dépôt sont
 *    unitaires ou textuels, pas des tests de rendu.
 * 2. Elle est réutilisable telle quelle par la nouvelle interface
 *    (`feat/client-v2-niveaux`), qui aura besoin du même affichage sans
 *    hériter du balisage de `TransportBar`.
 *
 * Le fait à montrer est un ÉCART : la zone est configurée sur un DAC, le
 * backend a ouvert autre chose. Le serveur le sait depuis longtemps
 * (`opened_device_name()`), il ne le disait qu'à son journal.
 */
import type { Zone } from './types';

/** Ce qu'il y a à peindre, ou `null` quand il n'y a rien à dire. */
export interface LecturePeripheriqueSortie {
  /** Le nom réellement ouvert par le backend. Toujours renseigné. */
  ouvert: string;
  /** Le nom demandé par la configuration de la zone. */
  demande: string;
  /** `true` quand le son ne sort pas sur le périphérique configuré. */
  ecart: boolean;
  /** Backend qui a ouvert ce périphérique, pour situer la mesure. */
  backend: string;
}

/**
 * Rend de quoi nommer la sortie réelle d'une zone, ou `null`.
 *
 * `null` dans trois cas, tous légitimes et tous silencieux :
 * - serveur antérieur au champ, ou zone non locale : `audio_backend_status`
 *   absent — un renderer DLNA n'a pas de périphérique local ;
 * - rien n'a encore joué en local : `device` vaut `null` côté serveur, ce qui
 *   est la réponse honnête plutôt qu'un nom plausible ;
 * - charge utile incomplète : sans nom ouvert il n'y a rien à afficher.
 *
 * On ne déduit RIEN de `output_device_id` ni du nom de la zone : deviner le
 * périphérique ouvert serait exactement la faute qu'on corrige.
 */
export function lecturePeripheriqueSortie(
  zone: Zone | null | undefined,
): LecturePeripheriqueSortie | null {
  const device = zone?.audio_backend_status?.device;
  if (!device) return null;
  const ouvert = (device.opened ?? '').trim();
  if (!ouvert) return null;
  const demande = (device.requested ?? '').trim();
  return {
    ouvert,
    demande,
    // On fait confiance au serveur, qui a comparé les deux noms à l'INSTANT de
    // l'ouverture — pas à une comparaison refaite ici sur des chaînes qui ont
    // pu être normalisées entre-temps. Le repli sur une égalité locale ne sert
    // qu'aux charges utiles amputées de `differs`.
    ecart: device.differs ?? (demande !== '' && demande !== 'default' && demande !== ouvert),
    backend: device.backend ?? '',
  };
}
