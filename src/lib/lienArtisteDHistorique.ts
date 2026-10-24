/**
 * LE NOM D'UNE LIGNE ARTISTE DE L'HISTORIQUE, CLIQUABLE —
 * tune-server-rust#6466 (FabienM, fil 2302 point 10) : « alimenter
 * l'historique avec le conteneur de l'artiste qui contient les titres de
 * l'artiste joués. Mettre le lien sur l'objet artiste de l'historique vers la
 * page artiste (cf : Lire "Alain Bashung" 9h30) ».
 *
 * Même règle que la ligne playlist (`lienPlaylistDHistorique`) : c'est
 * `context_source`, commun à toutes les écoutes du lot, qui dit chez qui
 * chercher l'artiste.
 *
 *   • `local`   → la page artiste de la bibliothèque, si l'identifiant est un
 *                 entier positif ;
 *   • un service → la page de l'artiste chez ce service ;
 *   • absent ou divergent → la page cherchée par le NOM seul, que
 *                 `ouvrirArtisteDepuis` ne prend que s'il correspond
 *                 exactement — jamais un approchant.
 */
import { get } from 'svelte/store';
import type { ContexteEcoute } from './historiqueParContexte';
import { ouvrirArtisteDepuis } from './ouvrirArtisteDepuis';
import { activeView } from './stores/navigation';

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

/** Ce qui ouvre la page de l'artiste du lot, ou `null` si rien ne la désigne. */
export function ouvertureArtisteDuLot(
  type: string,
  lot: readonly { contexte?: ContexteEcoute | null }[],
  nom: string | null | undefined,
): (() => void) | null {
  if ((type !== 'artist' && type !== 'artiste') || lot.length === 0) return null;
  const titre = typeof nom === 'string' ? nom.trim() : '';
  const id = lot[0].contexte?.id;
  const source = sourceCommune(lot);
  let cible: Record<string, unknown> | null = null;
  if (source === 'local' && id != null && Number.isInteger(Number(id)) && Number(id) > 0) {
    cible = { id: Number(id), name: titre, source: 'local' };
  } else if (source && source !== 'local' && id != null && String(id).trim() !== '') {
    cible = { source, source_id: String(id), name: titre };
  } else if (titre) {
    cible = { name: titre };
  }
  if (!cible) return null;
  const a = cible;
  return () => { void ouvrirArtisteDepuis(a, get(activeView)); };
}
