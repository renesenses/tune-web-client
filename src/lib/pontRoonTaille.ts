/**
 * La taille d'une archive du Pont Roon, lisible — Mo ou Go selon la langue.
 *
 * Fabien, 22/09/2026 : une archive de 600 Mo échouait sur « NetworkError when
 * attempting to fetch resource ». Le serveur coupait la connexion à son
 * plafond (600 Mio) sans rien dire. Le plafond est désormais annoncé par
 * `GET /ext/pont-roon/` (`archive_max_octets`) : l'écran le compare AVANT
 * d'envoyer, et le dit dans la langue de l'utilisateur.
 *
 * Base 1024, comme le plafond du serveur (8 Gio) : « 8 Go » et non « 8,6 Go ».
 * L'unité vient d'`Intl` (`megabyte` / `gigabyte`), qui l'écrit « Mo » en
 * français, « MB » en anglais — aucune unité en dur à traduire.
 */
const MIO = 1024 * 1024;
const GIO = 1024 * MIO;

export function tailleLisible(octets: number, langue: string): string {
  const [valeur, unite] = octets >= GIO ? [octets / GIO, 'gigabyte'] : [octets / MIO, 'megabyte'];
  const chiffres = valeur < 10 ? 1 : 0;
  try {
    return new Intl.NumberFormat(langue, {
      style: 'unit',
      unit: unite,
      unitDisplay: 'short',
      maximumFractionDigits: chiffres,
    }).format(valeur);
  } catch {
    return `${valeur.toFixed(chiffres)} ${unite === 'gigabyte' ? 'GB' : 'MB'}`;
  }
}

/** L'archive dépasse-t-elle le plafond ANNONCÉ ? Plafond inconnu : on envoie. */
export function depassePlafond(octets: number, plafond: number | null | undefined): boolean {
  return typeof plafond === 'number' && plafond > 0 && octets > plafond;
}
