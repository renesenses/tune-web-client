/**
 * L'historique en DEUX niveaux : l'objet qu'on a lancé, puis ses titres.
 *
 * ## 🔴 `renesenses/tune-web-client#904` et `#903`
 *
 * FabienM, fil forum 1649 : « afficher dans la rubrique Historique l'objet sur
 * lequel on a cliqué sur Jouer en 1er niveau [...] et permettre d'ouvrir
 * l'élément pour afficher les titres déjà joués de l'objet dans l'ordre de
 * lecture dans un second niveau ».
 *
 * Les deux fiches ont été ouvertes séparément — le niveau 1 dans #904, le
 * tiroir dans #903. **Elles ne se livrent pas séparément** : un niveau 1 seul
 * remplacerait N lignes de titres par une ligne d'objet, sans rien pour les
 * rouvrir. L'écran y perdrait de l'information. Le regroupement et le tiroir
 * sont une seule pièce, et ce module la porte.
 *
 * ## Ce que le serveur donne vraiment — MESURÉ, pas supposé
 *
 * `GET /library/history` sert `context_type`, `context_id` et
 * `context_position` depuis la v0.9.131. Relevé sur les 879 ecoutes de la .18
 * le 12/09/2026 :
 *
 * | `context_type` | part |
 * |---|---|
 * | absent (`null`) | 65,8 % |
 * | `album`    | 16,5 % |
 * | `playlist` |  9,8 % |
 * | `track`    |  8,0 % |
 *
 * Deux consequences que la fiche n'avait pas :
 *
 *  1. **Deux ecoutes sur trois n'ont aucun contexte.** Le regroupement ne
 *     pouvait donc jamais etre la seule forme de l'ecran : il FAUT que les
 *     lignes sans contexte restent des lignes plates. C'est d'ailleurs ce que
 *     montre le schema de FabienM, ou des titres nus voisinent avec des objets
 *     depliables.
 *  2. **`context_position` est absent pour 67 % des ecoutes.** « Dans l'ordre
 *     de lecture » ne peut donc pas s'appuyer dessus seul. On trie par
 *     position quand elle est la, par date d'ecoute sinon.
 *
 * Et `context_id` prend QUATRE formes dans les memes donnees : un identifiant
 * numerique de bibliotheque (28,2 %), un identifiant de service alphanumerique
 * (4,7 %), `null` (65,8 %) — et, pour douze ecoutes, une URL entiere
 * (`http://192.168.1.54:8888/api/v1/library/tracks/14/audio`). On ne
 * l'interprete donc jamais : il ne sert qu'a distinguer deux objets l'un de
 * l'autre.
 */

/** Ce qu'une ecoute porte de son contexte. Tout est facultatif. */
export interface ContexteEcoute {
  type?: string | null;
  id?: string | number | null;
  position?: number | null;
}

/** Le minimum qu'une entree d'historique doit offrir a ce module. */
export interface EntreeDatee {
  playedAt: string;
  contexte?: ContexteEcoute | null;
}

/** Une ligne de premier niveau : un titre nu, ou un objet et ses titres. */
export type NiveauUn<E> =
  | { genre: 'titre'; entree: E; quand: string }
  | { genre: 'objet'; type: string; id: string; cle: string; entrees: E[]; quand: string };

/**
 * Les types de contexte qui MERITENT un regroupement.
 *
 * `track` n'en fait pas partie, et ce n'est pas un oubli : lancer un titre
 * seul produit `context_type = 'track'`, et l'objet serait alors le titre
 * lui-meme — un tiroir a un element, qui redit sa propre ligne.
 */
const REGROUPABLES = new Set([
  'album', 'playlist', 'artist', 'artiste', 'label', 'genre', 'collection',
]);

/** Regroupable seulement si le type ET l'identifiant sont la. */
export function estRegroupable(c: ContexteEcoute | null | undefined): boolean {
  if (!c || c.type == null || c.id == null) return false;
  if (!REGROUPABLES.has(String(c.type).toLowerCase())) return false;
  return String(c.id).length > 0;
}

/**
 * La cle d'un objet. `context_id` n'est jamais interprete, seulement compare —
 * il peut etre un entier, un identifiant de service, ou une URL entiere.
 */
export function cleDObjet(c: ContexteEcoute): string {
  return JSON.stringify([String(c.type).toLowerCase(), String(c.id)]);
}

/**
 * Range les ecoutes en niveaux de premier rang, dans l'ordre ou elles
 * arrivent — le plus recent d'abord, comme le sert le serveur.
 *
 * Un objet apparait a la place de sa PREMIERE ecoute, et emporte toutes les
 * autres ecoutes du meme objet. Les ecoutes sans contexte restent des lignes
 * plates, a leur place.
 */
