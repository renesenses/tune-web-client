/**
 * tune-server-rust#6467 — « Lire » un artiste (fil forum 2302, FabienM,
 * points 10 et 12) : un ensemble de titres AU HASARD de l'artiste, 50 au plus,
 * et non plus le premier album local.
 *
 * - Artiste de la BIBLIOTHÈQUE : `POST /zones/{id}/play` `{ artist_id }`. Le
 *   serveur tire lui-même jusqu'à 50 titres (doublons de copie et titres
 *   bannis écartés), contexte `artist`. Un serveur antérieur ne connaît pas
 *   `artist_id` et répond 400 « no track source specified » : on tire alors
 *   ici, dans `GET /library/artists/{id}/tracks`, avec la même borne.
 * - Artiste d'un SERVICE : ses titres phares, mélangés, 50 au plus — voir
 *   `ArtisteServiceV2`.
 */
import { tirageAleatoire } from './porteeAleatoire';

/** Le plafond demandé par le testeur (point 12). */
export const PLAFOND_ARTISTE = 50;

export type GestesLireArtiste = {
  /** `playAndSync(zid, corps)`. */
  lire: (corps: Record<string, unknown>) => Promise<unknown>;
  /** `api.getArtistTracks(id)`. */
  titres: (artistId: number) => Promise<Array<{ id?: number | null; banned?: boolean }> | null>;
};

/** Le refus d'un serveur qui ne connaît pas `artist_id`. */
export function serveurSansArtistId(e: unknown): boolean {
  const m = String((e as { message?: string })?.message ?? e ?? '');
  return m.includes('no track source specified');
}

/**
 * Lance la lecture d'un artiste de la bibliothèque. Rend le nombre de titres
 * demandés au serveur par le repli, ou `null` quand le serveur a tiré lui-même.
 * Rend `0` quand le repli ne trouve rien de jouable (à dire à l'écran).
 */
export async function lireArtisteBibliotheque(artistId: number, g: GestesLireArtiste): Promise<number | null> {
  try {
    await g.lire({ artist_id: artistId });
    return null;
  } catch (e) {
    if (!serveurSansArtistId(e)) throw e;
  }
  const jouables = ((await g.titres(artistId)) ?? []).filter((p) => p?.id != null && !p.banned);
  const tires = tirageAleatoire(jouables, PLAFOND_ARTISTE);
  if (!tires.length) return 0;
  await g.lire({
    track_ids: tires.map((p) => p.id as number),
    context_type: 'artist',
    context_id: String(artistId),
  });
  return tires.length;
}
