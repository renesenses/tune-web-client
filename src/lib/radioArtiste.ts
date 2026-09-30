/**
 * « Radio de l'artiste » — une VRAIE radio, tune-server-rust#5395 (décisions
 * de Bertrand du 29/09/2026).
 *
 * Le bouton ne mélange plus les seuls titres phares d'un service : il demande
 * au serveur `POST /zones/{id}/radio/artist`, qui compose une radio sans fin —
 * l'artiste de départ (environ 20 %) et des artistes proches, pris dans le
 * service de la fiche d'abord, puis dans les autres services connectés et la
 * bibliothèque — et que l'auto-lecture recharge en fin de file.
 *
 * 🔴 Sur un serveur PLUS ANCIEN, la route n'existe pas (404 « not found ») :
 * le bouton retombe sans erreur sur le geste d'avant, le mélange des titres
 * phares (`lireListeAleatoire`). Même repli quand le serveur ne trouve rien
 * (`radio_artiste_vide`) : jouer les titres phares vaut mieux que rien.
 *
 * Les gestes sont INJECTÉS, comme dans `lectureEnMasse` : le test les appelle
 * pour de bon et regarde ce qui part.
 */
export type CorpsRadioArtiste = {
  artist: string;
  /** Le service de la fiche ; `null` pour une fiche de bibliothèque. */
  service: string | null;
  /** L'identifiant de l'artiste SUR ce service ; `null` en bibliothèque. */
  artist_id: string | null;
};

/**
 * Le corps de la requête, depuis la cible de la fiche. `service: null` est le
 * discriminant d'un artiste de bibliothèque (#1232) : son identifiant est
 * LOCAL et ne dit rien à un service, il ne part donc pas.
 */
export function corpsRadioArtiste(
  cible: { service?: string | null; id?: string | number | null } | null,
  nom: string,
): CorpsRadioArtiste | null {
  const artist = (nom ?? '').trim();
  if (!artist) return null;
  const service = cible?.service ?? null;
  return {
    artist,
    service,
    artist_id: service != null && cible?.id != null && String(cible.id) !== '' ? String(cible.id) : null,
  };
}

/**
 * - `radio` : la radio du serveur est partie ;
 * - `repli` : la route manquait ou n'a rien trouvé, les titres phares mélangés
 *   sont partis ;
 * - `serveur-ancien` : la route n'existe pas (serveur plus ancien) ET la fiche
 *   n'a aucun titre phare à mélanger — l'écran doit le dire ;
 * - `rien` : ni radio ni titre phare.
 */
export type IssueRadio = 'radio' | 'repli' | 'serveur-ancien' | 'rien';

/**
 * `radio` rend la zone quand la radio est partie, `'absente'` quand la route
 * n'existe pas (serveur plus ancien), `'vide'` quand le serveur n'a trouvé
 * aucun titre ; `repli` joue l'ancien mélange et rend le nombre de titres
 * partis.
 */
export async function lancerRadioArtiste(
  corps: CorpsRadioArtiste | null,
  gestes: {
    radio: (corps: CorpsRadioArtiste) => Promise<unknown>;
    repli: () => Promise<number>;
  },
): Promise<IssueRadio> {
  let refus: unknown = null;
  if (corps) {
    const rep = await gestes.radio(corps);
    if (rep && typeof rep === 'object') return 'radio';
    refus = rep;
  }
  if (await gestes.repli()) return 'repli';
  return refus === 'absente' ? 'serveur-ancien' : 'rien';
}
