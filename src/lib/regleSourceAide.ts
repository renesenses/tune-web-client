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
 * Les règles nomment-elles une cible que le service sait chercher ?
 *
 * Seule l'ÉGALITÉ compte : « artiste contient Col » n'est pas une requête
 * qu'un service sait honorer. Même règle que le serveur
 * (`tune-smart-http/src/catalogue.rs`), et c'est volontaire — deux lectures
 * divergentes feraient accepter ici ce que le moteur refuse là-bas.
 *
 * 🔴 `title` compte pour un titre d'ALBUM. Ce module ne sert que l'éditeur de
 * COLLECTIONS, dont les règles portent sur des albums : `CHAMPS` de
 * `smartRegles.ts` y nomme le titre d'album `title`, pas `album`. Le chemin
 * des PISTES n'offre pas le catalogue (voir `sourcesDisponibles`) — sans quoi
 * `title` y désignerait le titre de la piste, et il faudrait passer l'objet.
 */
export function cibleDuCatalogue(regles: RegleLue[]): string | null {
  const nomme = (champs: string[]) =>
    regles.find(
      (r) =>
        champs.includes((r.field ?? '').toLowerCase()) &&
        estEgalite(r) &&
        (r.value ?? '').trim() !== '',
    )?.value ?? null;
  return nomme(['artist', 'artist_name']) ?? nomme(['album', 'album_title', 'title']);
}

/** Une règle `catalogue:` sans cible : ce qu'il manque, ou `null` si tout va. */
export function manqueUneCible(regles: RegleLue[]): string | null {
  const demande = regles.find(
    (r) => (r.field ?? '').toLowerCase() === 'source' && serviceDuCatalogue(r.value ?? ''),
  );
  if (!demande) return null;
  if (cibleDuCatalogue(regles)) return null;
  return serviceDuCatalogue(demande.value ?? '');
}
