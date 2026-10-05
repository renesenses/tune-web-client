/**
 * LE NOM D'UNE LIGNE PLAYLIST DE L'HISTORIQUE, CLIQUABLE — web#1895 (FabienM,
 * fil 2120), seconde moitié : « Si on clique sur "Dimanche R&B / Neo-Soul"
 * cela ouvre la playlist ». La première moitié (la ligne Album) est
 * `lib/lienAlbumDePiste`.
 *
 * ## Playlist locale ou playlist de service : le CONTEXTE le dit
 *
 * Une playlist Qobuz et une playlist locale ont toutes deux un identifiant
 * ENTIER (`21846544`, `12`) : l'identifiant seul ne dit pas chez qui le
 * chercher. Les PISTES non plus — une playlist Qobuz peut contenir un morceau
 * de la bibliothèque (`historiqueParContexte.serviceDePlaylist`).
 *
 * Le serveur écrit, avec chaque écoute, l'ESPACE DE NOMS de l'objet lancé :
 * `context_source` (`local`, `qobuz`, `tidal`…). C'est lui, et lui seul, qui
 * décide :
 *
 *   • `local`   → la fiche de la playlist de la bibliothèque, si l'identifiant
 *                 est un entier positif ;
 *   • un service → la fiche de la playlist de ce service ;
 *   • absent    → AUCUN lien. Une écoute d'avant la migration du serveur ne
 *                 l'a jamais su, et deviner, c'est risquer d'ouvrir la
 *                 playlist 12 d'un autre catalogue.
 *
 * Les écoutes d'un même objet doivent toutes porter la MÊME source : le
 * regroupement compare le type et l'identifiant, pas la source, et deux
 * playlists de catalogues différents peuvent partager un numéro. En cas de
 * désaccord, pas de lien.
 *
 * Il faut aussi un NOM : la fiche d'une playlist de service ne relit pas le
 * sien, et une fiche sans titre ne vaut pas mieux que la ligne.
 */
import { ouvrirParRaccourci, ouvrirPlaylistDeService } from './ouvrirParRaccourci';
import type { ContexteEcoute } from './historiqueParContexte';

/** La source commune des écoutes, ou `null` si l'une l'ignore ou diverge. */
function sourceCommune(lot: readonly { contexte?: ContexteEcoute | null }[]): string | null {
  let source: string | null = null;
  for (const e of lot) {
    const s = typeof e.contexte?.source === 'string' ? e.contexte.source.trim().toLowerCase() : '';
    if (!s) return null;
    if (source == null) source = s;
    else if (source !== s) return null;
  }
  return source;
}

export function ouverturePlaylistDuLot(
  type: string,
  lot: readonly { contexte?: ContexteEcoute | null }[],
  nom: string | null | undefined,
  pochette: string | null = null,
): (() => void) | null {
  if (type !== 'playlist' || lot.length === 0) return null;
  const titre = typeof nom === 'string' ? nom.trim() : '';
  if (!titre) return null;
  const id = lot[0].contexte?.id;
  if (id == null || String(id).trim() === '') return null;
  const source = sourceCommune(lot);
  if (!source) return null;
  if (source === 'local') {
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) return null;
    return () => { void ouvrirParRaccourci('playlists', `playlists:${n}`, n, titre); };
  }
  return () => {
    void ouvrirPlaylistDeService(source, { source_id: String(id), name: titre, cover_path: pochette });
  };
}
