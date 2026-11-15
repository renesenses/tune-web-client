/**
 * tune-server-rust#8565 / #8580 — pourquoi la dernière session lancée depuis
 * l'application Spotify n'a pas pu jouer dans la zone exposée
 * (`session_error` du statut du récepteur). Un code stable est traduit ;
 * un autre motif (sortie de la zone) passe tel quel.
 */
export const CLES_ERREUR_SESSION_SPOTIFY: Readonly<Record<string, string>> = {
  exposed_zone_missing: 'settings.spotifySessionZoneMissing',
  // #8580 — plafond de zones de l'offre gratuite de Tune.
  zone_cap_reached: 'settings.spotifySessionZoneCap',
  // #8580 — contrôle parental (hors des plages, budget épuisé, contenu explicite).
  parental_refused: 'settings.spotifySessionParental',
};

/** La phrase à afficher pour `code`, avec la fonction de traduction `tr`. */
export function erreurDeSessionSpotify(code: string, tr: (cle: string) => string): string {
  const cle = Object.prototype.hasOwnProperty.call(CLES_ERREUR_SESSION_SPOTIFY, code)
    ? CLES_ERREUR_SESSION_SPOTIFY[code]
    : null;
  return cle ? tr(cle) : code;
}
