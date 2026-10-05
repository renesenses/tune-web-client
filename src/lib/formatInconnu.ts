/**
 * #4346 — le codec INCONNU dans le chemin du signal.
 *
 * Une radio pas encore sondée (ou un format que le serveur ne reconnaît pas)
 * n'a pas de codec connu. Le serveur le publiait `lossless: false`, et
 * l'écran annonçait « Avec perte » — une affirmation, là où le serveur ne
 * savait rien. Il écrivait aussi le mot anglais « Unknown » en dur dans les
 * descriptions (« Unknown → Unknown 44kHz/16bit »), montré tel quel.
 *
 * Le serveur publie désormais :
 * - `signal_path.lossless: null` quand le codec est inconnu ;
 * - `code: 'source_codec_unknown'` sur les étapes dont la description nomme
 *   ce codec inconnu, par le jeton neutre `?`.
 *
 * Compatibilité : un serveur plus ancien (0.9.165 et avant) n'envoie jamais
 * `null` ni ce code — l'affichage d'avant est conservé à l'identique.
 */

/** Code stable des étapes qui nomment un codec inconnu (serveur, #4346). */
export const CODE_CODEC_INCONNU = 'source_codec_unknown';

/** Jeton neutre par lequel le serveur nomme un codec inconnu. */
export const JETON_CODEC_INCONNU = '?';

export type EtatSansPerte = 'lossless' | 'lossy' | 'unknown';

/**
 * L'état « sans perte » à afficher en en-tête du chemin du signal.
 *
 * `null` est l'état inconnu, et seulement lui : `undefined` (champ absent,
 * vieux serveur) retombe sur `bit_perfect`, comme avant.
 */
export function etatSansPerte(
  sp: { lossless?: boolean | null; bit_perfect?: boolean } | null | undefined,
): EtatSansPerte {
  if (sp?.lossless === null) return 'unknown';
  return (sp?.lossless ?? sp?.bit_perfect) ? 'lossless' : 'lossy';
}

/**
 * La description d'une étape, le jeton du codec inconnu remplacé par le
 * libellé traduit. Toute autre étape est rendue telle quelle.
 */
export function descriptionDEtape(
  step: { description?: string | null; code?: string | null } | null | undefined,
  libelleInconnu: string,
): string {
  const description = step?.description ?? '';
  if (step?.code !== CODE_CODEC_INCONNU) return description;
  return description.split(JETON_CODEC_INCONNU).join(libelleInconnu);
}

/**
 * Cette étape-là laisse-t-elle le signal intact ?
 *
 * Le serveur calcule le drapeau POUR CHAQUE étape (`steps[].bit_perfect`) ; le
 * verdict global n'est que le repli des serveurs qui ne l'envoient pas (#1097,
 * #1985). Une seule définition, lue par les DEUX panneaux du chemin du signal.
 */
export function etapeIntacte(step: { bit_perfect?: boolean } | null | undefined, verdict: boolean): boolean {
  return step?.bit_perfect ?? verdict;
}

/**
 * Le trait qui relie l'étape `i` à la suivante est-il intact ?
 *
 * Jean Valjean, fil 1825 : « Deux affichages différents pour la même
 * indication ». Le chemin du signal se dessine à deux endroits — la fenêtre de
 * la barre de lecture et l'onglet Bit-perfect de Lecture en cours — et chacun
 * avait sa copie de la règle. Lecture en cours peignait le trait d'après ses
 * DEUX extrémités ; la barre de lecture d'après la seule étape amont. Sur un
 * rééchantillonnage 44,1 → 192 kHz (étape altérée), le trait qui y DESCEND
 * restait vert dans la barre et virait à l'orange dans Lecture en cours.
 *
 * La règle est celle de Lecture en cours : un trait n'est intact que si ses
 * deux extrémités le sont — du vert ne descend pas dans un maillon altéré.
 */
export function traitIntact(
  steps: readonly ({ bit_perfect?: boolean } | null | undefined)[],
  i: number,
  verdict: boolean,
): boolean {
  return etapeIntacte(steps[i], verdict) && etapeIntacte(steps[i + 1], verdict);
}
