/** Choix Tune explicite, sans réencoder les autres paramètres (jeton, filtres). */
export function avecLangue(url: string, langue: string): string {
  const indexFragment = url.indexOf('#');
  const fragment = indexFragment < 0 ? '' : url.slice(indexFragment);
  const avantFragment = indexFragment < 0 ? url : url.slice(0, indexFragment);
  const index = avantFragment.indexOf('?');
  const chemin = index < 0 ? avantFragment : avantFragment.slice(0, index);
  const params = (index < 0 ? [] : avantFragment.slice(index + 1).split('&'))
    .filter((p) => p && new URLSearchParams(p).has('lang') === false);
  params.push(`lang=${encodeURIComponent(langue)}`);
  return `${chemin}?${params.join('&')}${fragment}`;
}

/** Les surfaces qui publient le chemin du signal : liste/fiche de zone et lecture.
 * Les autres contrats API gardent leur URL et la langue via Accept-Language.
 * Le préfixe accepte également /api/relay/{serveur}/zones du pont distant.
 */
export function avecLangueSignal(url: string, langue: string): string {
  const chemin = url.split(/[?#]/, 1)[0].replace(/^https?:\/\/[^/]+/, '')
    .replace(/^\/api\/(?:v1|relay\/[^/]+)(?=\/)/, '');
  return /^\/zones(?:\/\d+(?:\/|$)|\/?$)/.test(chemin) || /^\/playback\/shuffle-all$/.test(chemin)
    ? avecLangue(url, langue) : url;
}
