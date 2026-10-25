/**
 * Tune Circle (rc8) — la scène en DONNÉES : quels nœuds, où, à quelle taille,
 * pour chacune des cinq vues (Monde, Solo, Lien, Réseau, Genres). Fonction
 * pure, sans DOM : le moteur (`moteur.ts`) ne fait que dessiner ce qu'elle dit,
 * et l'écran pose ses boutons d'après les mêmes nœuds.
 *
 * Coordonnées : x, y dans [-1, 1] (unités de scène, centre = 0) ; `sphere`
 * en fraction du demi-côté de la scène ; `avatar` en px ; `cluster` 0..1.
 *
 * Ce que la scène NE montre jamais (contrat rc8) : aucune présence, aucune
 * écoute en direct, aucune photo. Le flux de particules entre deux planètes
 * dit « ce contact partage sa bibliothèque avec moi », rien d'autre.
 */
import { DEG } from './globe';
import { GENRES_MAX, maxConnu, rayonRelatif, tailleGrappe } from './tailles';

export type Vue = 'monde' | 'seul' | 'lien' | 'reseau' | 'genres';
export const VUES: readonly Vue[] = ['monde', 'seul', 'lien', 'reseau', 'genres'];

export interface Lieu {
  label: string;
  country_code?: string | null;
  /** Degrés, déjà arrondis au demi-degré par le cloud. */
  lat: number;
  lon: number;
}

export interface GenreCompte { genre: string; albums: number }

export interface ContactScene {
  id: number;
  nom: string;
  /** `null` : ce contact ne partage pas sa bibliothèque avec moi — taille par défaut. */
  albums: number | null;
  /** Vide sans partage. Au plus {@link GENRES_MAX}. */
  genres: GenreCompte[];
  lieu: Lieu | null;
}

export interface DonneesCercle {
  moi: { nom: string; albums: number | null; genres: GenreCompte[]; lieu: Lieu | null };
  contacts: ContactScene[];
  /** MES cercles nommés (classements privés). */
  cercles: { id: number; nom: string; membres: number[] }[];
  /** Contact au centre de la vue Lien ; `null` = le premier qui partage, sinon le premier. */
  focus: number | null;
  /** Nombre de contacts autour de moi avant la puce « +N » (8 sur mobile, 30 sinon). */
  maxAutour: number;
  /** Nombre de grappes de genres, et de cercles en vue Solo (4 sur mobile). */
  maxGrappes: number;
}

/**
 * `ring` : un de MES cercles, dessiné en ANNEAU (décision du 24/10/2026) —
 * une boucle de sa couleur, nommée sur son trait, qui entoure ses membres et
 * moi. Il n'a pas de planète : le moteur pose son nom sur la boucle.
 */
export type GenreNoeud = 'self' | 'person' | 'genre' | 'ring' | 'pin' | 'more';

export interface NoeudScene {
  id: string;
  kind: GenreNoeud;
  label: string;
  hue: number;
  albums: number | null;
  /** Grappe ou cercle : le nombre de personnes ; « +N » : N. */
  members: number;
  /** Anneau : son cercle, et TOUS ses membres connus (identifiants de contact), pour la vue liste. */
  cercleId?: number;
  membresIds?: number[];
  /** Anneau : les nœuds que la boucle entoure dans SA vue — `self` d'abord, puis les membres visibles. */
  enclos?: string[];
  /** Anneau : son rang dans la vue (la marge grandit avec lui : deux boucles ne se confondent pas). */
  rang?: number;
  /** « +N » : ce qu'il compte (des contacts par défaut, ou des cercles en vue Solo). */
  plusDe?: 'contacts' | 'cercles';
  /** Teintes des membres d'une grappe, pour les petits disques qui l'entourent. */
  memberHues?: number[];
  contactId?: number;
  genre?: string;
  /** Épingle : radians. */
  lat?: number;
  lon?: number;
  place?: string;
  me?: boolean;
}

