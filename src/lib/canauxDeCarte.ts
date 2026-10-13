/**
 * tune-server-rust#6171 — les canaux de la carte qu'une zone ASIO utilise.
 *
 * Le serveur publie `GET /output-channels/zones/{id}` :
 * `{ output_channels: [3, 4] | null, card_channels_opened, limits: { min, max } }`.
 * Le canal `i` de la piste (1 = gauche, 2 = droite, puis l'ordre du fichier)
 * sort sur le canal `output_channels[i]` de la carte. Numéros à partir de 1.
 */
export const CANAL_MAX = 512;

export type SaisieDeCanaux = { canaux: number[] } | { erreur: 'forme' | 'borne' | 'doublon'; valeur: string };

/**
 * Lit « 3, 4 », « 3-4 » ou « 1-2, 5, 6, 3-4 » : des numéros ou des plages
 * croissantes, séparés par des virgules ou des espaces. Une saisie vide vaut
 * `[]` (rien de réglé). L'ORDRE compte : c'est celui des canaux de la piste.
 */
export function lireSaisieDeCanaux(texte: string): SaisieDeCanaux {
  const canaux: number[] = [];
  for (const morceau of texte.split(/[,;\s]+/).filter(Boolean)) {
    const plage = morceau.match(/^(\d+)(?:-(\d+))?$/);
    if (!plage) return { erreur: 'forme', valeur: morceau };
    const debut = Number(plage[1]);
    const fin = plage[2] === undefined ? debut : Number(plage[2]);
    if (fin < debut) return { erreur: 'forme', valeur: morceau };
    for (let n = debut; n <= fin; n++) {
      if (n < 1 || n > CANAL_MAX) return { erreur: 'borne', valeur: String(n) };
      if (canaux.includes(n)) return { erreur: 'doublon', valeur: String(n) };
      canaux.push(n);
    }
  }
  return { canaux };
}

/** `[3, 4]` → « 3, 4 » ; `null` → « ». */
export function afficherCanaux(canaux: number[] | null | undefined): string {
  return Array.isArray(canaux) ? canaux.join(', ') : '';
}

/** Ce que la zone envoie à chaque canal de la carte, pour l'écran :
 *  `[[1, 3], [2, 4]]` = canal 1 de la piste → canal 3 de la carte. */
export function correspondance(canaux: number[]): Array<[number, number]> {
  return canaux.map((c, i) => [i + 1, c]);
}
