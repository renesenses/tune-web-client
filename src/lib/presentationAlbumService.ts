/**
 * tune-server-rust#6480 (cpadiou77, fil forum 2327) — « il est possible
 * d'accéder aux commentaires Qobuz sur certaines playlists mais les
 * commentaires sur les albums ne sont pas affichés ».
 *
 * Le serveur sert désormais la présentation d'un album de service :
 * `GET /streaming/{service}/albums/{id}/description` →
 * `{ description, language }`, `null` quand l'album n'en a pas, 501 quand le
 * service n'en publie jamais. `description` est du TEXTE : le serveur a déjà
 * retiré tout balisage du HTML de Qobuz. La fiche l'affiche comme du texte
 * (échappé par Svelte), jamais par `{@html}`.
 *
 * Même règle que les crédits de service (`lib/creditsService`) : le bouton ne
 * s'offre que pour un service qui en publie (Qobuz), et un refus (501, ou 404
 * d'un serveur antérieur) le retire pour la session.
 */
import { get, writable } from 'svelte/store';

export const SERVICES_AVEC_PRESENTATION: ReadonlySet<string> = new Set(['qobuz']);

export const servicesPresentationRefuses = writable<ReadonlySet<string>>(new Set());

export interface PresentationAlbum {
  description: string;
  language?: string | null;
}

export interface AlbumDeServicePresentation {
  service: string;
  albumId: string;
}

export function presentationAlbumDeServiceDe(
  service: string | null | undefined,
  sourceId: unknown,
  refuses: ReadonlySet<string> = get(servicesPresentationRefuses),
): AlbumDeServicePresentation | null {
  const sid = sourceId == null ? '' : String(sourceId).trim();
  if (!sid || !service || !SERVICES_AVEC_PRESENTATION.has(service) || refuses.has(service)) return null;
  return { service, albumId: sid };
}

export function estRefusDePresentation(e: unknown): boolean {
  const statut = (e as { status?: number } | null)?.status;
  return statut === 501 || statut === 404 || statut === 405;
}

export type EtatPresentation =
  | { etat: 'texte'; texte: string; langue: string | null }
  | { etat: 'vide' }
  | { etat: 'refus' }
  | { etat: 'erreur' };

/**
 * Lit la présentation et dit quoi afficher. Un refus est retenu : le bouton
 * disparaît des autres fiches du même service.
 */
export async function chargerPresentation(
  cible: AlbumDeServicePresentation,
  lire: (service: string, albumId: string) => Promise<PresentationAlbum | null | undefined>,
): Promise<EtatPresentation> {
  try {
    const r = await lire(cible.service, cible.albumId);
    const texte = typeof r?.description === 'string' ? r.description.trim() : '';
    if (!texte) return { etat: 'vide' };
    return { etat: 'texte', texte, langue: r?.language?.trim() || null };
  } catch (e) {
    if (estRefusDePresentation(e)) {
      servicesPresentationRefuses.update((s) => (s.has(cible.service) ? s : new Set([...s, cible.service])));
      return { etat: 'refus' };
    }
    return { etat: 'erreur' };
  }
}