export interface Cible { x?: number; y?: number; sphere?: number; avatar?: number; cluster?: number; alpha?: number }
export type GenreLien = 'stream' | 'line';
export interface EtatVue { noeuds: Record<string, Cible>; liens: Record<string, GenreLien>; globe: boolean }
export interface Scene { noeuds: NoeudScene[]; liens: { a: string; b: string }[]; vues: Record<Vue, EtatVue> }

export const idContact = (uid: number) => `c:${uid}`;
export const idGenre = (g: string) => `g:${g.toLowerCase()}`;
export const idCercle = (id: number) => `k:${id}`;
export const idCercleSolo = (id: number) => `ks:${id}`;
export const ID_PLUS_CERCLES = 'more-k';
export const idEpingle = (uid: number | 'moi') => `p:${uid}`;
export const cleLien = (a: string, b: string) => `${a}|${b}`;

/** Teinte stable d'un cercle (angle d'or : deux cercles voisins ne se ressemblent pas). */
export function teinteCercle(id: number): number {
  return Math.round((((id * 137.508) % 360) + 360) % 360);
}

/**
 * L'ordre des contacts autour de moi, pour des anneaux lisibles : les cercles
 * en chaîne (chacun suivi de celui avec qui il partage le plus), les membres
 * d'un cercle côte à côte, ceux qu'il partage avec le suivant à la jonction,
 * puis les contacts hors cercle. `ids` : l'ordre de départ (alphabétique).
 */
export function ordreParCercles(ids: readonly number[], cercles: readonly { membres: number[] }[]): number[] {
  const connus = new Set(ids);
  const rang = new Map(ids.map((id, i) => [id, i]));
  const restants = cercles.filter((k) => k.membres.some((m) => connus.has(m)));
  const chaine: { membres: number[] }[] = [];
  if (restants.length) chaine.push(restants.shift()!);
  while (restants.length) {
    const der = chaine[chaine.length - 1];
    let best = 0; let score = -1;
    restants.forEach((k, i) => {
      const c = k.membres.filter((m) => der.membres.includes(m)).length;
      if (c > score) { score = c; best = i; }
    });
    chaine.push(restants.splice(best, 1)[0]);
  }
  const places = new Set<number>();
  const ordre: number[] = [];
  chaine.forEach((k, i) => {
    const suivant = chaine[i + 1];
    const enFin = (m: number) => (suivant?.membres.includes(m) ? 1 : 0);
    const a = [...new Set(k.membres)].filter((m) => connus.has(m) && !places.has(m))
      .sort((x, y) => enFin(x) - enFin(y) || rang.get(x)! - rang.get(y)!);
    for (const m of a) { places.add(m); ordre.push(m); }
  });
  for (const m of ids) if (!places.has(m)) { places.add(m); ordre.push(m); }
  return ordre;
}

/**
 * Les angles des contacts rangés (`ordre`) : un pas régulier, plus du vide
 * entre deux voisins qui ne sont pas dans les mêmes cercles — beaucoup s'ils
 * n'en ont aucun en commun (deux boucles qui ne se touchent pas restent
 * séparées, un contact hors cercle aussi), un peu à une jonction (la boucle
 * qui s'arrête là ne prend pas le voisin).
 */
function anglesRanges(ordre: readonly number[], cercles: readonly { membres: number[] }[]): number[] {
  const n = ordre.length;
  if (!n) return [];
  const cle = (m: number) => cercles.map((k, i) => (k.membres.includes(m) ? i : -1)).filter((i) => i >= 0);
  const vide = (a: number, b: number) => {
    const ka = cle(a); const kb = cle(b);
    if (!ka.some((i) => kb.includes(i))) return 0.8;
    return ka.length === kb.length && ka.every((i) => kb.includes(i)) ? 0 : 0.5;
  };
  const pos: number[] = [];
  let p = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) p += vide(ordre[i - 1], ordre[i]);
    pos.push(p);
    p += 1;
  }
  const total = p + (n > 1 ? vide(ordre[n - 1], ordre[0]) : 0);
  return pos.map((x) => -Math.PI / 2 + (x * Math.PI * 2) / Math.max(1, total));
}

