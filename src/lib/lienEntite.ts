/**
 * LIENS HYPERTEXTE — le geste commun derrière tout nom d'entité (web#2770,
 * chantier rc12, go de Bertrand du 10/11/2026).
 *
 * « Tout nom d'entité affiché (artiste, album, label, compositeur, chef,
 * ensemble, œuvre, genre, année, playlist, radio, personne créditée) est un
 * lien vers sa page, partout, avec le même comportement. »
 *
 * Les gestes existaient déjà, mais dispersés : `ouvrirArtisteDepuis`
 * (artiste), `ouvertureAlbumDePiste` (album d'une piste),
 * `ouvrirLabelDeService` / `ouvrirLabelDansLaBibliotheque` (label), l'événement
 * `tune:v2-facette` (genre, année). Chaque écran en recopiait un, ou rendait
 * le nom en texte brut — l'inventaire du 10/11 compte 30 ❌ et 20 ⚠️ sur le
 * web. Ce module les RÉUNIT : un écran décrit l'entité, le module rend les
 * PARTIES à dessiner — un texte et, quand une cible est connue, le geste qui
 * l'ouvre. `LienEntite.svelte` les dessine ; c'est le seul composant qui le
 * fasse, et `gardeLiensEntites2770.test.ts` interdit le retour des noms en
 * texte brut dans les écrans convertis.
 *
 * Règles communes, d'après l'issue :
 * - clic = NAVIGATION, jamais lecture (la lecture reste sur ▶) ;
 * - plusieurs artistes (« A & B », « A, B », « feat. C ») : UN lien PAR artiste ;
 * - pas de lien mort : sans cible connue, `ouvrir` vaut `null` et le nom reste
 *   un texte simple, sans soulignement.
 *
 * ## Le découpage multi-artistes, et le piège documenté de `&`
 *
 * `nomsDeRechercheArtiste` (lib/libraryNavigation) refuse de couper sur `&`,
 * et il a raison : « Daryl Hall & John Oates », « Simon & Garfunkel » sont des
 * noms de GROUPE, entiers dans la bibliothèque. L'issue demande pourtant un
 * lien par artiste. Les deux se concilient par les CANDIDATS : chaque partie
 * cherche d'abord son propre nom, puis le nom ENTIER. « Simon » ne désigne
 * personne, mais « Simon & Garfunkel » existe : le lien « Simon » ouvre le
 * groupe. Et quand l'entité porte déjà un identifiant, il va à la première
 * partie — la tête est l'artiste principal, comme pour `feat.`.
 */
import { get } from 'svelte/store';
import { activeView, pendingLibraryAlbum, pendingLibraryYear, type View } from './stores/navigation';
import { libraryTab } from './stores/library';
import { ouvrirArtisteDepuis, ouvrirArtisteDeServiceParNom } from './ouvrirArtisteDepuis';
import { ouvertureAlbumDePiste } from './lienAlbumDePiste';
import { ouvrirLabelDeService } from './labelDeService';
import { ouvrirFacetteDansLaBibliotheque } from './artistesDuLabel';
import { estDeBibliotheque } from './provenanceBibliotheque';
import { destinationArtiste } from './routageArtiste';

export type TypeEntite =
  | 'artiste'
  | 'album'
  | 'label'
  | 'genre'
  | 'annee'
  | 'playlist'
  | 'radio'
  | 'personne'
  | 'oeuvre';

/**
 * Ce qu'un écran dit d'une entité. Le TEXTE est `nom` ; la CIBLE se déduit du
 * type et des champs qui l'accompagnent — ou vient de l'écran (`ouvrir`),
 * quand la page est un calque tenu par l'écran lui-même (fiche de station,
 * calque d'album de la Bibliothèque).
 */
export interface Entite {
  type: TypeEntite;
  /** Le nom affiché. Vide : rien n'est rendu. */
  nom?: string | null;
  /** La cible fournie par l'écran. Prime sur tout le reste. `null` = texte.
   *  Le retour est ignoré : `() => (enFiche = r)` est un geste valable. */
  ouvrir?: (() => unknown) | null;
  /** `artiste` / `personne` : l'objet que lit `ouvrirArtisteDepuis`
   *  (`{id, name, source}`, `{name, source, source_id}`, `{name}`…). */
  artiste?: any;
  /** `album` : la piste dont on ouvre l'album (`ouvertureAlbumDePiste`). */
  piste?: any;
  /** `album` : un album de la bibliothèque, par son identifiant. */
  albumId?: number | null;
  /** `annee` : l'année, quand `nom` n'est pas le nombre lui-même. */
  annee?: number | null;
  /** `label` : l'identifiant chez un service, quand le label en a un. */
  label?: { service?: string | null; id?: string | null } | null;
  /** `artiste` : couper « A & B » en deux liens. Par défaut oui. */
  multi?: boolean;
}

