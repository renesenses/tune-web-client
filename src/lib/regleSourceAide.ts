/**
 * Ce qu'une règle « source » fait vraiment, dit à l'écran — #4473, #1231.
 *
 * Deux valeurs par service, et elles ne veulent pas dire la même chose :
 *
 * * `qobuz` — les **favoris** du profil chez ce service. Gratuit, hors ligne.
 *   Sans cette phrase, « 0 résultat » se lit comme une panne alors que c'est
 *   souvent la bonne réponse (playlist `Test Qobuz Coltrane` de Bertrand : ses
 *   21 favoris de pistes Qobuz ne contiennent aucun Coltrane).
 * * `catalogue:qobuz` — le **catalogue** du service. Aucun service n'énumère
 *   son catalogue : il faut donc une règle `artiste` ou `album` qui dise QUOI
 *   chercher, sinon le serveur refuse.
 *
 * 🔴 L'écran dit ce qui manque AVANT d'enregistrer. Le serveur refuse déjà,
 * mais un refus au moment de consulter la collection arrive trop tard et se
 * lit comme une panne.
 *
 * Depuis le second volet de #4473, les PLAYLISTS intelligentes vont elles
 * aussi au catalogue : ce module sert les deux éditeurs, et lit les règles
 * selon l'objet édité (voir [`ObjetEdite`]).
 */
import { serviceDuCatalogue } from './sourcesRegle';

/** Une règle telle que l'éditeur la tient. */
export interface RegleLue {
  field?: string;
  operator?: string;
  op?: string;
  value?: string | null;
}

function estEgalite(r: RegleLue): boolean {
  const o = (r.operator ?? r.op ?? '').toLowerCase();
  return o === '=' || o === 'eq' || o === 'equals';
}

/**
 * Ce que l'éditeur ÉDITE : une collection porte sur des albums, une playlist
 * sur des pistes.
 *
 * 🔴 Le champ `title` ne veut pas dire la même chose des deux côtés, et c'est
 * la seule raison de ce paramètre. `CHAMPS` de `smartRegles.ts` nomme le titre
 * d'ALBUM `title` dans l'éditeur de collections (libellé
 * `smartCollection.fieldAlbumTitle`) ; dans une playlist, `title` est le titre
 * de la PISTE (`regles_sql::colonne_piste` → `t.title`). Même découpe que le
 * serveur (`tune-smart-http/src/catalogue.rs`, `Objet`).
 */
export type ObjetEdite = 'album' | 'piste';

/** Les champs qui nomment un titre d'ALBUM, selon l'objet édité. */
const CHAMPS_ALBUM: Record<ObjetEdite, string[]> = {
  album: ['album', 'album_title', 'title'],
  piste: ['album', 'album_title'],
};

/**
 * Les règles nomment-elles une cible que le service sait chercher ?
 *
 * Seule l'ÉGALITÉ compte : « artiste contient Col » n'est pas une requête
 * qu'un service sait honorer. Même règle que le serveur
 * (`tune-smart-http/src/catalogue.rs`), et c'est volontaire — deux lectures
 * divergentes feraient accepter ici ce que le moteur refuse là-bas.
 *
 * 🔴 Un titre de PISTE n'est jamais une cible : aucun service ne cherche « la
 * piste intitulée X » dans tout son catalogue. Il trie ce que le service rend
 * pour l'artiste ou l'album, côté serveur.
 */
export function cibleDuCatalogue(regles: RegleLue[], objet: ObjetEdite = 'album'): string | null {
  const nomme = (champs: string[]) =>
    regles.find(
      (r) =>
        champs.includes((r.field ?? '').toLowerCase()) &&
        estEgalite(r) &&
        (r.value ?? '').trim() !== '',
    )?.value ?? null;
  return nomme(['artist', 'artist_name']) ?? nomme(CHAMPS_ALBUM[objet]);
}

/** Une règle `catalogue:` sans cible : ce qu'il manque, ou `null` si tout va. */
export function manqueUneCible(regles: RegleLue[], objet: ObjetEdite = 'album'): string | null {
  const demande = regles.find(
    (r) => (r.field ?? '').toLowerCase() === 'source' && serviceDuCatalogue(r.value ?? ''),
  );
  if (!demande) return null;
  if (cibleDuCatalogue(regles, objet)) return null;
  return serviceDuCatalogue(demande.value ?? '');
}
