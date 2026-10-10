/**
 * L'ONGLET TITRES PAR PAGES — tune-web-client#1716, suite de web#2001.
 *
 * ## Ce qu'on corrige
 *
 * Après web#2001, l'onglet Titres s'affichait en 6 s la première fois et en
 * 1,7 s au retour, sur la base de mesure (42 000 pistes, 37 700 visibles).
 * Ce qui restait était du travail du NAVIGATEUR : la liste entière en mémoire,
 * pliée et filtrée à chaque frappe, comptée par source, puis coupée à 500
 * lignes — les 37 200 autres n'étaient jamais atteignables.
 *
 * ## Ce que fait ce module
 *
 * Le serveur trie, cherche et compte (`api.getPagePistes`) ; l'écran ne garde
 * que des PAGES de `TAILLE_PAGE` pistes, demandées quand leurs lignes
 * approchent du cadre (`FenetrePistes.assurer`). Deux pages au plus en vol :
 * le serveur a trois connexions de lecture, la troisième reste au reste de
 * l'interface — la règle de `getAllTracks`.
 *
 * Face à un serveur qui ne sait pas paginer (`getPagePistes` rend `null`),
 * `demarrer()` rend `'ancien'` et l'écran retombe sur la liste entière de
 * web#2001 ; `trierPistes` y trie alors dans le navigateur, avec la MÊME règle
 * que le serveur (texte plié, cellule vide en fin de liste dans les deux sens,
 * ordre par défaut pour départager).
 */
import type { CleColonne } from './colonnesPistes';
import type * as Api from './api';
import type { PagePistesServeur } from './api';
import type { Track } from './types';
import { fold } from './utils';
import { provenanceDe } from './provenanceBibliotheque';

/** Une page : assez pour remplir trois écrans, assez peu pour partir vite. */
export const TAILLE_PAGE = 200;

/** Les colonnes que le serveur sait trier — `COLONNES_TRIABLES` côté serveur
 *  (`tune_core::db::track_repo`). Ni `plays`, ni `lastPlayed`, ni `dr`, ni
 *  `quality`, ni `num` (le rang, sur cet onglet). */
export const COLONNES_TRIABLES: ReadonlySet<CleColonne> = new Set<CleColonne>([
  'title', 'artist', 'composer', 'time', 'year', 'channels', 'bpm', 'genre',
  'album', 'albumArtist', 'disc', 'label', 'format', 'sampleRate', 'bitDepth',
  'size', 'path', 'isrc', 'mbid', 'comments', 'discSubtitle', 'source',
  'modified', 'hash',
]);

export interface Tri { cle: CleColonne; sens: 'asc' | 'desc' }

/** Un clic sur l'en-tête : une colonne nouvelle part en croissant, la même
 *  bascule de sens, et un troisième clic rend l'ordre par défaut. */
export function triSuivant(actuel: Tri | null, cle: CleColonne): Tri | null {
  if (!actuel || actuel.cle !== cle) return { cle, sens: 'asc' };
  return actuel.sens === 'asc' ? { cle, sens: 'desc' } : null;
}

export interface RequetePistes {
  recherche: string;
  provenance: string | null;
  tri: Tri | null;
  /** La portée Répertoires (`folder`). */
  dossier: string | null;
}

export type ChargeurDePage = (args: {
  offset: number; limit: number; comptes: boolean; signal: AbortSignal;
}) => Promise<PagePistesServeur | null>;

export function chargeurServeur(
  req: RequetePistes,
  getPagePistes: typeof Api.getPagePistes,
): ChargeurDePage {
  return ({ offset, limit, comptes, signal }) => getPagePistes({
    search: req.recherche, provenance: req.provenance, folder: req.dossier,
    sort: req.tri?.cle ?? null, order: req.tri?.sens ?? 'asc',
    offset, limit, counts: comptes, signal,
  });
}

/**
 * Ce que le serveur a répondu à la PREMIÈRE page : il sait paginer, ou non.
 * Retenu pour la session : un écran remonté face à un serveur ancien va droit
 * à la liste entière, sans redemander une page qu'il ignorera.
 */
let capacite: 'serveur' | 'ancien' | null = null;
export function capaciteDuServeur(): 'serveur' | 'ancien' | null { return capacite; }
export function _remiseAZeroPourTests(): void { capacite = null; }