/** Une partie à dessiner : un texte, et son geste — ou `null` (texte simple). */
export interface Partie {
  texte: string;
  ouvrir: (() => unknown) | null;
  /** Un séparateur (« & », « , », « feat. ») : jamais un lien. */
  separateur?: boolean;
}

/**
 * Les séparateurs d'artistes. Un MOT isolé pour `feat` / `ft` / `featuring`
 * (sinon « Software » se ferait couper) ; `&`, `,` et `;` entourés ou non
 * d'espaces ; `/` SEULEMENT entouré d'espaces (« AC/DC » est un nom).
 * ` with ` et ` x ` sont écartés : « Diving With Andy » est un groupe, et
 * « x » coupe trop de noms. Une partie homonyme d'un artiste de la
 * bibliothèque (un « Wind » seul devant « Earth, Wind & Fire ») passerait
 * avant le groupe : c'est le prix d'un lien par artiste, documenté ici.
 */
const SEPARATEUR = /(\s*[,;&]\s*|\s+\/\s+|\s+[([]?(?:feat|ft|featuring)\.?\s+)/i;

/**
 * « Daft Punk feat. Pharrell Williams » → [« Daft Punk », « Pharrell Williams »],
 * avec les séparateurs entre les deux. Un nom qu'on ne sait pas couper
 * proprement (une partie vide) reste entier.
 */
export function decouperArtistes(nom: string | null | undefined): { noms: string[]; separateurs: string[] } {
  const entier = (nom ?? '').trim();
  if (!entier) return { noms: [], separateurs: [] };
  const morceaux = entier.split(SEPARATEUR);
  if (morceaux.length < 3) return { noms: [entier], separateurs: [] };
  const noms: string[] = [];
  const separateurs: string[] = [];
  for (let i = 0; i < morceaux.length; i++) {
    const m = morceaux[i] ?? '';
    if (i % 2 === 0) noms.push(m.replace(/[)\]]\s*$/, '').trim());
    else separateurs.push(m);
  }
  if (noms.some((n) => !n)) return { noms: [entier], separateurs: [] };
  return { noms, separateurs };
}

/**
 * L'artiste d'une PISTE ÉCOUTÉE (lecture en cours, file, barre de lecture),
 * prêt pour `ouvrirArtisteDepuis` — la décision de `destinationArtiste`,
 * traduite dans la forme que lit la page artiste commune. `null` sans nom ni
 * identifiant.
 */
export function artisteDePisteEcoutee(p: any): any | null {
  const d = destinationArtiste(p);
  if (!d) return null;
  const nom = p?.artist_name ?? null;
  switch (d.type) {
    case 'artiste':
      return { id: d.artistId, name: nom, source: 'local' };
    case 'artiste-service':
      return { name: d.nom || nom, source: d.service, source_id: d.id };
    case 'artiste-par-nom':
      return { name: d.nom };
    case 'recherche':
      return d.source && d.source !== 'local' && d.source !== 'radio'
        ? { name: d.requete, service_ecoute: d.source }
        : { name: d.requete };
  }
}

/**
 * L'artiste d'un ALBUM (vignette, ligne, carte), prêt pour
 * `ouvrirArtisteDepuis`. Un album de la bibliothèque porte `artist_id` ; un
 * album de service porte `artist_id` chez lui et `source` le dit ; sans
 * identifiant il reste le nom, cherché chez le service d'où vient l'album.
 */
export function artisteDAlbum(a: any): any | null {
  const nom = typeof a?.artist_name === 'string' ? a.artist_name.trim() : '';
  const id = a?.artist_id ?? null;
  const src = typeof a?.source === 'string' && a.source.trim() ? a.source.trim() : null;
  const local = !src || estDeBibliotheque({ source: src });
  if (local && typeof id === 'number' && Number.isFinite(id)) return { id, name: nom, source: 'local' };
  if (!nom) return null;
  if (!local && id != null && String(id).trim()) return { name: nom, source: src, source_id: String(id).trim() };
  if (!local && src !== 'radio') return { name: nom, service_ecoute: src };
  return { name: nom };
}

/** Un artiste porte-t-il de quoi ouvrir une fiche sans chercher par le nom ? */
function aUnIdentifiant(a: any): boolean {
  if (!a) return false;
  if (a.id != null && estDeBibliotheque(a)) return true;
  return !!(a.source && a.source_id);
}

