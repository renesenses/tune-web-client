/**
 * Les paliers de « Fréquence max » d'une zone (Réglages > Zones).
 *
 * Un testeur avec un DAC à 768 kHz ne trouvait pas son plafond : la liste
 * s'arrêtait à 705,6 puis sautait à 1411,2 kHz. Elle couvre maintenant les
 * deux familles COMPLÈTES, de 44,1 / 48 kHz jusqu'à 32 × : 44,1 × 2^n et
 * 48 × 2^n, rangées par ordre croissant.
 *
 * Le serveur accepte tout entier positif pour `max_sample_rate` (il ne
 * refuse que > 192 kHz sur un Devialet AIR) ; la liste « Fréquence de sortie
 * fixe » est une AUTRE liste : le serveur la borne à 768 kHz (`CADENCES`).
 */
const BASES = [44100, 48000];

/** 44,1 → 1411,2 kHz et 48 → 1536 kHz, ordre croissant, sans doublon. */
export const CADENCES_PLAFOND: number[] = BASES
  .flatMap((b) => [1, 2, 4, 8, 16, 32].map((m) => b * m))
  .sort((a, b) => a - b);

/** `705600` → `705,6 kHz` ; `48000` → `48 kHz` (virgule décimale, comme l'écran). */
export function libelleCadence(hz: number): string {
  return `${String(hz / 1000).replace('.', ',')} kHz`;
}
