/**
 * tune-server-rust#6770 — l'identité d'un podcast, palmarès Apple compris.
 *
 * FabienM, fil 2379 point 3 : « impossible de s'abonner et de lire des
 * podcasts des onglets Populaires et Tous ». Le palmarès Apple rend
 * `feed_url: ''` sur ses cinquante entrées, et seulement un `source_id`
 * (`apple-{id}`). L'écran ne connaissait qu'une identité, le FLUX : sans flux,
 * `openPodcast` sortait sans rien faire et le bouton d'abonnement restait
 * grisé. Le serveur sait pourtant résoudre le flux depuis `source_id`, pour
 * l'abonnement comme pour les épisodes (#1000) : il suffisait de le lui
 * transmettre, avec le pays du palmarès.
 */

/** Le flux RSS d'un podcast, ou `null`. `||` et non `??` : le palmarès rend `''`. */
export function fluxDe(p: any): string | null {
  return p?.feed_url || p?.feedUrl || null;
}

/** L'identifiant Apple d'une entrée du palmarès (`apple-…`), ou `null`. */
export function sourceAppleDe(p: any): string | null {
  const s = p?.source_id;
  return typeof s === 'string' && s.startsWith('apple-') && s.length > 'apple-'.length ? s : null;
}

/**
 * Ce qui permet d'ouvrir un podcast ou de s'y abonner : son flux, sinon son
 * identifiant Apple. `null` : rien à demander au serveur.
 */
export function cleDe(p: any): string | null {
  return fluxDe(p) ?? sourceAppleDe(p);
}

/**
 * L'abonnement qui correspond à `p`, par le flux ou par l'identifiant Apple.
 * Un abonnement pris depuis le palmarès porte le flux RÉSOLU par le serveur
 * et le `source_id` d'origine : l'entrée du palmarès, elle, n'a que le second.
 */
export function abonnementDe(subs: any[], p: any): any | undefined {
  const flux = fluxDe(p);
  const source = sourceAppleDe(p);
  return subs.find((s) => (flux != null && fluxDe(s) === flux) || (source != null && sourceAppleDe(s) === source));
}

/** La clé de traduction d'un échec de résolution rendu par le serveur (`code`). */
export function cleEchecResolution(code: string | null | undefined): string | null {
  switch (code) {
    case 'podcast_sans_flux_public': return 'v2.pod.noPublicFeed';
    case 'podcast_introuvable': return 'v2.pod.notFoundAtApple';
    case 'podcast_resolution_reseau': return 'v2.pod.appleUnreachable';
    default: return null;
  }
}
