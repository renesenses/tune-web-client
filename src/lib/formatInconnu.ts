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
