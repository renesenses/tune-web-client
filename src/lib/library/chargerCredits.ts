/**
 * Charger les crédits d'un titre ou d'un album — #1572 (FabienM, fil 1921).
 *
 * Un titre : `GET /library/tracks/{id}/credits`, la route que lit déjà le
 * panneau « Crédits » de Lecture en cours.
 *
 * Un album : `GET /library/albums/{id}/credits` — un aller-retour pour tout le
 * disque, chaque ligne portant sa piste. La route arrive avec le lot serveur
 * `batch/credits-affichage-20260925` : un serveur qui ne la sert pas encore
 * répond 404, et l'on retombe alors sur un appel par piste (six à la fois),
 * complété du titre et du numéro que la fiche connaît déjà. Le bouton marche
 * donc sur les deux serveurs, et le repli se tait — pas de bandeau d'erreur
 * pour une route absente.
 */
import * as api from '../api';
import type { CreditAvecPiste } from './credits';

export interface PisteDeLAlbum {
  id?: number | null;
  title?: string | null;
  track_number?: number | null;
  disc_number?: number | null;
}

/** Au plus six requêtes en vol : un coffret de 200 pistes ne doit pas noyer le serveur. */
const EN_VOL = 6;

export async function chargerCreditsAlbum(
  albumId: number,
  pistes: PisteDeLAlbum[],
): Promise<CreditAvecPiste[]> {
  try {
    return await api.getAlbumCredits(albumId);
  } catch (e) {
    const statut = (e as { status?: number } | null)?.status;
    if (statut !== 404 && statut !== 405) throw e;
  }
  const locales = pistes.filter((p): p is PisteDeLAlbum & { id: number } => typeof p.id === 'number');
  const resultats: CreditAvecPiste[][] = new Array(locales.length);
  let suivant = 0;
  async function ouvrier() {
    while (suivant < locales.length) {
      const i = suivant++;
      const p = locales[i];
      try {
        const lignes = await api.getTrackCredits(p.id);
        resultats[i] = lignes.map((c) => ({
          ...c,
          track_id: c.track_id ?? p.id,
          track_title: p.title ?? null,
          track_number: p.track_number ?? null,
          disc_number: p.disc_number ?? null,
        }));
      } catch {
        resultats[i] = [];
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(EN_VOL, locales.length) }, ouvrier));
  return resultats.flat();
}
