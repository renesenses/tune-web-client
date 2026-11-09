// Lien du réglage Spotify vers la page « Connecter Spotify à Tune » du guide
// (site mozaiklabs.fr, /docs/spotify). Le site choisit sa langue par `?lang=`
// (SetLocaleFromBrowser::SUPPORTED) ; une langue qu'il ne parle pas retombe
// sur l'anglais, la page n'existant qu'en fr et en (les autres : anglais).
const LANGUES_DU_SITE = ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'hu'];

export const GUIDE_SPOTIFY = 'https://mozaiklabs.fr/docs/spotify';

export function urlGuideSpotify(langue: string): string {
  const l = LANGUES_DU_SITE.includes(langue) ? langue : 'en';
  return `${GUIDE_SPOTIFY}?lang=${l}`;
}