/** Teinte stable d'un contact, dérivée de son identifiant (monogramme, jamais une photo). */
export function teinte(uid: number): number {
  return (((uid * 67) % 360) + 360) % 360;
}

/** Les grappes : un genre, le total d'albums, les contacts qui l'ont. */
export interface Grappe { genre: string; albums: number; membres: number[]; moi: boolean }

/**
 * Les grappes de genres du cercle. Un genre compte s'il est dans les
 * {@link GENRES_MAX} premiers d'au moins un contact qui partage. Sans aucun
 * contact qui partage, mes propres genres (lus en local) font les grappes,
 * sans personne autour : la vue fonctionne même si le relais manque.
 */
export function grappesDeGenres(d: Pick<DonneesCercle, 'moi' | 'contacts'>, max: number): Grappe[] {
  const parCle = new Map<string, Grappe>();
  const cle = (g: string) => g.trim().toLowerCase();
  for (const c of d.contacts) {
    for (const g of c.genres.slice(0, GENRES_MAX)) {
      if (!g.genre?.trim()) continue;
      const k = cle(g.genre);
      const e = parCle.get(k) ?? { genre: g.genre.trim(), albums: 0, membres: [], moi: false };
      e.albums += Math.max(0, g.albums || 0);
      if (!e.membres.includes(c.id)) e.membres.push(c.id);
      parCle.set(k, e);
    }
  }
  const avecContacts = parCle.size > 0;
  for (const g of d.moi.genres.slice(0, GENRES_MAX)) {
    if (!g.genre?.trim()) continue;
    const k = cle(g.genre);
    const e = parCle.get(k);
    if (e) { e.moi = true; e.albums += Math.max(0, g.albums || 0); }
    else if (!avecContacts) parCle.set(k, { genre: g.genre.trim(), albums: Math.max(0, g.albums || 0), membres: [], moi: true });
  }
  return [...parCle.values()]
    .sort((a, b) => b.membres.length - a.membres.length || b.albums - a.albums || a.genre.localeCompare(b.genre))
    .slice(0, Math.max(0, max));
}

/** Le contact au centre de la vue Lien. */
export function contactFocus(d: Pick<DonneesCercle, 'contacts' | 'focus'>): ContactScene | null {
  if (d.focus != null) {
    const c = d.contacts.find((x) => x.id === d.focus);
    if (c) return c;
  }
  return d.contacts.find((c) => c.albums != null) ?? d.contacts[0] ?? null;
}

/** Positions régulières sur une ellipse, en partant d'en haut à gauche. */
function anneau(n: number, rx: number, ry: number, depart = -2.2): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = depart + (i * Math.PI * 2) / Math.max(1, n);
    pts.push([+(Math.cos(a) * rx).toFixed(3), +(Math.sin(a) * ry).toFixed(3)]);
  }
  return pts;
}