export function regrouperParContexte<E extends EntreeDatee>(entrees: readonly E[]): NiveauUn<E>[] {
  const niveaux: NiveauUn<E>[] = [];
  const index = new Map<string, Extract<NiveauUn<E>, { genre: 'objet' }>>();

  for (const e of entrees) {
    const c = e.contexte;
    if (!estRegroupable(c)) {
      niveaux.push({ genre: 'titre', entree: e, quand: e.playedAt });
      continue;
    }
    const cle = cleDObjet(c!);
    const deja = index.get(cle);
    if (deja) {
      deja.entrees.push(e);
      continue;
    }
    const objet = {
      genre: 'objet' as const,
      type: String(c!.type).toLowerCase(),
      id: String(c!.id),
      cle,
      entrees: [e],
      quand: e.playedAt,
    };
    index.set(cle, objet);
    niveaux.push(objet);
  }

  for (const n of niveaux) {
    if (n.genre === 'objet') n.entrees = ordonnerDansLObjet(n.entrees);
  }
  return niveaux;
}

/**
 * L'ordre de lecture d'un objet : par position si elle existe POUR TOUTES,
 * sinon par date d'ecoute. Jamais un melange des deux, qui donnerait un ordre
 * arbitraire sur les 67 % d'ecoutes sans position.
 */
export function ordonnerDansLObjet<E extends EntreeDatee>(entrees: readonly E[]): E[] {
  const toutesPositionnees = entrees.every((e) => e.contexte?.position != null);
  const copie = [...entrees];
  if (toutesPositionnees) {
    copie.sort((a, b) => (a.contexte!.position as number) - (b.contexte!.position as number));
  } else {
    copie.sort((a, b) => Date.parse(a.playedAt) - Date.parse(b.playedAt));
  }
  return copie;
}

/**
 * Une tranche de l'ecran : une SUITE de titres nus, ou un objet.
 *
 * Le regroupement donne des niveaux un par un, mais l'ecran rend ses titres
 * dans un TABLEAU partage (`ListePistesV2`). Emettre un tableau par titre nu
 * repeterait son en-tete a chaque ligne. On recolle donc les titres nus
 * consecutifs en une seule tranche, et les objets restent seuls.
 */
export type Tranche<E> =
  | { genre: 'titres'; entrees: E[] }
  | { genre: 'objet'; type: string; id: string; cle: string; entrees: E[]; quand: string };

export function enTranches<E extends EntreeDatee>(niveaux: readonly NiveauUn<E>[]): Tranche<E>[] {
  const tranches: Tranche<E>[] = [];
  for (const n of niveaux) {
    if (n.genre === 'objet') {
      tranches.push({ genre: 'objet', type: n.type, id: n.id, cle: n.cle, entrees: n.entrees, quand: n.quand });
      continue;
    }
    const derniere = tranches[tranches.length - 1];
    if (derniere && derniere.genre === 'titres') derniere.entrees.push(n.entree);
    else tranches.push({ genre: 'titres', entrees: [n.entree] });
  }
  return tranches;
}

/**
 * Comment NOMMER l'objet, alors que le serveur ne le nomme pas.
 *
 * 🔴 Mesure du 12/09/2026 : `GET /library/history` sert seize champs —
 * `album_id, album_title, artist_name, context_id, context_position,
 * context_type, cover_url, duration_ms, id, listened_at, profile_id, source,
 * source_id, title, track_id, zone_id`. **Aucun nom de contexte.** Le client
 * sait donc qu'une playlist a ete lancee, et son identifiant, mais pas son
 * titre.
 *
 * Ce qu'on peut deduire des ecoutes elles-memes :
 *
 *  - `album`  → `album_title` de ses pistes, qu'elles portent toutes ;
 *  - `artist` → `artist_name`, meme raison.
 *
 * Pour une `playlist` — 9,8 % des ecoutes — il n'y a RIEN a deduire : aucune
 * piste ne porte le nom de la liste dont elle vient. On rend alors `null`, et
 * c'est a l'ecran de poser le libelle du type. Inventer un nom serait pire que
 * de n'en pas mettre.
 */
export function nomDObjet(
  type: string,
  entrees: readonly { track?: { album_title?: string | null; artist_name?: string | null } }[],
): string | null {
  const champ = type === 'album' ? 'album_title' : (type === 'artist' || type === 'artiste') ? 'artist_name' : null;
  if (!champ) return null;
  for (const e of entrees) {
    const v = e.track?.[champ as 'album_title' | 'artist_name'];
    if (v != null && String(v).trim() !== '') return String(v);
  }
  return null;
}
