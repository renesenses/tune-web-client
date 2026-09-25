/**
 * Les crédits d'un titre ou d'un album de SERVICE — `renesenses/tune-server-rust#4993`
 * (FabienM, fil forum 1921 ; go de Bertrand).
 *
 * #1572 réservait « Voir les crédits » et le bouton « Crédits » de la fiche
 * album à la BIBLIOTHÈQUE : les routes `GET /library/tracks/{id}/credits` et
 * `GET /library/albums/{id}/credits` prennent un `i64`. Le serveur
 * (srv#5041) sert désormais la même chose chez le service :
 *
 *     GET /api/v1/streaming/{service}/tracks/{source_id}/credits
 *     GET /api/v1/streaming/{service}/albums/{album_source_id}/credits
 *
 * Même forme, champ pour champ — à ceci près que `id` et `artist_id` sont
 * TOUJOURS `null` et que `track_id` est la CHAÎNE du service.
 *
 * ## La règle : une liste statique, plus les refus constatés
 *
 * On ne sait si un service a des crédits qu'en l'appelant. Plutôt qu'une sonde
 * (une requête de plus pour chaque service croisé, et une entrée qui
 * apparaîtrait APRÈS l'ouverture du menu), on tient la liste des services dont
 * le serveur sait rendre les crédits — Qobuz SEUL aujourd'hui, les autres
 * répondent 501. Un service s'ajoute ici, et nulle part ailleurs.
 *
 * Un refus reçu malgré tout — 501 (le service n'en a pas) ou 404 (serveur
 * antérieur à srv#5041) — est RETENU pour la session : le tiroir le dit
 * clairement, puis l'entrée et le bouton disparaissent pour ce service. Pas de
 * geste muet répété.
 *
 * La règle vit ici, une fois, pour les trois surfaces (`v2/PisteActions`,
 * `partages/MenuPisteV1`, `v2/AlbumDetailV2`) : la leçon de
 * `routageAlbum.albumDeServiceDe`, dont les deux copies avaient divergé.
 */
import { get, writable } from 'svelte/store';
import { pisteDeServiceDe, type PisteDeService } from './champsPisteService';

/**
 * Les services dont le serveur rend les crédits. Qobuz SEUL (srv#5041) :
 * Tidal, Deezer, Spotify, YouTube, Amazon et Bandcamp répondent 501.
 */
export const SERVICES_AVEC_CREDITS: ReadonlySet<string> = new Set(['qobuz']);

/**
 * Les services qui ont REFUSÉ les crédits pendant la session (501 ou 404).
 * Un store, pour que les menus déjà montés retirent l'entrée aussitôt.
 */
export const servicesCreditsRefuses = writable<ReadonlySet<string>>(new Set());

/** Le statut d'un refus — 501 (pas de crédits chez ce service), 404 (serveur trop ancien). */
export function estRefusDeCredits(e: unknown): boolean {
  const statut = (e as { status?: number } | null)?.status;
  return statut === 501 || statut === 404 || statut === 405;
}

export function retenirRefusDeCredits(service: string): void {
  servicesCreditsRefuses.update((s) => (s.has(service) ? s : new Set([...s, service])));
}

/** Pour les bancs : oublier les refus d'un test à l'autre. */
export function oublierRefusDeCredits(): void {
  servicesCreditsRefuses.set(new Set());
}

export function serviceACredits(
  service: string | null | undefined,
  refuses: ReadonlySet<string> = get(servicesCreditsRefuses),
): boolean {
  return !!service && SERVICES_AVEC_CREDITS.has(service) && !refuses.has(service);
}

/** Le titre de service qui a droit à « Voir les crédits », ou `null`. */
export function creditsDeServiceDe(
  piste: unknown,
  refuses: ReadonlySet<string> = get(servicesCreditsRefuses),
): PisteDeService | null {
  const p = pisteDeServiceDe(piste);
  return p && serviceACredits(p.service, refuses) ? p : null;
}

/** Un album désigné chez son service. */
export interface AlbumDeServiceCredits {
  service: string;
  albumId: string;
}

/**
 * L'album de service qui a droit au bouton « Crédits », ou `null`. Même
 * désignation que la fiche (`service` + `source_id`), Bandcamp exclu par la
 * liste.
 */
export function creditsAlbumDeServiceDe(
  service: string | null | undefined,
  sourceId: unknown,
  refuses: ReadonlySet<string> = get(servicesCreditsRefuses),
): AlbumDeServiceCredits | null {
  const sid = sourceId == null ? '' : String(sourceId).trim();
  if (!sid || !serviceACredits(service, refuses)) return null;
  return { service: service!, albumId: sid };
}
