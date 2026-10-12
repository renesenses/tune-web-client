/**
 * La phrase qui dit POURQUOI une suggestion de l'accueil est là
 * (renesenses/tune-web-client#916, FabienM, fil forum 1527).
 *
 * FabienM, 23/08/2026 : « texte de justification explicite ». Le serveur rend
 * une raison STRUCTURÉE, jamais une phrase — `tune-server/src/routes/
 * accueil_justifie.rs` en tient la table — et c'est ici qu'elle devient du
 * texte, dans la langue de l'interface.
 *
 * ## Seulement ce que le serveur sait
 *
 * Cinq types, ceux que la logique actuelle des rangées justifie VRAIMENT. Un
 * type inconnu (serveur plus récent) ou une raison incomplète ne rend RIEN :
 * mieux vaut une vignette muette qu'une justification inventée. C'est la règle
 * même de la fonction — une recommandation qui dit pourquoi se réfute, une
 * recommandation qui ment ne se réfute pas.
 */

/** Une raison telle que le serveur la rend (`raison` d'un élément). */
export type RaisonSuggestion =
  | { type: 'genre_frequent'; genre: string }
  | { type: 'artiste_favori'; artiste: string }
  | { type: 'artiste_possede'; artiste: string; albums: number }
  | { type: 'autre_version'; titre: string }
  | { type: 'ajout_recent'; ajoute_le?: number | null };

type Traduire = (cle: string) => string;

const texte = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/** La date d'ajout, à la manière de la langue — « 12 oct. 2026 ». */
function dateCourte(secondes: number, langue: string): string | null {
  if (!Number.isFinite(secondes) || secondes <= 0) return null;
  try {
    return new Intl.DateTimeFormat(langue || undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(secondes * 1000));
  } catch {
    return null;
  }
}

/**
 * La phrase d'une raison, ou `null` quand il n'y a rien d'honnête à dire.
 *
 * `traduire` est `$t` ; `langue` l'étiquette de la locale (`fr`, `en`…), pour
 * la date.
 */
export function texteRaison(raison: unknown, traduire: Traduire, langue = 'fr'): string | null {
  if (!raison || typeof raison !== 'object') return null;
  const r = raison as Record<string, unknown>;
  switch (r.type) {
    case 'genre_frequent': {
      const genre = texte(r.genre);
      return genre ? traduire('v2.why.genreFrequent').replace('{genre}', genre) : null;
    }
    case 'artiste_favori': {
      const artiste = texte(r.artiste);
      return artiste ? traduire('v2.why.favoriteArtist').replace('{artiste}', artiste) : null;
    }
    case 'artiste_possede': {
      const artiste = texte(r.artiste);
      const n = typeof r.albums === 'number' && Number.isFinite(r.albums) ? Math.floor(r.albums) : 0;
      if (!artiste || n < 1) return null;
      return traduire(n === 1 ? 'v2.why.ownedArtistOne' : 'v2.why.ownedArtistMany')
        .replace('{artiste}', artiste)
        .replace('{n}', String(n));
    }
    case 'autre_version': {
      const titre = texte(r.titre);
      return titre ? traduire('v2.why.otherVersion').replace('{titre}', titre) : null;
    }
    case 'ajout_recent': {
      const d = typeof r.ajoute_le === 'number' ? dateCourte(r.ajoute_le, langue) : null;
      return d ? traduire('v2.why.addedOn').replace('{date}', d) : traduire('v2.why.addedRecently');
    }
    default:
      return null;
  }
}
