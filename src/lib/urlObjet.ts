/**
 * Libérer les URL d'objet (`blob:`) — enquête mémoire vive, fil 2167.
 *
 * `URL.createObjectURL(blob)` épingle le blob dans la mémoire de l'onglet
 * jusqu'à `URL.revokeObjectURL`, ou jusqu'à la fermeture du document. Le
 * Convertisseur et le Dé-ploc fabriquaient une URL par archive téléchargée
 * (`downloadConversion`, `downloadDeclick`) et ne la rendaient jamais : chaque
 * archive — souvent plusieurs centaines de mégaoctets — restait en mémoire
 * tant que l'onglet vivait.
 *
 * La règle : une URL d'objet se libère quand son téléchargement est parti,
 * quand l'écran qui la porte disparaît, ou quand une autre la remplace.
 */

/**
 * Délai entre le clic sur le lien `download` et la libération. Le navigateur
 * lit le blob au moment du clic ; le libérer dans le même tour pourrait, sous
 * certains navigateurs, couper le téléchargement avant qu'il ne parte.
 */
export const DELAI_LIBERATION_MS = 1000;

/** Libère une URL d'objet. Sans effet sur `null`, sur une URL qui n'est pas
 *  `blob:`, ou dans un environnement sans `revokeObjectURL`. */
export function libererUrlObjet(url: string | null | undefined): void {
  if (!url || !url.startsWith('blob:')) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* environnement sans `revokeObjectURL` : rien à libérer */
  }
}

/** Libère l'URL une fois le téléchargement lancé par un clic, puis prévient
 *  l'appelant (qui retire le lien de l'écran : il ne mènerait plus à rien). */
export function libererApresTelechargement(
  url: string | null | undefined,
  apres?: () => void,
): void {
  if (!url) return;
  setTimeout(() => {
    libererUrlObjet(url);
    apres?.();
  }, DELAI_LIBERATION_MS);
}
