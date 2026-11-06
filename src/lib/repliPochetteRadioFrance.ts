/** Une seule tentative directe pour une image publique Radio France. */
export function pochetteRadioFranceDirecte(valeur: string | null | undefined): string | null {
  if (!valeur) return null;
  try {
    const url = new URL(valeur);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (!['www.radiofrance.fr', 'radiofrance.fr'].includes(url.hostname)) return null;
    if (!url.pathname.startsWith('/s3/') && !url.pathname.startsWith('/pikapi/images/')) return null;
    return url.href;
  } catch {
    return null;
  }
}
