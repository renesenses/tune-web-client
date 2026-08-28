/**
 * Traduction des échecs de l'écran « Support premium » en phrases utiles.
 *
 * Défaut d'origine (#2178) : un 429 du relais mozaiklabs — la limite d'envoi —
 * tombait dans le repli générique et s'affichait « Une erreur est survenue.
 * Réessaie dans un instant. (429) ». Reivax66 en a conclu que la fonction était
 * cassée, et il avait toutes les raisons : rien dans cette phrase ne dit que
 * c'est un plafond d'envoi, ni quand réessayer.
 *
 * Le module est PUR — il reçoit sa fonction de traduction et sa langue — pour
 * être testable sans monter le composant.
 *
 * Deux principes :
 *  - **On ne devine jamais un délai.** `retry_after` vient du serveur (qui le
 *    lit dans l'en-tête `Retry-After` de mozaiklabs, cf.
 *    `tune-core/src/cloud/support.rs`). Sans lui, la phrase dit « réessaie plus
 *    tard » — pas « dans une heure ».
 *  - **Un statut non traité reste visible** (#1267) : mieux vaut un générique
 *    suivi du code qu'un générique aveugle.
 */

/** Traduction avec interpolation `{clé}` — même contrat que `tr1()` de SupportView. */
export type Traduire = (key: string, vars?: Record<string, string | number>) => string;

/** Erreur telle que la lèvent les aides de `lib/api.ts`. */
interface ErreurApi {
  message?: string;
  status?: number;
  retryAfter?: number;
}

function commeErreurApi(e: unknown): ErreurApi {
  return (e ?? {}) as ErreurApi;
}

/** Texte de l'erreur, quelle que soit sa forme. */
function texte(e: unknown): string {
  return e instanceof Error ? e.message : String(e ?? '');
}

/**
 * Statut HTTP porté par l'erreur.
 *
 * `err.status` fait foi. Le repli lit le code **en tête** du message
 * (`"429 — Too Many Attempts."`, forme d'`erreurDepuisReponse`) : l'ancien code
 * cherchait le code n'importe où dans la chaîne, si bien qu'un détail
 * contenant « 403 » détournait le message vers « réservé à Tune Premium ».
 */
export function statutHttp(e: unknown): number | undefined {
  const brut = commeErreurApi(e).status;
  if (typeof brut === 'number' && Number.isFinite(brut)) return brut;
  const m = texte(e).match(/^\s*(\d{3})\b/);
  return m ? Number(m[1]) : undefined;
}

/** Délai avant nouvelle tentative, en secondes, quand le serveur l'a annoncé. */
export function delaiAvantNouvelleTentative(e: unknown): number | undefined {
  const secs = commeErreurApi(e).retryAfter;
  if (typeof secs !== 'number' || !Number.isFinite(secs) || secs <= 0) return undefined;
  return Math.ceil(secs);
}

/**
 * « dans 3 minutes », « in 3 minutes », « 3 perc múlva »… — rendu par `Intl`,
 * qui connaît le pluriel des onze langues de l'interface là où des clés de
 * traduction à la main ne le connaîtraient pas.
 *
 * L'unité est choisie pour rester lisible : sous la minute on compte en
 * secondes, sous l'heure en minutes (arrondies au-dessus, pour ne jamais
 * inviter à réessayer trop tôt), au-delà en heures.
 */
export function delaiLisible(secondes: number, locale: string): string {
  const [valeur, unite]: [number, Intl.RelativeTimeFormatUnit] =
    secondes < 60
      ? [Math.ceil(secondes), 'second']
      : secondes < 3600
        ? [Math.ceil(secondes / 60), 'minute']
        : [Math.ceil(secondes / 3600), 'hour'];
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(valeur, unite);
  } catch {
    // Langue inconnue d'Intl : le français est déjà le repli de tout le reste.
    return new Intl.RelativeTimeFormat('fr', { numeric: 'always' }).format(valeur, unite);
  }
}

/**
 * Message affichable pour un échec du support premium.
 *
 * @param e       l'erreur levée par `lib/api.ts`
 * @param tr      traduction avec interpolation
 * @param locale  langue courante de l'interface (pour le délai)
 */
export function messageErreurSupport(e: unknown, tr: Traduire, locale: string): string {
  const msg = texte(e);
  const status = statutHttp(e);

  // Sentinelles levées AVANT toute lecture de statut par lib/api.ts : sans
  // elles, un 401 s'affichait en générique nu, sans même son code.
  if (msg === 'Session expired') return tr('support.errorSessionExpired');
  if (msg === 'premium_required') return tr('support.errorPremiumOnly');

  // Limite d'envoi du relais mozaiklabs : le motif ET le moment de réessayer.
  if (status === 429) {
    const secondes = delaiAvantNouvelleTentative(e);
    return secondes === undefined
      ? tr('support.errorRateLimited')
      : tr('support.errorRateLimitedRetry', { delay: delaiLisible(secondes, locale) });
  }

  // Erreurs de pièces jointes (400 type/nombre, 413 trop gros) : le serveur
  // renvoie déjà un message FR explicite — on l'affiche tel quel.
  if ((status === 400 || status === 413) && msg && !/^\d{3}$/.test(msg)) return msg;

  if (status === 412) return tr('support.errorNotConnected');
  if (status === 403 || status === 402) return tr('support.errorPremiumOnly');
  if (status === 401) return tr('support.errorSessionExpired');

  // Relais injoignable (502 posé par `cloud::support::request_error`) ou site
  // en maintenance : ce n'est pas la faute de l'utilisateur, et réessayer
  // marchera. Le générique laissait croire à une saisie fautive.
  if (status === 502 || status === 503 || status === 504) return tr('support.errorUnavailable');

  return status ? `${tr('support.errorGeneric')} (${status})` : tr('support.errorGeneric');
}
