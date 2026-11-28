/**
 * Itération 12 — la couleur d'une initiale posée sur la pastille d'un profil.
 *
 * La pastille prend la couleur choisie pour le profil (dorée, rose, verte…) ;
 * une initiale toujours blanche tombait à 2,3:1 sur les teintes claires. On
 * garde le blanc ou l'encre sombre de Nocturne, selon celle qui contraste le
 * plus avec le fond (luminance relative WCAG).
 */
const ENCRE = '#15120a';
const BLANC = '#ffffff';

function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a: string, b: string): number {
  const [x, y] = [luminance(a) ?? 0, luminance(b) ?? 0].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Blanc ou encre : celle qui se lit le mieux sur `fond` (blanc si inconnu). */
export function texteSurFond(fond: string | null | undefined): string {
  if (!fond || luminance(fond) == null) return BLANC;
  return contraste(BLANC, fond) >= contraste(ENCRE, fond) ? BLANC : ENCRE;
}
