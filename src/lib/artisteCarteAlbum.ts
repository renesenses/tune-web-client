/**
 * L'artiste d'une CARTE D'ALBUM DE SERVICE, prêt pour
 * [`ouvrirArtisteDeServiceParNom`] — ou `null`. #2075, volet 3.
 *
 * Sandro, Qobuz, recherche « Leprous » : sous les pochettes de la grille des
 * résultats, le nom de l'artiste n'était qu'un texte, pris dans le bouton qui
 * ouvre l'ALBUM. La fiche album, elle, ouvre déjà l'artiste chez le service
 * (#956) ; la grille ne le faisait pas.
 *
 * - `null` pour un album de la BIBLIOTHÈQUE (ou d'une radio) : la carte garde
 *   son geste d'avant, le nom n'y devient pas un second bouton.
 * - `null` sans nom : pas de bouton mort.
 * - `id` quand le service l'a rendu (`artist_id`, chaîne chez Qobuz, nombre
 *   chez Deezer) : la fiche s'ouvre sans rien deviner. Sinon `null`, et
 *   `ouvrirArtisteDeServiceParNom` résout le nom — avec le repli qui parle.
 */
import { estUnService } from './routageArtiste';

export interface ArtisteDeCarte {
  service: string;
  nom: string;
  id: string | null;
}

export function artisteDeCarteAlbum(a: any): ArtisteDeCarte | null {
  if (!a) return null;
  const service = typeof a.source === 'string' ? a.source.trim() : '';
  if (!estUnService(service)) return null;
  const nom = typeof a.artist_name === 'string' ? a.artist_name.trim() : '';
  if (!nom) return null;
  const brut = a.artist_id;
  const id = brut != null && String(brut).trim() !== '' ? String(brut).trim() : null;
  return { service, nom, id };
}