function erreurAbandon(): Error {
  const e = new Error('Aborted');
  e.name = 'AbortError';
  return e;
}

/**
 * Les pages d'UNE requête (recherche, provenance, tri, portée). Une requête
 * nouvelle = une fenêtre nouvelle : l'écran abandonne l'ancienne.
 */
export class FenetrePistes {
  total: number | null = null;
  comptes: Map<string, number> | null = null;
  totalToutesSources: number | null = null;
  erreur: string | null = null;
  private readonly pages = new Map<number, Track[]>();
  private readonly enVol = new Set<number>();
  private attente: number[] = [];
  private readonly ctrl = new AbortController();
  private abandonnee = false;

  constructor(
    private readonly charger: ChargeurDePage,
    private readonly surChangement: () => void = () => {},
    readonly taille = TAILLE_PAGE,
    private readonly parallele = 2,
    /**
     * Les comptes par provenance d'une fenêtre précédente, quand ils valent
     * encore : ils ne dépendent que de la recherche et de la portée, pas du
     * tri ni de la provenance choisie. Fournis, la première page ne les
     * redemande pas — le serveur s'épargne un `GROUP BY` sur la vue.
     */
    comptesConnus: { comptes: Map<string, number> | null; totalToutesSources: number | null } | null = null,
  ) {
    if (comptesConnus) {
      this.comptes = comptesConnus.comptes;
      this.totalToutesSources = comptesConnus.totalToutesSources;
    }
    this.comptesAFaire = comptesConnus == null;
  }
  private readonly comptesAFaire: boolean;

  /**
   * La première page, avec les comptes par provenance (sauf s'ils sont
   * connus, voir `comptesConnus`). `'ancien'` : le
   * serveur ne sait pas paginer, l'écran retombe sur la liste entière.
   */
  async demarrer(): Promise<'serveur' | 'ancien'> {
    this.enVol.add(0);
    try {
      const p = await this.charger({ offset: 0, limit: this.taille, comptes: this.comptesAFaire, signal: this.ctrl.signal });
      if (this.abandonnee) throw erreurAbandon();
      if (p == null) { capacite = 'ancien'; return 'ancien'; }
      capacite = 'serveur';
      this.pages.set(0, p.items);
      this.total = p.total;
      if (this.comptesAFaire) {
        this.comptes = p.comptes;
        this.totalToutesSources = p.totalToutesSources;
      }
      return 'serveur';
    } catch (e) {
      if (!this.abandonnee) this.erreur = (e as Error)?.message ?? String(e);
      throw e;
    } finally {
      this.enVol.delete(0);
      if (!this.abandonnee) this.surChangement();
    }
  }

  /** La piste de rang `i`, si sa page est arrivée. */
  piste(i: number): Track | undefined {
    return this.pages.get(Math.floor(i / this.taille))?.[i % this.taille];
  }

  /** Les pistes CHARGÉES et contiguës de `debut` à `fin` (exclu), à partir
   *  de `debut` : la fenêtre s'arrête au premier trou. */
  contigues(debut: number, fin: number): Track[] {
    const sortie: Track[] = [];
    for (let i = debut; i < fin; i++) {
      const p = this.piste(i);
      if (!p) break;
      sortie.push(p);
    }
    return sortie;
  }

  pageChargee(k: number): boolean { return this.pages.has(k); }

  /**
   * Demande les pages qui couvrent `[debut, fin)`. Celles qui attendaient
   * encore pour une fenêtre précédente, et qui ne servent plus, sont
   * oubliées ; celles déjà en vol vont au bout.
   */
  assurer(debut: number, fin: number): void {
    if (this.abandonnee || this.total == null) return;
    const derniere = Math.max(0, Math.ceil(Math.min(fin, this.total) / this.taille) - 1);
    const voulues: number[] = [];
    for (let k = Math.max(0, Math.floor(debut / this.taille)); k <= derniere; k++) {
      if (!this.pages.has(k) && !this.enVol.has(k)) voulues.push(k);
    }
    this.attente = voulues;
    this.pomper();
  }

