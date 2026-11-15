/**
 * web#2286 (part web de tune-server-rust#6687, PR serveur #6690) — la × d'une
 * playlist locale retire LA LIGNE affichée, une à la fois, et l'écran relit.
 *
 * Bertrand, 21/10 : « la suppression de pistes n'est pas fiable ». Les deux
 * écrans (`PlaylistManagerView`, `PlaylistDetailV2`) :
 *   • désignaient la ligne par son RANG seul ;
 *   • retiraient la ligne de la liste locale sur un 204, sans relire : quand
 *     le serveur n'avait rien effacé, l'écran mentait jusqu'à la réouverture ;
 *   • n'étaient pas sérialisés : deux × rapprochées partaient avec des rangs
 *     calculés sur la même liste, la seconde pouvait viser la voisine.
 *
 * Depuis #6690, chaque ligne de `GET /playlists/{id}/tracks` porte `entry_id`
 * (`playlist_tracks.id`) et `POST /tracks/remove` l'accepte ; un retrait qui
 * n'efface rien rend 404. Ce module tient la règle UNE fois pour les deux
 * écrans : `entry_id` quand la ligne le porte, le rang sinon (serveur plus
 * ancien) ; un retrait à la fois ; relecture après le retrait, réussi ou non.
 */
import type { Track } from './types';

export type CibleRetrait = { entry_id: number } | { position: number };

export interface DependancesRetrait {
  retirer: (playlistId: number, cible: CibleRetrait) => Promise<unknown>;
  relire: (playlistId: number) => Promise<Track[]>;
}

/** La cible d'un retrait : la LIGNE si le serveur la nomme, son rang sinon. */
export function cibleDuRetrait(piste: Track | null | undefined, rang: number): CibleRetrait {
  const id = (piste as { entry_id?: unknown } | null | undefined)?.entry_id;
  return typeof id === 'number' && Number.isInteger(id) ? { entry_id: id } : { position: rang };
}

export interface IssueRetrait {
  /** La liste à afficher : relue, ou à défaut celle d'avant (échec). */
  pistes: Track[];
  ok: boolean;
}

/** Un retrait à la fois : un second clic pendant le premier n'émet rien. */
export function creerRetraitPlaylist(deps: DependancesRetrait) {
  let enCours = false;
  return {
    get enCours() {
      return enCours;
    },
    /** `null` quand rien n'est parti (retrait déjà en cours, rang invalide). */
    async retirer(playlistId: number, pistes: readonly Track[], rang: number): Promise<IssueRetrait | null> {
      if (enCours || rang < 0 || rang >= pistes.length) return null;
      enCours = true;
      try {
        let ok = true;
        try {
          await deps.retirer(playlistId, cibleDuRetrait(pistes[rang], rang));
        } catch {
          ok = false;
        }
        try {
          return { pistes: await deps.relire(playlistId), ok };
        } catch {
          // Relecture impossible : on ne retire à l'écran que ce que le
          // serveur a confirmé.
          return { pistes: ok ? pistes.filter((_, i) => i !== rang) : [...pistes], ok };
        }
      } finally {
        enCours = false;
      }
    },
  };
}

/* ------------------------- Playlists DU SERVICE (web#2098, #3067) ------------------------- */

type AvecEditable = { source_id?: unknown; editable?: boolean | null };

/**
 * Une playlist de service dont l'utilisateur est propriétaire : seulement
 * quand le serveur l'affirme (`editable: true`, web#2097). Absent ou faux
 * (playlist suivie, éditoriale, serveur plus ancien) : lecture seule.
 */
export function aMoiChezLeService(pl: AvecEditable | null | undefined): boolean {
  return pl?.editable === true;
}

/**
 * web#3067 — `get_playlist` (Qobuz) rend `editable: None` : une fiche ouverte
 * depuis la recherche, les étiquettes ou un widget ne sait pas si la playlist
 * est à l'utilisateur. `GET /streaming/{service}/playlists` (les playlists du
 * compte) porte le drapeau : on l'y retrouve par l'identifiant. Rend le
 * drapeau déjà porté sans requête ; `null` quand rien ne le dit.
 */
export async function retrouverEditable(
  lister: (service: string) => Promise<unknown>,
  service: string,
  pl: AvecEditable,
): Promise<boolean | null> {
  if (typeof pl.editable === 'boolean') return pl.editable;
  if (pl.source_id == null || !service) return null;
  try {
    const liste = await lister(service);
    if (!Array.isArray(liste)) return null;
    const id = String(pl.source_id);
    const trouvee = (liste as AvecEditable[]).find((p) => String(p?.source_id) === id);
    return typeof trouvee?.editable === 'boolean' ? trouvee.editable : null;
  } catch {
    return null;
  }
}

/**
 * Retire un titre d'une playlist DU SERVICE — toutes ses occurrences (Qobuz
 * retire par `source_id`). Rend la liste sans ce titre ; `null` quand rien
 * n'est parti (titre sans `source_id`) ; lève quand le service refuse, la
 * liste restant alors celle d'avant.
 */
export async function retirerTitreDuService(
  retirer: (service: string, playlistId: string, trackIds: string[]) => Promise<unknown>,
  service: string,
  playlistId: string,
  pistes: readonly Track[],
  piste: Track,
): Promise<Track[] | null> {
  if (piste.source_id == null) return null;
  const sid = String(piste.source_id);
  await retirer(service, playlistId, [sid]);
  return pistes.filter((x) => String(x.source_id) !== sid);
}
