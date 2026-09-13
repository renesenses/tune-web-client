/**
 * Ouvrir la fiche d'un artiste de SERVICE à partir de son seul nom — et dire
 * ce qui se passe quand on n'y arrive pas.
 *
 * ## Le signalement
 *
 * **Sandro**, fil forum 1769, 12/09/2026 à 15 h 09, nouvelle interface,
 * v0.9.147 :
 *
 *   « Ce n'est pas un problème d'affichage des boutons, mais bien un bug de
 *     navigation dans la nouvelle interface (?v2) qui m'empêche purement et
 *     simplement d'atteindre la fameuse "Fiche Artiste". […] au lieu de
 *     m'amener sur la vraie Fiche Artiste, l'interface tourne en boucle et me
 *     renvoie simplement sur la grille des résultats de recherche du début. »
 *
 * Et le coût réel, dans ses mots : « Il m'est donc physiquement impossible
 * d'atteindre l'écran où vivent ces nouveaux boutons » — Radio et Best of,
 * annoncés dans les notes de la 0.9.147.
 *
 * ## Le repli existait, il était MUET
 *
 * Une piste de service ne porte pas l'identifiant de son artiste : seul son
 * nom voyage avec elle. On le résout par la recherche fédérée. Quand ça
 * échoue, la coquille revenait à la recherche — geste délibéré, un écran vide
 * serait pire — mais **sans un mot**. Rien ne distinguait « je t'emmène à la
 * recherche faute d'avoir trouvé l'artiste » d'un clic sans effet. Sandro a
 * conclu, très logiquement, que l'interface tournait en boucle.
 *
 * ## 🔴 Ce qui n'est PAS établi, et que ce module rend mesurable
 *
 * Son cas ne se reproduit pas. Mesuré sur la .18 en v0.9.147, avec la requête
 * exacte que la coquille émet :
 *
 *     GET /search?q=Leprous&limit=5&sources=qobuz
 *       → 5 artistes, dont id='610403' name='Leprous' (exact)
 *
 * L'appariement RÉUSSIT. Et `apparierArtiste` retombe sur le premier candidat
 * à défaut d'égalité exacte : il ne rend `null` que sur une liste vide, ou un
 * candidat sans identifiant. Il ne reste donc que deux façons d'atterrir sur
 * la recherche, et elles n'ont rien à voir l'une avec l'autre :
 *
 *   • `injoignable` — la recherche a LEVÉ. Session Qobuz expirée, délai
 *     dépassé, réseau. Le `catch` était silencieux : c'est la seule branche
 *     capable de produire le symptôme de Sandro sans qu'aucune mesure ne
 *     l'explique.
 *   • `introuvable` — elle a répondu, et le service ne connaît pas ce nom.
 *
 * Les nommer sépare « ton service ne répond pas » de « cet artiste n'existe
 * pas chez lui ». Le premier se règle en se reconnectant ; le second, jamais.
 *
 * ## Pourquoi un module et pas trois lignes dans la coquille
 *
 * Une garde écrite contre `ShellV2` ne pourrait que lire son texte, et un
 * texte présent ne prouve pas qu'il s'exécute. Ici la recherche est INJECTÉE :
 * la garde la fournit, la fait lever ou rendre une liste vide, et regarde ce
 * qui sort.
 */

/** Un artiste tel qu'un service le rend : identifiant sous l'un ou l'autre nom. */
export interface CandidatArtiste {
  id?: unknown;
  source_id?: unknown;
  name: string;
}

/** Pourquoi on retombe sur la recherche. Jamais « une erreur est survenue ». */
export type RaisonRepli = 'introuvable' | 'injoignable';

export type Issue =
  | { type: 'fiche'; id: string }
  | { type: 'repli'; raison: RaisonRepli; erreur?: unknown };

/**
 * La recherche, injectée. Elle rend les artistes que le service propose pour
 * ce nom, dans l'ordre où il les donne — ou LÈVE.
 */
export type ChercherArtistes = (nom: string, service: string) => Promise<CandidatArtiste[]>;

/** Le message à montrer, par raison. Une clé de traduction, jamais un texte. */
export const CLES_REPLI: Record<RaisonRepli, string> = {
  introuvable: 'v2.nav.artisteIntrouvable',
  injoignable: 'v2.nav.serviceInjoignable',
};

/**
 * Le nom EXACT (casse ignorée) prime ; à défaut, le premier — le service
 * classe ses résultats par pertinence.
 *
 * ⚠️ Volontairement identique à `apparierArtiste` d'`albumsArtisteStreaming`,
 * qui sert la fiche artiste locale. Les deux écrans doivent montrer le même
 * artiste pour le même nom ; c'est cette fonction-là qui fait foi, et ce
 * module la réemploie plutôt que d'en écrire une seconde.
 */
export function choisirArtiste(
  candidats: CandidatArtiste[] | null | undefined,
  nom: string,
): string | null {
  const liste = candidats ?? [];
  if (!liste.length) return null;
  const cible = nom.toLowerCase();
  const choisi = liste.find((a) => (a?.name ?? '').toLowerCase() === cible) ?? liste[0];
  const id = choisi?.id ?? choisi?.source_id ?? null;
  return id == null || id === '' ? null : String(id);
}

/**
 * Résoudre, ou dire pourquoi on n'a pas pu.
 *
 * 🔴 Un nom vide est `introuvable`, pas `injoignable` : on n'interroge pas le
 * service pour rien, et accuser sa connexion serait un mensonge.
 */
export async function resoudreArtisteDeService(
  c: { service: string; nom: string },
  chercher: ChercherArtistes,
): Promise<Issue> {
  const nom = (c?.nom ?? '').trim();
  if (!nom || !c?.service) return { type: 'repli', raison: 'introuvable' };
  let candidats: CandidatArtiste[];
  try {
    candidats = await chercher(nom, c.service);
  } catch (e) {
    return { type: 'repli', raison: 'injoignable', erreur: e };
  }
  const id = choisirArtiste(candidats, nom);
  return id ? { type: 'fiche', id } : { type: 'repli', raison: 'introuvable' };
}

/**
 * La phrase du repli, montée depuis sa clé.
 *
 * Elle NOMME l'artiste et le service : « "Leprous" est introuvable chez
 * qobuz » se comprend sans rien savoir du mécanisme, là où « une erreur est
 * survenue » n'apprend rien et laisse croire à une panne générale.
 */
export function messageRepli(
  raison: RaisonRepli,
  c: { service: string; nom: string },
  traduire: (cle: string) => string,
): string {
  return traduire(CLES_REPLI[raison])
    .replace('{nom}', c.nom ?? '')
    .replace('{service}', c.service ?? '');
}
