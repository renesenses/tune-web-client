/**
 * « Demander à l'assistant » (chantier « assistant-ia », étape 3) — le
 * dialogue de l'ancien `POST /ai/query`, étendu côté serveur à tous les
 * fournisseurs de l'assistant (tune-server-rust#6268), sur la bibliothèque
 * locale seule.
 *
 * Le serveur pilote des OUTILS (chercher, jouer un album ou une piste, file
 * d'attente…) et rend leur trace dans `actions`. Les albums, artistes et
 * pistes que la réponse cite en sont tirés ici : ce sont des objets de la
 * base (identifiants), jamais des noms devinés dans le texte.
 *
 * L'historique vit dans un magasin du module : il tient le temps de la
 * session (fermer et rouvrir le panneau le retrouve), il n'est écrit nulle
 * part. Chaque question part SEULE au serveur : `/ai/query` ne reçoit pas
 * les tours précédents.
 *
 * Le COÛT d'une question : `/ai/query` ne le rend pas (seulement `plafond`,
 * la dépense du mois après la question). L'écran le tire de l'écart entre la
 * dépense connue AVANT (réglages lus à l'ouverture, ou la question
 * précédente) et celle d'APRÈS. Un autre usage de l'assistant lancé entre les
 * deux (une autre fenêtre) s'y ajouterait : l'écran l'écrit « environ ».
 *
 * Le panneau n'existe que si l'assistant est PRÊT ({@link assistantPret}) :
 * la coquille sonde les réglages une fois ({@link sonderAssistantIa}), sans
 * bandeau (un serveur sans le greffon répond 404), et Réglages ▸ Assistant IA
 * tient le magasin à jour à chaque lecture ou enregistrement.
 */
import { derived, get, writable } from 'svelte/store';
import { BASE, fetchJSON, play, addToQueue } from './api';
import { estReglages, type EtatPlafondIa, type ReglagesIa } from './assistantIa';

/** Une action exécutée par l'assistant (un outil, son entrée, son résultat). */
export interface ActionIa {
  tool: string;
  input?: unknown;
  result?: any;
}

/** La réponse de `/ai/query`. `error` : un refus (plafond atteint, clé refusée…). */
export interface ReponseDialogueIa {
  reply: string;
  actions?: ActionIa[];
  zone_id?: number;
  error?: string;
  plafond?: EtatPlafondIa;
}

export interface AlbumCiteIa { id: number; title: string; artist: string | null }
export interface ArtisteCiteIa { id: number; name: string }
export interface PisteCiteIa { id: number; title: string; artist: string | null; album: string | null }

export interface CitationsIa {
  albums: AlbumCiteIa[];
  artistes: ArtisteCiteIa[];
  pistes: PisteCiteIa[];
}

/** Un tour de la conversation, tel que l'écran l'affiche. */
export interface TourIa {
  id: number;
  question: string;
  reponse: string | null;
  erreur: string | null;
  citations: CitationsIa;
  /** Le coût de la question, tiré de la dépense du mois (voir l'en-tête) ; `null` inconnu. */
  cout_eur: number | null;
  plafond: EtatPlafondIa | null;
  enCours: boolean;
}

/** Au plus, par famille, ce que l'écran cite sous une réponse. */
export const CITES_MAX = 8;
/** Sans mention dans le texte, les premiers résultats d'une recherche. */
export const CITES_SANS_MENTION = 3;
/** La longueur d'une question (le serveur ne borne pas ; l'écran, si). */
export const QUESTION_MAX = 1000;

const accepter = (s: number) => s !== 401;

/** L'assistant peut-il répondre ? Un fournisseur, une clé qui s'ouvre (sauf Ollama), un tarif connu. */
export function assistantPret(r: ReglagesIa | null | undefined): boolean {
  if (!r || !r.fournisseur) return false;
  if (r.cle_illisible) return false;
  if (r.fournisseur !== 'ollama' && !r.cle_definie) return false;
  return r.tarif_connu !== false;
}

// ---------------------------------------------------------------------------
// Prêt ou non : le magasin des réglages connus
// ---------------------------------------------------------------------------

/** Les derniers réglages lus de l'assistant ; `null` : pas de greffon, ou pas encore lus. */
export const reglagesIaConnus = writable<ReglagesIa | null>(null);