export function construireScene(d: DonneesCercle): Scene {
  const noeuds: NoeudScene[] = [];
  const liens: { a: string; b: string }[] = [];
  const lien = (a: string, b: string) => { if (!liens.some((l) => l.a === a && l.b === b)) liens.push({ a, b }); };
  const vues: Record<Vue, EtatVue> = {
    monde: { noeuds: {}, liens: {}, globe: true },
    seul: { noeuds: {}, liens: {}, globe: false },
    lien: { noeuds: {}, liens: {}, globe: false },
    reseau: { noeuds: {}, liens: {}, globe: false },
    genres: { noeuds: {}, liens: {}, globe: false },
  };

  noeuds.push({ id: 'self', kind: 'self', label: d.moi.nom, hue: 40, albums: d.moi.albums, members: 0 });
  for (const c of d.contacts) {
    noeuds.push({ id: idContact(c.id), kind: 'person', label: c.nom, hue: teinte(c.id), albums: c.albums, members: 0, contactId: c.id });
  }

  // ── Les cercles nommés (MES classements, privés : jamais envoyés) ──
  // Un ANNEAU par cercle et par vue (décision du 24/10/2026) : `ks:` en Solo,
  // `k:` en Réseau. Une boucle entoure ses membres ET moi ; un contact de deux
  // cercles est dans les deux boucles ; aucun nœud entre moi et mes membres.
  const membresConnus = new Set(d.contacts.map((c) => c.id));
  const cercles = d.cercles.map((k) => ({ ...k, membres: [...new Set(k.membres.filter((m) => membresConnus.has(m)))] }));
  const anneauNoeud = (id: string, k: (typeof cercles)[number], rang: number, visibles: Set<number>): NoeudScene => ({
    id, kind: 'ring', label: k.nom, hue: teinteCercle(k.id), albums: null, members: k.membres.length,
    cercleId: k.id, membresIds: k.membres, rang,
    enclos: ['self', ...k.membres.filter((m) => visibles.has(m)).map(idContact)],
  });
  const ids = d.contacts.map((c) => c.id);

  // ── Solo : moi au centre ; mes cercles en boucles nommées qui m'englobent,
  // les pastilles de leurs membres dedans ; au-delà de `maxGrappes`, « +N ».
  const cerclesSolo = cercles.slice(0, Math.max(0, d.maxGrappes));
  vues.seul.noeuds.self = { x: 0, y: 0, sphere: cerclesSolo.length ? 0.34 : 0.66, alpha: 1 };
  {
    const dansSolo = new Set(cerclesSolo.flatMap((k) => k.membres));
    const ordre = ordreParCercles(ids, cerclesSolo).filter((m) => dansSolo.has(m)).slice(0, Math.max(0, d.maxAutour));
    const angles = anglesRanges(ordre, cerclesSolo);
    ordre.forEach((uid, i) => {
      const a = angles[i];
      vues.seul.noeuds[idContact(uid)] = { x: +(Math.cos(a) * 0.76).toFixed(3), y: +(Math.sin(a) * 0.72).toFixed(3), avatar: 11, alpha: 1 };
    });
    const vus = new Set(ordre);
    cerclesSolo.forEach((k, rang) => {
      const id = idCercleSolo(k.id);
      noeuds.push(anneauNoeud(id, k, rang, vus));
      vues.seul.noeuds[id] = { alpha: 1 };
    });
    const resteCercles = cercles.length - cerclesSolo.length;
    if (resteCercles > 0) {
      noeuds.push({ id: ID_PLUS_CERCLES, kind: 'more', label: `+${resteCercles}`, hue: 0, albums: null, members: resteCercles, plusDe: 'cercles' });
      vues.seul.noeuds[ID_PLUS_CERCLES] = { x: 0, y: 0.97, alpha: 1 };
    }
  }

  // ── Lien : moi à gauche, le contact choisi à droite, un flux s'il partage ──
  const f = contactFocus(d);
  if (f) {
    const m = maxConnu([d.moi.albums, f.albums]);
    vues.lien.noeuds.self = { x: -0.42, y: 0, sphere: +(0.5 * rayonRelatif(d.moi.albums, m)).toFixed(3), alpha: 1 };
    vues.lien.noeuds[idContact(f.id)] = { x: 0.5, y: 0, sphere: +(0.5 * rayonRelatif(f.albums, m)).toFixed(3), alpha: 1 };
    lien('self', idContact(f.id));
    vues.lien.liens[cleLien('self', idContact(f.id))] = f.albums != null ? 'stream' : 'line';
  } else {
    vues.lien.noeuds.self = { ...vues.seul.noeuds.self };
  }

  // ── Réseau : mes contacts en couronne, rangés par cercle ; chaque cercle en
  // boucle qui entoure ses membres et moi. Un contact de deux cercles est UNE
  // planète, à la jonction des deux boucles ; un contact hors cercle est relié
  // à moi par un fil, hors de toute boucle.
  const cerclesReseau = cercles.slice(0, 8);
  const ordonnes = ordreParCercles(ids, cerclesReseau);
  const parId = new Map(d.contacts.map((c) => [c.id, c]));
  const visibles = ordonnes.slice(0, Math.max(0, d.maxAutour)).map((id) => parId.get(id)!);
  const reste = d.contacts.length - visibles.length;
  const mReseau = maxConnu([d.moi.albums, ...visibles.map((c) => c.albums)]);
  vues.reseau.noeuds.self = { x: 0, y: 0, sphere: +((cerclesReseau.length ? 0.2 : 0.3) * rayonRelatif(d.moi.albums, mReseau)).toFixed(3), alpha: 1 };
  // Au-delà de 14, deux couronnes alternées : les noms ne se chevauchent pas.
  const deux = visibles.length > 14;
  const angles = anglesRanges(visibles.map((c) => c.id), cerclesReseau);
  visibles.forEach((c, i) => {
    const a = angles[i];
    const ext = !deux || i % 2 === 0;
    const rx = ext ? 0.84 : 0.64; const ry = ext ? 0.8 : 0.61;
    const id = idContact(c.id);
    vues.reseau.noeuds[id] = { x: +(Math.cos(a) * rx).toFixed(3), y: +(Math.sin(a) * ry).toFixed(3), sphere: +((deux ? 0.12 : 0.16) * rayonRelatif(c.albums, mReseau)).toFixed(3), alpha: 1 };
    const dansUnCercle = cerclesReseau.some((k) => k.membres.includes(c.id));
    // Le flux dit « partage sa bibliothèque avec moi » : toujours vers moi.
    if (c.albums != null || !dansUnCercle) {
      lien('self', id);
      vues.reseau.liens[cleLien('self', id)] = c.albums != null ? 'stream' : 'line';
    }
  });
  const vusReseau = new Set(visibles.map((c) => c.id));
  cerclesReseau.forEach((k, rang) => {
    const id = idCercle(k.id);
    noeuds.push(anneauNoeud(id, k, rang, vusReseau));
    vues.reseau.noeuds[id] = { alpha: 1 };
  });
  if (reste > 0) {
    noeuds.push({ id: 'more', kind: 'more', label: `+${reste}`, hue: 0, albums: null, members: reste, plusDe: 'contacts' });
    vues.reseau.noeuds.more = { x: 0, y: 0.97, alpha: 1 };
  }

  // ── Genres : grappes autour de moi, les proches qui ont ce genre en orbite ──
  const grappes = grappesDeGenres(d, d.maxGrappes);
  const mGrappe = maxConnu(grappes.map((g) => g.albums));
  vues.genres.noeuds.self = { x: 0, y: -0.02, sphere: 0.45, alpha: 1 };
  anneau(grappes.length, 0.8, 0.66, -0.7).forEach(([x, y], i) => {
    const g = grappes[i];
    const id = idGenre(g.genre);
    noeuds.push({
      id, kind: 'genre', label: g.genre, hue: 40, albums: g.albums, members: g.membres.length,
      memberHues: g.membres.map(teinte), genre: g.genre,
    });
    vues.genres.noeuds[id] = { x, y, cluster: +tailleGrappe(g.albums, mGrappe).toFixed(3), alpha: 1 };
    lien('self', id);
    vues.genres.liens[cleLien('self', id)] = 'line';
  });

  // ── Monde : une épingle par lieu connu, des arcs depuis le mien ──
  const epingle = (uid: number | 'moi', label: string, l: Lieu, me: boolean) => {
    const id = idEpingle(uid);
    noeuds.push({ id, kind: 'pin', label, hue: me ? 40 : 160, albums: null, members: 0, lat: l.lat * DEG, lon: l.lon * DEG, place: l.label, me, contactId: uid === 'moi' ? undefined : uid });
    vues.monde.noeuds[id] = { alpha: 1 };
  };
  if (d.moi.lieu) epingle('moi', d.moi.nom, d.moi.lieu, true);
  for (const c of d.contacts) if (c.lieu) epingle(c.id, c.nom, c.lieu, false);

  return { noeuds, liens, vues };
}

/** Le nœud a-t-il quelque chose à montrer dans cette vue ? (boutons, liste) */
export function noeudsDeVue(s: Scene, v: Vue): NoeudScene[] {
  const etat = s.vues[v];
  return s.noeuds.filter((n) => etat.noeuds[n.id] && (etat.noeuds[n.id].alpha ?? 0) > 0);
}
