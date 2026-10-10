/**
 * Le lien d'accès à distance (Tune Bridge), et son QR code.
 *
 * Le client web servi par le relais lit le jeton du pont dans le fragment de
 * l'adresse (`https://bridge.mozaiklabs.fr/{server_id}/#token=…`, voir
 * `bridge.ts`). Ce lien vaut une clé : il ne vient QUE de
 * `GET /cloud/bridge/access-link`, réservé à l'administrateur côté serveur.
 * Le statut public (`/cloud/bridge/status`) ne le porte pas, et ne doit pas
 * le porter.
 *
 * Tout refus — pont éteint (409), compte standard (403), serveur antérieur
 * sans la route (404) — rend `null` : l'écran n'affiche alors rien de plus
 * qu'avant.
 */
import qrcode from 'qrcode-generator';

export const ROUTE_LIEN_ACCES = '/cloud/bridge/access-link';

/** Seule origine acceptée : un lien vers ailleurs n'est pas montré. */
export const ORIGINE_PONT = 'https://bridge.mozaiklabs.fr/';

/** Le lien, s'il mène bien au pont et porte un jeton non vide ; sinon `null`. */
export function lienValide(lien: unknown): string | null {
  if (typeof lien !== 'string' || !lien.startsWith(ORIGINE_PONT)) return null;
  const i = lien.indexOf('#token=');
  if (i < 0 || lien.length <= i + '#token='.length) return null;
  return lien;
}

/** Lit le lien sur la route réservée ; `null` sur tout refus. */
export async function chargerLienAcces(
  lire: (chemin: string) => Promise<unknown>,
): Promise<string | null> {
  try {
    const d = (await lire(ROUTE_LIEN_ACCES)) as { link?: unknown } | null;
    return lienValide(d?.link);
  } catch {
    return null;
  }
}

/**
 * Le QR code du lien, en SVG autonome.
 *
 * Correction « M » : un téléphone le lit sur un écran d'ordinateur sans
 * peine, et le lien (≈ 110 caractères) tient dans une version modeste. Le SVG
 * ne contient que des tracés : aucun texte du lien n'y figure en clair.
 */
export function qrSvg(lien: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(lien, 'Byte');
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}
