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

export type GenreNoeud = 'self' | 'person' | 'genre' | 'circle' | 'pin' | 'more';

export interface NoeudScene {
  id: string;
  kind: GenreNoeud;
  label: string;
  hue: number;
  albums: number | null;
  /** Grappe ou cercle : le nombre de personnes ; « +N » : N. */
  members: number;
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
export const idEpingle = (uid: number | 'moi') => `p:${uid}`;
export const cleLien = (a: string, b: string) => `${a}|${b}`;

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
  // Deux nœuds par cercle : en Solo une grappe dont les membres sont en orbite
  // (`ks:`), en Réseau une grappe au milieu de ses membres, qui y sont déjà
  // des planètes (`k:`, sans orbite).
  const membresConnus = new Set(d.contacts.map((c) => c.id));
  const cercles = d.cercles.map((k) => ({ ...k, membres: k.membres.filter((m) => membresConnus.has(m)) }));
  for (const k of cercles) {
    noeuds.push({ id: idCercleSolo(k.id), kind: 'circle', label: k.nom, hue: 160, albums: null, members: k.membres.length, memberHues: k.membres.map(teinte) });
    noeuds.push({ id: idCercle(k.id), kind: 'circle', label: k.nom, hue: 160, albums: null, members: k.membres.length });
  }

  // ── Solo : moi au centre ; mes cercles en grappes nommées autour ──
  const cerclesSolo = cercles.slice(0, Math.max(0, d.maxGrappes));
  vues.seul.noeuds.self = { x: 0, y: 0, sphere: cerclesSolo.length ? 0.4 : 0.66, alpha: 1 };
  anneau(cerclesSolo.length, 0.74, 0.68, -0.7).forEach(([x, y], i) => {
    const id = idCercleSolo(cerclesSolo[i].id);
    vues.seul.noeuds[id] = { x, y, cluster: 0.8, alpha: 1 };
    lien('self', id);
    vues.seul.liens[cleLien('self', id)] = 'line';
  });

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

  // ── Réseau : mes contacts en couronne, groupés par cercle ; chaque cercle
  // au milieu de ses membres, entre eux et moi. Un contact de deux cercles
  // reste UNE planète, reliée aux deux ; un contact hors cercle est relié à moi.
  const premierCercle = (uid: number) => {
    const i = cercles.findIndex((k) => k.membres.includes(uid));
    return i < 0 ? cercles.length : i;
  };
  const ordonnes = [...d.contacts].sort((a, b) => premierCercle(a.id) - premierCercle(b.id));
  const visibles = ordonnes.slice(0, Math.max(0, d.maxAutour));
  const reste = d.contacts.length - visibles.length;
  const mReseau = maxConnu([d.moi.albums, ...visibles.map((c) => c.albums)]);
  const cerclesReseau = cercles.slice(0, 8);
  vues.reseau.noeuds.self = { x: 0, y: 0, sphere: +((cerclesReseau.length ? 0.2 : 0.3) * rayonRelatif(d.moi.albums, mReseau)).toFixed(3), alpha: 1 };
  // Au-delà de 14, deux couronnes alternées : les noms ne se chevauchent pas.
  const deux = visibles.length > 14;
  const angles = new Map<number, number>();
  const pasAngle = (Math.PI * 2) / Math.max(1, visibles.length);
  visibles.forEach((c, i) => {
    const a = -Math.PI / 2 + i * pasAngle;
    angles.set(c.id, a);
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
  // Chaque cercle à l'angle moyen de ses membres visibles, écartés s'ils se touchent.
  const placesCercles = cerclesReseau.map((k, i) => {
    let sx = 0; let sy = 0;
    for (const m of k.membres) { const a = angles.get(m); if (a != null) { sx += Math.cos(a); sy += Math.sin(a); } }
    const a = sx || sy ? Math.atan2(sy, sx) : -Math.PI / 2 + (i * Math.PI * 2) / Math.max(1, cerclesReseau.length);
    return { k, a };
  }).sort((x, y) => x.a - y.a);
  const ecart = Math.min(0.9, (Math.PI * 2) / Math.max(1, placesCercles.length));
  for (let i = 1; i < placesCercles.length; i++) {
    if (placesCercles[i].a - placesCercles[i - 1].a < ecart) placesCercles[i].a = placesCercles[i - 1].a + ecart;
  }
  for (const { k, a } of placesCercles) {
    const id = idCercle(k.id);
    vues.reseau.noeuds[id] = { x: +(Math.cos(a) * 0.42).toFixed(3), y: +(Math.sin(a) * 0.4).toFixed(3), cluster: 0.6, alpha: 1 };
    lien('self', id);
    vues.reseau.liens[cleLien('self', id)] = 'line';
    for (const uid of k.membres) {
      const cid = idContact(uid);
      if (vues.reseau.noeuds[cid]) { lien(cid, id); vues.reseau.liens[cleLien(cid, id)] = 'line'; }
    }
  }
  if (reste > 0) {
    noeuds.push({ id: 'more', kind: 'more', label: `+${reste}`, hue: 0, albums: null, members: reste });
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