/** Le bouton « Demander à l'assistant » n'apparaît que si ceci est vrai. */
export const assistantIaPret = derived(reglagesIaConnus, (r) => assistantPret(r));

/** Réglages ▸ Assistant IA les a lus ou enregistrés : le magasin suit. */
export function noterReglagesIa(r: unknown): void {
  if (estReglages(r)) {
    reglagesIaConnus.set(r);
    derniereDepense = typeof r.consommation.cout_eur === 'number' ? r.consommation.cout_eur : null;
  }
}

/**
 * Lit les réglages une fois, sans bandeau ni erreur visible : un serveur
 * sans le greffon (404), un profil sans accès, un réseau coupé laissent
 * simplement le bouton absent.
 */
export async function sonderAssistantIa(
  lire: () => Promise<unknown> = () => fetchJSON(`${BASE}/ext/assistant-ia/reglages`, undefined, undefined, true),
): Promise<boolean> {
  try {
    const r = await lire();
    if (estReglages(r)) noterReglagesIa(r);
    else reglagesIaConnus.set(null);
  } catch {
    reglagesIaConnus.set(null);
  }
  return get(assistantIaPret);
}

/** La dépense du mois connue avant la prochaine question (euros). */
let derniereDepense: number | null = null;

/** L'écart de dépense d'une question ; `null` si l'un des deux bouts manque. */
export function coutDeQuestion(avant: number | null, apres: number | null | undefined): number | null {
  if (avant == null || apres == null || !Number.isFinite(avant) || !Number.isFinite(apres)) return null;
  return Math.max(0, apres - avant);
}

export function demanderAssistantIa(message: string, zoneId: number | null): Promise<ReponseDialogueIa> {
  const corps: { message: string; zone_id?: number } = { message };
  if (zoneId != null) corps.zone_id = zoneId;
  return fetchJSON(`${BASE}/ai/query`, { method: 'POST', body: JSON.stringify(corps) }, accepter);
}

const norm = (s: string) => s.toLocaleLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();

function mentionne(texte: string, nom: string | null | undefined): boolean {
  if (!nom) return false;
  const n = norm(nom);
  return n.length >= 2 && texte.includes(n);
}

const entier = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null;

/**
 * Les albums, artistes et pistes cités par une réponse, tirés des résultats
 * d'outils (`search_library`, `play_track`). Ceux que le texte nomme passent
 * d'abord ; si le texte n'en nomme aucun d'une famille, les premiers
 * résultats de la recherche. Sans doublon, bornés à {@link CITES_MAX}.
 */
export function citationsDe(r: Pick<ReponseDialogueIa, 'reply' | 'actions'>): CitationsIa {
  const texte = norm(r.reply ?? '');
  const albums = new Map<number, AlbumCiteIa>();
  const artistes = new Map<number, ArtisteCiteIa>();
  const pistes = new Map<number, PisteCiteIa>();
  for (const a of r.actions ?? []) {
    const res = a?.result;
    if (!res || typeof res !== 'object') continue;
    for (const x of Array.isArray(res.albums) ? res.albums : []) {
      const id = entier(x?.id);
      if (id != null && typeof x.title === 'string' && !albums.has(id)) {
        albums.set(id, { id, title: x.title, artist: typeof x.artist === 'string' ? x.artist : null });
      }
    }
    for (const x of Array.isArray(res.artists) ? res.artists : []) {
      const id = entier(x?.id);
      if (id != null && typeof x.name === 'string' && !artistes.has(id)) artistes.set(id, { id, name: x.name });
    }
    for (const x of Array.isArray(res.tracks) ? res.tracks : []) {
      const id = entier(x?.id);
      if (id != null && typeof x.title === 'string' && !pistes.has(id)) {
        pistes.set(id, {
          id, title: x.title,
          artist: typeof x.artist === 'string' ? x.artist : null,
          album: typeof x.album === 'string' ? x.album : null,
        });
      }
    }
    // `play_track` : la piste lancée.
    const tid = entier(res.track_id);
    if (a.tool === 'play_track' && tid != null && typeof res.track === 'string' && !pistes.has(tid)) {
      pistes.set(tid, {
        id: tid, title: res.track,
        artist: typeof res.artist === 'string' ? res.artist : null,
        album: typeof res.album === 'string' ? res.album : null,
      });
    }
  }
  const choisir = <T>(tous: T[], nom: (x: T) => string): T[] => {
    const cites = tous.filter((x) => mentionne(texte, nom(x)));
    return (cites.length ? cites : tous.slice(0, CITES_SANS_MENTION)).slice(0, CITES_MAX);
  };
  return {
    albums: choisir([...albums.values()], (x) => x.title),
    artistes: choisir([...artistes.values()], (x) => x.name),
    pistes: choisir([...pistes.values()], (x) => x.title),
  };
}