function partiesDArtiste(e: Entite, depuis: View): Partie[] {
  const a = e.artiste ?? (e.nom ? { name: e.nom } : null);
  const nom = (e.nom ?? a?.name ?? '').toString().trim();
  if (!a || (!nom && a.id == null)) return [];
  if (e.ouvrir !== undefined) return [{ texte: nom, ouvrir: e.ouvrir }];
  const { noms, separateurs } = e.multi === false ? { noms: [nom], separateurs: [] } : decouperArtistes(nom);
  if (noms.length <= 1) return [{ texte: nom, ouvrir: () => ouvrirArtisteDepuis({ ...a, name: nom }, depuis) }];
  const parties: Partie[] = [];
  noms.forEach((n, i) => {
    if (i > 0) parties.push({ texte: separateurs[i - 1] ?? ' ', ouvrir: null, separateur: true });
    parties.push({ texte: n, ouvrir: gesteDePartie(a, n, nom, i === 0, depuis) });
  });
  return parties;
}

/** Le geste d'UNE partie d'un nom composé — voir l'en-tête. */
function gesteDePartie(a: any, partie: string, entier: string, tete: boolean, depuis: View): () => Promise<void> {
  // L'identifiant connu désigne l'entité ENTIÈRE : il va à la tête.
  if (tete && aUnIdentifiant(a)) return () => ouvrirArtisteDepuis({ ...a, name: entier }, depuis);
  const service = typeof a.source === 'string' && !estDeBibliotheque(a) && a.source !== 'radio' ? a.source : null;
  // Chez un service, par le nom de la partie ; le repli de #956 PARLE s'il ne
  // trouve rien.
  if (service && a.source_id) return () => ouvrirArtisteDeServiceParNom({ service, nom: partie }, depuis);
  // Bibliothèque : la partie, puis le nom entier (le groupe), en égalité EXACTE.
  return () =>
    ouvrirArtisteDepuis(
      { name: partie, candidats: [partie, entier], ...(a.service_ecoute ? { service_ecoute: a.service_ecoute } : {}) },
      depuis,
    );
}

/** Ouvre un album de la bibliothèque par son identifiant. */
export function ouvrirAlbumLocal(id: number): void {
  pendingLibraryAlbum.set(id);
  activeView.set('library');
}

/** Ouvre la Bibliothèque sur une année (`pendingLibraryYear`, le contrat de `LibraryV2`). */
export function ouvrirAnnee(annee: number): void {
  pendingLibraryYear.set(annee);
  libraryTab.set('albums');
  activeView.set('library');
}

/**
 * Les parties à dessiner pour une entité. `depuis` : l'écran d'où part le
 * geste, pour que le Retour y ramène (`vueDeRetour`).
 */
export function partiesDEntite(e: Entite | null | undefined, depuis: View = get(activeView)): Partie[] {
  if (!e) return [];
  if (e.type === 'artiste') return partiesDArtiste(e, depuis);
  const nom = (e.nom ?? (e.type === 'annee' && e.annee != null ? String(e.annee) : '')).toString().trim();
  if (!nom) return [];
  if (e.ouvrir !== undefined) return [{ texte: nom, ouvrir: e.ouvrir }];
  let ouvrir: Partie['ouvrir'] = null;
  switch (e.type) {
    case 'personne':
      ouvrir = e.artiste || nom ? () => ouvrirArtisteDepuis(e.artiste ?? { name: nom }, depuis) : null;
      break;
    case 'album': {
      if (typeof e.albumId === 'number' && Number.isInteger(e.albumId) && e.albumId > 0) {
        const id = e.albumId;
        ouvrir = () => ouvrirAlbumLocal(id);
      } else if (e.piste) ouvrir = ouvertureAlbumDePiste(e.piste);
      break;
    }
    case 'label': {
      const svc = e.label?.service?.trim();
      const id = e.label?.id?.trim();
      ouvrir = svc && id
        ? () => ouvrirLabelDeService({ service: svc, id, nom })
        : () => ouvrirFacetteDansLaBibliotheque('labels', nom);
      break;
    }
    case 'genre':
      ouvrir = () => ouvrirFacetteDansLaBibliotheque('genres', nom);
      break;
    case 'annee': {
      const an = e.annee ?? Number(nom);
      if (Number.isInteger(an) && an > 0) ouvrir = () => ouvrirAnnee(an);
      break;
    }
    // Une playlist, une radio, une œuvre n'ont pas (encore) de page commune :
    // l'écran fournit la cible, ou le nom reste un texte.
    case 'playlist':
    case 'radio':
    case 'oeuvre':
      break;
  }
  return [{ texte: nom, ouvrir }];
}