  private pomper(): void {
    while (!this.abandonnee && this.enVol.size < this.parallele && this.attente.length) {
      const k = this.attente.shift()!;
      if (this.pages.has(k) || this.enVol.has(k)) continue;
      this.enVol.add(k);
      this.charger({ offset: k * this.taille, limit: this.taille, comptes: false, signal: this.ctrl.signal })
        .then((p) => {
          if (this.abandonnee) return;
          if (p == null) { this.erreur = 'pagination'; return; }
          this.pages.set(k, p.items);
          // La bibliothèque a pu bouger entre deux pages : le dernier total fait foi.
          this.total = p.total;
        })
        .catch((e) => { if (!this.abandonnee && (e as Error)?.name !== 'AbortError') this.erreur = (e as Error)?.message ?? String(e); })
        .finally(() => {
          this.enVol.delete(k);
          if (this.abandonnee) return;
          this.surChangement();
          this.pomper();
        });
    }
  }

  /** Les pistes chargées dans l'ordre, à partir de `debut` et contiguës,
   *  `max` au plus — « Lire à partir d'ici ». */
  aPartirDe(debut: number, max: number): Track[] {
    return this.contigues(debut, debut + max);
  }

  abandonner(): void {
    this.abandonnee = true;
    this.attente = [];
    this.ctrl.abort();
  }
}

/**
 * Le tri du REPLI, dans le navigateur — même règle que le serveur
 * (`page_de_pistes.rs`) : texte plié (casse et accents), cellule vide en fin
 * de liste dans les deux sens, puis l'ordre par défaut de la vue (artiste,
 * album, disque, piste). Tri stable : rendu tel quel, sans tri, `pistes`.
 */
export function trierPistes(pistes: readonly Track[], tri: Tri | null): readonly Track[] {
  if (!tri) return pistes;
  const valeur = cleDeTri(tri.cle);
  const signe = tri.sens === 'asc' ? 1 : -1;
  const decorees = pistes.map((p, i) => ({ p, i, v: valeur(p) }));
  decorees.sort((a, b) => {
    const va = a.v, vb = b.v;
    const videA = va == null, videB = vb == null;
    if (videA !== videB) return videA ? 1 : -1;
    if (!videA && va !== vb) return (va! < vb! ? -1 : 1) * signe;
    return a.i - b.i;
  });
  return decorees.map((d) => d.p);
}

function cleDeTri(cle: CleColonne): (p: Track) => string | number | null {
  const a = (p: Track) => p as any;
  const texte = (f: (p: Track) => unknown) => (p: Track) => {
    const s = f(p);
    const t = s == null ? '' : String(s).trim();
    return t ? fold(t) : null;
  };
  const brut = (f: (p: Track) => unknown) => (p: Track) => {
    const s = f(p);
    const t = s == null ? '' : String(s).trim();
    return t || null;
  };
  const nombre = (f: (p: Track) => unknown, zeroVide = false) => (p: Track) => {
    const n = f(p);
    if (n == null || n === '') return null;
    const v = Number(n);
    if (!Number.isFinite(v) || (zeroVide && v === 0)) return null;
    return v;
  };
  switch (cle) {
    case 'title': return texte((p) => p.title);
    case 'artist': return texte((p) => p.artist_name);
    case 'composer': return texte((p) => a(p).composer);
    case 'genre': return texte((p) => a(p).genre);
    case 'album': return texte((p) => a(p).album_title);
    case 'albumArtist': return texte((p) => a(p).album_artist);
    case 'label': return texte((p) => a(p).label);
    case 'comments': return texte((p) => a(p).comments);
    case 'discSubtitle': return texte((p) => a(p).disc_subtitle);
    case 'format': return brut((p) => (p.format ? String(p.format).toLowerCase() : null));
    case 'path': return brut((p) => a(p).file_path ?? a(p).cue_media_path);
    case 'isrc': return brut((p) => a(p).isrc);
    case 'mbid': return brut((p) => a(p).musicbrainz_recording_id);
    case 'hash': return brut((p) => a(p).audio_hash);
    case 'source': return brut((p) => provenanceDe(p as any));
    case 'time': return nombre((p) => p.duration_ms, true);
    case 'year': return nombre((p) => p.year, true);
    case 'sampleRate': return nombre((p) => p.sample_rate, true);
    case 'bitDepth': return nombre((p) => p.bit_depth, true);
    case 'channels': return nombre((p) => a(p).channels);
    case 'bpm': return nombre((p) => a(p).bpm);
    case 'disc': return nombre((p) => a(p).disc_number);
    case 'size': return nombre((p) => a(p).file_size);
    case 'modified': return nombre((p) => a(p).file_mtime);
    default: return () => null;
  }
}