export const aucuneCitation = (c: CitationsIa) => !c.albums.length && !c.artistes.length && !c.pistes.length;

// ---------------------------------------------------------------------------
// La conversation de la session
// ---------------------------------------------------------------------------

export const conversationIa = writable<TourIa[]>([]);
let prochainId = 1;

/** Vide la conversation (bouton « Nouvelle conversation »). */
export function oublierConversationIa(): void {
  conversationIa.set([]);
}

/**
 * Pose une question et range le tour dans la conversation. `traduire` donne
 * la phrase d'un code d'erreur (un refus du serveur, ou un échec réseau).
 */
export async function poserQuestionIa(
  question: string,
  zoneId: number | null,
  traduire: (code: string, message?: string) => string,
  demander: typeof demanderAssistantIa = demanderAssistantIa,
): Promise<TourIa> {
  const q = question.trim().slice(0, QUESTION_MAX);
  const id = prochainId++;
  const tour: TourIa = {
    id, question: q, reponse: null, erreur: null,
    citations: { albums: [], artistes: [], pistes: [] },
    cout_eur: null, plafond: null, enCours: true,
  };
  conversationIa.update((c) => [...c, tour]);
  const avant = derniereDepense;
  let fini: TourIa;
  try {
    const r = await demander(q, zoneId);
    const apres = r.plafond?.depense_eur ?? null;
    if (apres != null) derniereDepense = apres;
    fini = {
      ...tour,
      enCours: false,
      reponse: r.error ? null : (r.reply ?? ''),
      erreur: r.error ? traduire(r.error, r.reply) : null,
      citations: r.error ? tour.citations : citationsDe(r),
      cout_eur: coutDeQuestion(avant, apres),
      plafond: r.plafond ?? null,
    };
  } catch (e) {
    fini = { ...tour, enCours: false, erreur: traduire('generique', (e as Error)?.message) };
  }
  conversationIa.update((c) => c.map((t) => (t.id === id ? fini : t)));
  return fini;
}

/** Le dernier état du plafond connu de la conversation. */
export function dernierPlafond(tours: TourIa[]): EtatPlafondIa | null {
  for (let i = tours.length - 1; i >= 0; i--) if (tours[i].plafond) return tours[i].plafond;
  return null;
}


// ---------------------------------------------------------------------------
// Lire, ajouter : les liens sous une réponse
// ---------------------------------------------------------------------------

export type GenreCite = 'album' | 'piste';

/** Le corps de `/play` ou de `/queue/add` pour un album ou une piste de la bibliothèque. */
export function corpsDeCitation(genre: GenreCite, id: number): { album_id: number } | { track_id: number } {
  return genre === 'album' ? { album_id: id } : { track_id: id };
}

/** « Lire » : remplace la lecture de la zone par l'album ou la piste. */
export function lireCitation(
  genre: GenreCite, id: number, zoneId: number,
  jouer: (z: number, b: any) => Promise<unknown> = play,
): Promise<unknown> {
  return jouer(zoneId, corpsDeCitation(genre, id));
}

/** « Ajouter » : en fin de file d'attente de la zone. */
export function ajouterCitation(
  genre: GenreCite, id: number, zoneId: number,
  ajouter: (z: number, b: any) => Promise<unknown> = addToQueue,
): Promise<unknown> {
  return ajouter(zoneId, corpsDeCitation(genre, id));
}

/** Le texte du coût d'un tour : `null` si inconnu. */
export function texteCout(modele: string, cout: number | null): string | null {
  return cout == null ? null : modele.replace('{cout}', cout.toFixed(4));
}

/** Le texte « dépensé ce mois / plafond ». */
export function textePlafond(modele: string, p: EtatPlafondIa | null | undefined): string | null {
  if (!p) return null;
  return modele.replace('{depense}', p.depense_eur.toFixed(2)).replace('{plafond}', p.plafond_eur.toFixed(2));
}
