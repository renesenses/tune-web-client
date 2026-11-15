/**
 * PAGE ARTISTE — maquette de Levente (Figma 616:5810 et 616:5811, go de
 * Bertrand le 15/11/2026, rc12).
 *
 * Trois décisions de forme vivent ici, hors du composant, pour être testées
 * sans le monter :
 *
 *  - les ONGLETS de la page (`ongletsArtiste`). La maquette en dessine six
 *    (Overview, Albums, Tracks, Releases, Concerts, Similar Artists). Seuls
 *    ceux qui ont une donnée dans l'API d'aujourd'hui sont montrés : la
 *    discographie et les artistes similaires. « Tracks » est le bloc commun
 *    `BioEtTitresPhares`, qui porte aussi la biographie (pas de découpe en
 *    rc12) ; « Releases » et « Concerts » n'ont pas de route artiste. Un seul
 *    onglet ne fait pas une barre : rien n'est montré.
 *  - les CHIFFRES de l'en-tête (`chiffresEnTete`). La maquette montre années
 *    d'activité, albums, enregistrements et récompenses. Le serveur rend le
 *    compte d'albums de la bibliothèque et les compteurs interprète / écriture
 *    (`credit_counts`, tune-server-rust#7767). Années et récompenses n'ont
 *    aucune donnée : jamais montrées. Un chiffre nul n'est pas montré non plus.
 *  - les PORTRAITS des similaires (`portraitsSimilaires`). `similar_artists`
 *    ne porte qu'un nom et une raison : le portrait vient de la bibliothèque,
 *    sur correspondance EXACTE du nom (même garde que `ouvrirSimilaire`).
 *    Pas trouvé : les initiales, jamais une image approchante.
 */
import { trouverArtisteExact } from './libraryNavigation';

export type OngletArtiste = 'apercu' | 'albums' | 'similaires';

export function ongletsArtiste(o: { discographie: boolean; similaires: number }): OngletArtiste[] {
  const liste: OngletArtiste[] = ['apercu'];
  if (o.discographie) liste.push('albums');
  if (o.similaires > 0) liste.push('similaires');
  return liste.length > 1 ? liste : [];
}

/** L'onglet demandé s'il existe encore, sinon l'aperçu (qui montre tout). */
export function ongletValide(demande: OngletArtiste, liste: readonly OngletArtiste[]): OngletArtiste {
  return liste.includes(demande) ? demande : 'apercu';
}

export type IconeChiffre = 'albums' | 'interprete' | 'ecriture';
export interface ChiffreArtiste {
  cle: string;
  valeur: number;
  libelle: string;
  icone: IconeChiffre;
  /** Le nombre d'albums de ce compteur, sous le chiffre (« 4 albums »). */
  albums?: number;
}

export function chiffresEnTete(
  o: {
    albums?: number | null;
    compteurs?: { performing?: { tracks?: number; albums?: number } | null; writing?: { tracks?: number; albums?: number } | null } | null;
  },
  libelle: (cle: string) => string,
): ChiffreArtiste[] {
  const out: ChiffreArtiste[] = [];
  const pousser = (cle: string, valeur: number | null | undefined, cleLibelle: string, icone: IconeChiffre, albums?: number) => {
    if (typeof valeur === 'number' && Number.isFinite(valeur) && valeur > 0) {
      const c: ChiffreArtiste = { cle, valeur, libelle: libelle(cleLibelle), icone };
      // Le compte d'albums des compteurs « interprète » et « écriture » reste
      // lisible (il l'était dans la ligne d'identité) ; zéro n'apprend rien.
      if (typeof albums === 'number' && albums > 0) c.albums = albums;
      out.push(c);
    }
  };
  pousser('albums', o.albums, 'artist.page.statAlbums', 'albums');
  pousser('interprete', o.compteurs?.performing?.tracks, 'artist.page.statPerforming', 'interprete', o.compteurs?.performing?.albums);
  pousser('ecriture', o.compteurs?.writing?.tracks, 'artist.page.statWriting', 'ecriture', o.compteurs?.writing?.albums);
  return out;
}

export interface PortraitSimilaire {
  id: number;
  image: string | null;
}

type Chercher = (nom: string) => Promise<{ artists?: { id?: number | null; name?: string | null; image_path?: string | null }[] } | null | undefined>;

/**
 * Le portrait de chaque similaire présent dans la bibliothèque, par nom
 * exact. Au plus `max` requêtes ; une requête en échec laisse le nom sans
 * portrait, elle ne fait pas tomber les autres.
 */
export async function portraitsSimilaires(
  noms: readonly string[],
  chercher: Chercher,
  max = 24,
): Promise<Record<string, PortraitSimilaire>> {
  const uniques = [...new Set(noms.filter((n) => !!n?.trim()))].slice(0, max);
  const resultats = await Promise.allSettled(
    uniques.map(async (nom) => {
      const r = await chercher(nom);
      const id = trouverArtisteExact(r?.artists, nom);
      if (id == null) return null;
      const a = r?.artists?.find((x) => x?.id === id);
      return [nom, { id, image: a?.image_path || null }] as const;
    }),
  );
  const out: Record<string, PortraitSimilaire> = {};
  for (const r of resultats) if (r.status === 'fulfilled' && r.value) out[r.value[0]] = r.value[1];
  return out;
}
