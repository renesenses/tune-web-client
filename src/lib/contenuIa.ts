/**
 * Le marquage « GÉNÉRÉ PAR IA » d'un album de service — tune-server-rust#5530.
 *
 * FabienM, fil forum 2053 : « Qobuz a introduit un tag pour identifier [les
 * contenus fabriqués par l'IA]. Il serait bien de le récupérer dans Tune ».
 *
 * Qobuz le pose au niveau de l'ALBUM. Le serveur le rend sur un album de
 * service sous `ai_generated` (relevé sur `album/get` le 05/10/2026), et sur
 * un favori de service sous le même nom.
 *
 * Seul `true` vaut marquage : `false` est un « non » du service, et l'absence
 * veut dire qu'il ne dit rien — ni l'un ni l'autre n'affiche de badge.
 */
export function estMarqueIa(o: unknown): boolean {
  return (o as { ai_generated?: unknown } | null | undefined)?.ai_generated === true;
}

/**
 * La fiche d'un album de service doit-elle demander son marquage au serveur ?
 *
 * Oui pour un album QOBUZ dont l'objet reçu ne dit rien (`ai_generated`
 * absent) : un résultat de recherche ou une vignette éditoriale ne le porte
 * pas forcément. Le serveur sert cette fiche depuis le même cache que la
 * liste des pistes, et c'est en la servant qu'il range le marquage sur les
 * favoris qui désignent l'album.
 */
export function marquageIaADemander(service: string | null | undefined, album: unknown): boolean {
  if ((service ?? '').toLowerCase() !== 'qobuz') return false;
  const a = album as { ai_generated?: unknown } | null | undefined;
  return a != null && a.ai_generated === undefined;
}
