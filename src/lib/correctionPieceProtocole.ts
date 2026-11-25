/**
 * Retour de Didier (rc13.90) — le protocole de la mesure au micro, dit
 * simplement : où placer le micro, comment l'orienter, et ce que la mesure
 * fait d'elle-même (PURE, lecture en cours).
 *
 * L'orientation dépend du fichier d'étalonnage : un fichier « 0° » suppose
 * le micro pointé vers les enceintes, un fichier « 90° » le suppose pointé
 * vers le plafond. Chez miniDSP (UMIK-1, UMIK-2), le fichier 90° porte
 * `_90deg` dans son nom, le fichier 0° rien ; on lit donc « 90 » isolé dans
 * le nom, sinon 0°. Sans étalonnage, on donne les deux.
 */

export type OrientationMicro = '0' | '90' | 'inconnue';

export function orientationMicro(etalonnage: string | null | undefined): OrientationMicro {
  const nom = (etalonnage ?? '').trim();
  if (!nom) return 'inconnue';
  // « 90 » qui n'est pas un morceau d'un numéro de série (7090123).
  return /(^|[^0-9])90([^0-9]|$)/.test(nom) ? '90' : '0';
}

export const LIBELLES_ORIENTATION: Record<OrientationMicro, string> = {
  '0': 'v2.room.micAim0',
  '90': 'v2.room.micAim90',
  inconnue: 'v2.room.micAimUnknown',
};

/** Le texte d'orientation, prêt à remplacer `{orientation}`. */
export const texteOrientation = (etalonnage: string | null | undefined, t: (cle: string) => string): string =>
  t(LIBELLES_ORIENTATION[orientationMicro(etalonnage)]);
