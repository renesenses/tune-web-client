/**
 * web#3137 — couper un chemin de dossier pour le tronquer AU MILIEU.
 *
 * Dans Réglages › Bibliothèque › Emplacements, un chemin trop long pour sa
 * ligne était coupé par la fin (`text-overflow: ellipsis`) : sous Windows,
 * avec cinq commandes sur la ligne, il ne restait RIEN du chemin (Tades,
 * fil 2866 ; Van Der Graaf Generator, forum-hifi.fr). Or c'est la fin du
 * chemin, le dernier dossier, qui distingue une ligne de l'autre.
 *
 * On sépare donc le chemin en deux : le début (tout jusqu'au dernier
 * séparateur inclus), qui se tronque, et le dernier dossier, qui reste
 * entier tant qu'il tient. Le CSS fait le reste : « D:\Musique\Cla…\Jazz ».
 *
 * Les deux morceaux, recollés, redonnent EXACTEMENT le chemin : le texte de
 * la ligne, et ce que lit un lecteur d'écran, ne changent pas.
 */
export interface CheminCoupe {
  debut: string;
  fin: string;
}

export function couperChemin(chemin: string): CheminCoupe {
  // Un séparateur final (« D:\Musique\ ») ne compte pas : on coupe avant le
  // dernier dossier, pas après lui.
  let bout = chemin.length;
  while (bout > 1 && (chemin[bout - 1] === '/' || chemin[bout - 1] === '\\')) bout--;
  const coupe = Math.max(chemin.lastIndexOf('/', bout - 1), chemin.lastIndexOf('\\', bout - 1));
  // Pas de séparateur, ou seulement en tête (« /musique ») : rien à couper.
  if (coupe <= 0) return { debut: '', fin: chemin };
  return { debut: chemin.slice(0, coupe + 1), fin: chemin.slice(coupe + 1) };
}
