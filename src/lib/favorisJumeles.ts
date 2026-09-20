/**
 * Quels favoris de SERVICE ont un jumeau dans la bibliothèque — #1081.
 *
 * ## Pourquoi il faut aller le chercher
 *
 * Mesure sur le .18 le 20/09/2026, profil 1 : `GET /profiles/1/favorites/
 * streaming?item_type=track` rend 53 objets ; aucun ne porte d'identifiant de
 * bibliothèque, et aucune piste locale ne porte d'identifiant de service. **Le
 * lien entre les deux n'est porté par aucun champ** — c'est le couple
 * titre+artiste normalisé, et lui seul, exactement comme dans le
 * `track_favorites_sub` du serveur.
 *
 * L'écran Favoris ne voit donc que le favori de service. Pour savoir s'il
 * s'agit d'un titre que l'utilisateur POSSÈDE, il faut le demander à la
 * bibliothèque. Résultat mesuré : 23 des 53 ont au moins un jumeau local, 30
 * n'en ont aucun.
 *
 * ## Ce que cette résolution NE fait PAS
 *
 * Elle ne rend pas les pistes locales trouvées, seulement les CLÉS des favoris
 * qui en ont au moins une. Les 23 favoris jumelés touchent 44 pistes locales —
 * « Canopée » de Polo & Pan en touche trois. Les rendre déplierait l'onglet
 * Titres de 53 à 74 lignes et y répéterait le même morceau : l'objet affiché
 * reste le favori, unique, qui gagne seulement le droit de paraître sous
 * « Bibliothèque ».
 *
 * ## Coût
 *
 * Une recherche par TITRE DISTINCT, jamais une par favori : sur le .18, 53
 * favoris ne font pas 53 requêtes si deux services aiment le même morceau
 * (« Hot for the Mountain » est en favori chez Qobuz ET chez Tidal). C'est le
 * même ordre de grandeur que `getFavorites`, qui relit déjà chaque favori
 * local un par un. Chaque recherche tolère son propre échec : un serveur qui
 * bronche sur un titre ne doit pas faire retomber tous les autres à
 * « pas jumelé », ce qui viderait la puce « Bibliothèque » sans rien dire.
 */
import { cleJumelage } from './cleJumelage';

/** Un favori de service, dans la forme que `versPiste` donne à l'écran. */
export interface FavoriDeService {
  id?: number | null;
  title?: string | null;
  artist_name?: string | null;
  source?: string | null;
  source_id?: string | null;
}

/** Ce qu'une recherche de bibliothèque rend, réduit à ce qu'on en lit. */
export interface ResultatRecherche {
  tracks?: Array<{ title?: string | null; artist_name?: string | null }> | null;
}

/**
 * La limite demandée à `library/search`.
 *
 * La recherche est une SOUS-CHAÎNE : « Caroline » ramène tout ce qui contient
 * le mot. Le jumeau exact peut donc se trouver loin dans la liste, et une
 * limite basse le manquerait en silence — un faux « pas jumelé », c'est-à-dire
 * le bogue d'origine qui revient par une autre porte.
 */
export const LIMITE_RECHERCHE = 200;

/**
 * Les clés de jumelage des favoris de service qui ont AU MOINS une piste
 * locale de même titre et même artiste.
 *
 * `chercher` reçoit le titre à chercher et rend ce que la bibliothèque trouve.
 * Les favoris SANS titre sont écartés d'emblée : ils ne peuvent rapprocher
 * personne, et le serveur les écarte aussi (`sf9.title IS NOT NULL`).
 */
export async function clesAvecJumeauLocal(
  favoris: readonly FavoriDeService[],
  chercher: (q: string) => Promise<ResultatRecherche | null | undefined>,
): Promise<Set<string>> {
  // Un seul appel par titre distinct, et on retient les clés attendues pour
  // chaque titre : deux services peuvent aimer le même morceau, et deux
  // artistes différents peuvent avoir un titre homonyme.
  const parTitre = new Map<string, Set<string>>();
  for (const f of favoris) {
    // Seuls les objets de SERVICE sont concernés : une piste de la
    // bibliothèque porte déjà un `id` et est déjà rangée sous « Bibliothèque ».
    if (f?.id != null) continue;
    const titre = (f?.title ?? '').trim();
    if (!titre) continue;
    const attendues = parTitre.get(titre) ?? new Set<string>();
    attendues.add(cleJumelage(titre, f?.artist_name));
    parTitre.set(titre, attendues);
  }

  const trouvees = new Set<string>();
  await Promise.all(
    [...parTitre].map(async ([titre, attendues]) => {
      let res: ResultatRecherche | null | undefined;
      try {
        res = await chercher(titre);
      } catch {
        return; // ce titre, tant pis : les autres continuent.
      }
      for (const t of res?.tracks ?? []) {
        const cle = cleJumelage(t?.title, t?.artist_name);
        if (attendues.has(cle)) trouvees.add(cle);
      }
    }),
  );
  return trouvees;
}
