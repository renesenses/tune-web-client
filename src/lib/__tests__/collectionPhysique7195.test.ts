// @vitest-environment jsdom
//
// tune-server-rust#7195 — « Ma collection physique » : l'écran, son entrée de
// barre latérale juste après Tune Circle (décision de Bertrand du 30/10/2026,
// greffon chargé seulement), l'attribution Discogs, les trois états d'un disque, « Écouter » sur le service, et la phrase d'un CD inséré
// possédé mais pas copié.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import CollectionPhysiqueV2 from '../../components/v2/CollectionPhysiqueV2.svelte';
import Sidebar from '../../components/v2/Sidebar.svelte';
import { activeView, pendingLibraryAlbum, vueDeRetour } from '../stores/navigation';
import { ficheAlbumService } from '../stores/streaming';
import {
  ATTRIBUTION_DISCOGS, CLE_AFFICHAGE, cleErreur, clicSurDisque, codeDeRefus, collectionPhysiquePlugin,
  legendeDuDisque, nomValide, pastillesDuDisque, pochetteDuDisque, qualiteDe, urlCollection,
  vignetteDiscogsSure, type Disque,
} from '../collectionPhysique';
import { preparerLocale } from '../i18n';
import fr from '../locales/fr';

vi.setConfig({ testTimeout: 60_000 });

function reponse(corps: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let greffons: Record<string, unknown>[] = [];
let appels: string[] = [];

async function laisserTourner(n = 40) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

function disque(p: Partial<Disque>): Disque {
  return {
    instance_id: 1, release_id: 1, artiste: 'X', titre: 'T', annee: null, labels: [],
    numeros_catalogue: [], formats: ['Vinyl'], precisions: [], format: 'vinyle',
    lien_discogs: 'https://www.discogs.com/release/1', bibliotheque: null, streaming: [],
    etat: 'nulle_part', copie: null, proposer_extraction: false, ...p,
  };
}

const COLLECTION = {
  statut: 'ok',
  nom_utilisateur: 'exemple',
  compteurs: {
    total: 3,
    par_etat: { bibliotheque: 1, streaming: 1, nulle_part: 1, a_verifier: 0 },
    par_format: { vinyle: 2, cd: 1, sacd: 0, cassette: 0, autre: 0 },
    cd_non_copies: 1,
  },
  disques: [
    disque({
      instance_id: 1, release_id: 249504, artiste: 'Rick Astley', titre: 'Never Gonna Give You Up',
      annee: 1987, labels: ['RCA'], numeros_catalogue: ['PB 41447'], etat: 'bibliotheque',
      lien_discogs: 'https://www.discogs.com/release/249504',
      bibliotheque: { album_id: 42, titre: 'Never Gonna Give You Up', artiste: 'Rick Astley', qualite: 'hi-res',
        format: 'flac', sample_rate: 96000, bit_depth: 24, cover_path: 'a1b2c3.jpg', par: 'musicbrainz_album' },
      vignette: VIGNETTE,
    }),
    disque({
      instance_id: 2, release_id: 2, artiste: 'Janice McClain', titre: 'Giving My Love', etat: 'streaming',
      streaming: [{ service: 'tidal', id: 'T-42', titre: 'Giving My Love', artiste: 'Janice McClain', par: 'artiste_titre' }],
    }),
    disque({
      instance_id: 3, release_id: 7024, artiste: 'Various', titre: 'The Haçienda', format: 'cd', formats: ['CD'],
      etat: 'nulle_part', copie: false, proposer_extraction: true, vignette: VIGNETTE,
    }),
  ],
  attribution: { texte: 'Data provided by Discogs', lien: 'https://www.discogs.com' },
};

beforeAll(async () => { await preparerLocale('fr'); });

const VIGNETTE = 'https://i.discogs.com/abc/rs:fit/g:sm/q:40/h:150/w:150/czM6Ly9kaXNj.jpeg';
const CLE_STOCKAGE = `tune_v2_ecran_${CLE_AFFICHAGE}`;

beforeEach(() => {
  try { localStorage.clear(); } catch { /* stockage indisponible */ }
  ficheAlbumService.set(null);
  greffons = [];
  appels = [];
  collectionPhysiquePlugin.set(null);
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    appels.push(`${init?.method ?? 'GET'} ${u}`);
    if (/\/plugins(\?|$)/.test(u)) return reponse(greffons);
    if (u.includes('/ext/collection-physique/reglages')) return reponse({ nom_utilisateur: 'exemple', jeton: 'personnel' });
    if (u.includes('/ext/collection-physique/etat')) {
      return reponse({ nom_utilisateur: 'exemple', avancement: { en_cours: false, etape: null, fait: 0, total: 0 },
        disques: 3, tronquee: false, liste_lue_le: 1, derniere_synchro: 1793361925, derniere_erreur: null });
    }
    if (u.includes('/ext/collection-physique/collection')) return reponse(COLLECTION);
    if (/\/config/.test(u)) return reponse({});
    return reponse([]);
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  activeView.set('collectionphysique');
});

afterEach(() => {
  if (monte) {
    try { unmount(monte); } catch { /* le démontage n'est pas le sujet */ }
    monte = null;
  }
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('« Ma collection physique » — fonctions', () => {
  it('les refus se traduisent par leur code, un inconnu par la phrase générique', () => {
    expect(codeDeRefus({ corps: { error: 'collection_physique.collection_privee' } })).toBe('collection_privee');
    expect(cleErreur('collection_privee')).toBe('collectionPhysique.erreur.collection_privee');
    expect(cleErreur('nimporte_quoi')).toBe('collectionPhysique.erreur.generique');
    expect(cleErreur(null)).toBe('collectionPhysique.erreur.generique');
  });

  it('le nom d’utilisateur suit la règle du serveur', () => {
    expect(nomValide('bertrand_b209')).toBe(true);
    expect(nomValide('a/../b')).toBe(false);
    expect(nomValide('')).toBe(false);
  });

  it('la qualité, la légende et l’adresse filtrée', () => {
    expect(qualiteDe({ album_id: 1, titre: '', artiste: null, qualite: null, format: 'flac', sample_rate: 44100, bit_depth: 16, par: '' }))
      .toBe('16 bits · 44.1 kHz');
    expect(legendeDuDisque(disque({ labels: ['RCA'], numeros_catalogue: ['PB 41447'], annee: 1987 }))).toBe('RCA · PB 41447 · 1987');
    expect(urlCollection('cd', 'nulle_part')).toMatch(/\/ext\/collection-physique\/collection\?format=cd&etat=nulle_part$/);
    expect(urlCollection(null, null)).toMatch(/\/collection$/);
  });

  it('chaque clé existe dans les quinze langues', () => {
    const cles = Object.keys(fr).filter((k) => k.startsWith('collectionPhysique.'));
    expect(cles.length).toBeGreaterThan(40);
    const dossier = resolve(__dirname, '../locales');
    for (const l of ['en', 'de', 'es', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'hu', 'vi', 'el', 'nb', 'pl']) {
      const src = readFileSync(resolve(dossier, `${l}.ts`), 'utf8');
      for (const k of cles) expect(src, `${k} manquant en ${l}`).toContain(`"${k}":`);
    }
  });
});

describe('« Ma collection physique » — écran', () => {
  it('les trois états, la qualité, Écouter chez TIDAL, le CD à extraire et l’attribution', async () => {
    // Ce témoin lit la LISTE ; la grille a les siens plus bas.
    localStorage.setItem(CLE_STOCKAGE, 'list');
    monte = mount(CollectionPhysiqueV2 as any, { target: hote! });
    await laisserTourner();
    const lignes = Array.from(hote!.querySelectorAll('[data-disque]'));
    expect(lignes).toHaveLength(3);
    const rick = hote!.querySelector('[data-disque="249504"]')!;
    expect(rick.textContent).toContain(fr['collectionPhysique.etat.bibliotheque']);
    expect(rick.textContent).toContain('24 bits · 96 kHz');
    (rick.querySelector('[data-ouvrir-album]') as HTMLButtonElement).click();
    flushSync();
    expect(get(pendingLibraryAlbum)).toBe(42);
    expect(get(activeView)).toBe('library');

    const st = hote!.querySelector('[data-etat-disque="streaming"]')!;
    expect(st.querySelector('[data-service="tidal"]')?.textContent).toBe('TIDAL');
    expect(st.querySelector('[data-ecouter]')).not.toBeNull();
    expect(st.querySelector('[data-favori]')).not.toBeNull();

    const cd = hote!.querySelector('[data-disque="7024"]')!;
    expect(cd.textContent).toContain(fr['collectionPhysique.etat.nulle_part']);
    expect(cd.querySelector('[data-proposer-extraction]')).not.toBeNull();

    const att = hote!.querySelector('[data-attribution] a') as HTMLAnchorElement;
    expect(att.textContent).toBe(ATTRIBUTION_DISCOGS);
    expect(att.href).toBe('https://www.discogs.com/');
    // Le jeton n'est jamais demandé ni montré : l'écran ne connaît que son existence.
    expect(hote!.querySelector('[data-compte-du-jeton]')).not.toBeNull();
    expect(hote!.querySelector('input[type="password"]')).toBeNull();
  });

  it('filtrer par format redemande la collection filtrée', async () => {
    monte = mount(CollectionPhysiqueV2 as any, { target: hote! });
    await laisserTourner();
    (hote!.querySelector('[data-format="cd"]') as HTMLButtonElement).click();
    await laisserTourner(10);
    expect(appels.some((a) => a.includes('/ext/collection-physique/collection?format=cd'))).toBe(true);
  });
});

describe('« Ma collection physique » — accès à l’écran', () => {
  it('l’écran est monté par la coquille, ouvert par les Extensions, et le CD inséré le consulte', () => {
    const coquille = readFileSync(resolve(__dirname, '../../components/v2/ShellV2.svelte'), 'utf8');
    expect(coquille).toMatch(/\$activeView === 'collectionphysique'[\s\S]{0,120}<CollectionPhysiqueV2 \/>/);
    const ext = readFileSync(resolve(__dirname, '../../components/v2/PluginsV2.svelte'), 'utf8');
    expect(ext).toContain("p.name === 'collection-physique' && isActive(p)");
    expect(ext).toContain('refreshCollectionPhysiquePlugin()');
    const cd = readFileSync(resolve(__dirname, '../../components/v2/LectureCdV2.svelte'), 'utf8');
    expect(cd).toContain('cdDansLaCollection(');
    expect(cd).toContain("$t('collectionPhysique.cdNonCopie' as any)");
  });
});

describe('« Ma collection physique » — entrée de barre latérale (décision du 30/10/2026)', () => {
  const LIBELLE = fr['collectionPhysique.titre'];
  const libelles = () => Array.from(hote!.querySelectorAll('button.nav'))
    .map((b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim());
  const entree = () => Array.from(hote!.querySelectorAll('button.nav')).find(
    (b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim() === LIBELLE,
  ) as HTMLButtonElement | undefined;

  it('greffon installé et actif : l’entrée est là, JUSTE APRÈS Tune Circle, et mène à l’écran', async () => {
    activeView.set('home');
    greffons = [
      { name: 'circle', installed: true, enabled: true },
      { name: 'collection-physique', installed: true, enabled: true },
    ];
    monte = mount(Sidebar as any, { target: hote! });
    await laisserTourner();
    const l = libelles();
    const i = l.indexOf(LIBELLE);
    expect(i, `entrée absente : ${l.join(' | ')}`).toBeGreaterThan(-1);
    expect(l[i - 1]).toBe(fr['v2.circle.title']);
    entree()!.click();
    flushSync();
    expect(get(activeView)).toBe('collectionphysique');
  });

  it('greffon installé mais arrêté : aucune entrée', async () => {
    greffons = [{ name: 'collection-physique', installed: true, enabled: false }];
    monte = mount(Sidebar as any, { target: hote! });
    await laisserTourner();
    expect(entree()).toBeUndefined();
  });

  it('greffon absent du serveur : aucune entrée', async () => {
    greffons = [{ name: 'circle', installed: true, enabled: true }];
    monte = mount(Sidebar as any, { target: hote! });
    await laisserTourner();
    expect(entree()).toBeUndefined();
  });
});

describe('« Ma collection physique » — pochettes (essai réel du 31/10/2026 : aucune)', () => {
  it('l’album de la bibliothèque d’abord, puis la vignette Discogs, puis le repli', () => {
    const bib = { album_id: 42, titre: 'T', artiste: null, qualite: null, format: null, sample_rate: null, bit_depth: null, par: '' };
    expect(pochetteDuDisque(disque({ bibliotheque: { ...bib, cover_path: 'a1b2c3.jpg' }, vignette: VIGNETTE })))
      .toEqual({ coverPath: 'a1b2c3.jpg', albumId: 42, directe: false });
    // Dans la bibliothèque mais sans pochette : la vignette Discogs.
    expect(pochetteDuDisque(disque({ bibliotheque: { ...bib, cover_path: null }, vignette: VIGNETTE })))
      .toEqual({ coverPath: VIGNETTE, albumId: null, directe: true });
    expect(pochetteDuDisque(disque({ vignette: VIGNETTE }))).toEqual({ coverPath: VIGNETTE, albumId: null, directe: true });
    expect(pochetteDuDisque(disque({}))).toEqual({ coverPath: null, albumId: null, directe: false });
  });

  it('seule une image de Discogs en https se charge directement', () => {
    expect(vignetteDiscogsSure(VIGNETTE)).toBe(VIGNETTE);
    expect(vignetteDiscogsSure('http://i.discogs.com/x.jpg')).toBeNull();
    expect(vignetteDiscogsSure('https://i.discogs.com.evil.example/x.jpg')).toBeNull();
    expect(vignetteDiscogsSure('javascript:alert(1)')).toBeNull();
    expect(vignetteDiscogsSure('https://s.discogs.com/images/spacer.gif')).toBeNull();
    expect(vignetteDiscogsSure(null)).toBeNull();
  });

  it('les pastilles et la destination du clic', () => {
    expect(pastillesDuDisque(disque({ etat: 'nulle_part', proposer_extraction: true }))).toEqual(['nulle_part', 'non_copie']);
    expect(pastillesDuDisque(disque({ etat: 'a_verifier' }))).toEqual(['a_verifier']);
    const bib = { album_id: 42, titre: 'T', artiste: null, qualite: null, format: null, sample_rate: null, bit_depth: null, par: '' };
    expect(clicSurDisque(disque({ bibliotheque: bib }))).toEqual({ vers: 'album', albumId: 42 });
    const s = { service: 'tidal', id: 'T-42', titre: 'G', artiste: 'J', par: 'artiste_titre' as const };
    expect(clicSurDisque(disque({ streaming: [s] }))).toEqual({ vers: 'streaming', service: s });
    expect(clicSurDisque(disque({}))).toEqual({ vers: 'discogs', url: 'https://www.discogs.com/release/1' });
  });
});

describe('« Ma collection physique » — grille comme la Bibliothèque (Bertrand, 31/10/2026)', () => {
  it('grille par défaut : une carte par disque, pochette, titre, artiste et pastille', async () => {
    monte = mount(CollectionPhysiqueV2 as any, { target: hote! });
    await laisserTourner();
    const grille = hote!.querySelector('[data-grille-collection]');
    expect(grille).not.toBeNull();
    expect(grille!.querySelectorAll('.card')).toHaveLength(3);
    expect(hote!.querySelector('ul.list')).toBeNull();

    const rick = grille!.querySelector('[data-disque="249504"]')!;
    expect(rick.querySelector('.ct')?.textContent).toBe('Never Gonna Give You Up');
    expect(rick.querySelector('.ca')?.textContent).toBe('Rick Astley');
    expect(rick.querySelector('[data-pastille="bibliotheque"]')?.textContent).toBe(fr['collectionPhysique.etat.bibliotheque']);
    // La pochette de l'album local, par les routes de pochettes du serveur.
    const imgRick = rick.querySelector('img') as HTMLImageElement;
    expect(imgRick.getAttribute('src')).toMatch(/\/library\/artwork\/a1b2c3\.jpg/);
    expect(imgRick.getAttribute('loading')).toBe('lazy');

    // Hors bibliothèque : la vignette Discogs, telle quelle, sans relais ni référent.
    const h = grille!.querySelector('[data-disque="7024"]')!;
    const imgH = h.querySelector('img') as HTMLImageElement;
    expect(imgH.getAttribute('src')).toBe(VIGNETTE);
    expect(imgH.getAttribute('loading')).toBe('lazy');
    expect(imgH.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(h.querySelector('[data-pastille="non_copie"]')?.textContent).toBe(fr['collectionPhysique.pastilleNonCopie']);

    // Ni vignette ni album : le repli d'AlbumArt (l'initiale), aucune image.
    const g = grille!.querySelector('[data-disque="2"]')!;
    expect(g.querySelector('img')).toBeNull();
    expect(g.querySelector('.placeholder')).not.toBeNull();
    expect(g.querySelector('[data-pastille="streaming"]')).not.toBeNull();

    // Aucune requête par disque : ni au serveur (pochettes, relais) ni ailleurs.
    expect(appels.filter((a) => /artwork|cover|discogs\.com/.test(a))).toEqual([]);
  });

  it('un clic ouvre l’album local, sinon l’album du service', async () => {
    monte = mount(CollectionPhysiqueV2 as any, { target: hote! });
    await laisserTourner();
    (hote!.querySelector('[data-disque="249504"] [data-ouvrir-disque]') as HTMLButtonElement).click();
    flushSync();
    expect(get(pendingLibraryAlbum)).toBe(42);
    expect(get(activeView)).toBe('library');

    activeView.set('collectionphysique');
    flushSync();
    (hote!.querySelector('[data-disque="2"] [data-ouvrir-disque]') as HTMLButtonElement)?.click();
    flushSync();
    expect(get(ficheAlbumService)).toMatchObject({ service: 'tidal', id: 'T-42' });
    expect(get(activeView)).toBe('streamingalbum');
    expect(get(vueDeRetour)).toBe('collectionphysique');
  });

  it('un disque nulle part ouvre sa fiche Discogs', async () => {
    const ouvrir = vi.fn();
    vi.stubGlobal('open', ouvrir);
    monte = mount(CollectionPhysiqueV2 as any, { target: hote! });
    await laisserTourner();
    (hote!.querySelector('[data-disque="7024"] [data-ouvrir-disque]') as HTMLButtonElement).click();
    expect(ouvrir).toHaveBeenCalledWith('https://www.discogs.com/release/1', '_blank', 'noopener,noreferrer');
  });

  it('la bascule grille / liste de la Bibliothèque, choix retenu', async () => {
    monte = mount(CollectionPhysiqueV2 as any, { target: hote! });
    await laisserTourner();
    const bascule = hote!.querySelector('button.viewtog') as HTMLButtonElement;
    expect(bascule).not.toBeNull();
    expect(bascule.dataset.vue).toBe('grid');
    bascule.click();
    flushSync();
    expect(hote!.querySelector('[data-grille-collection]')).toBeNull();
    expect(hote!.querySelectorAll('ul.list [data-disque]')).toHaveLength(3);
    // La liste a aussi sa vignette.
    expect(hote!.querySelector('ul.list [data-disque="7024"] img')?.getAttribute('src')).toBe(VIGNETTE);
    expect(localStorage.getItem(CLE_STOCKAGE)).toBe('list');

    unmount(monte!);
    monte = mount(CollectionPhysiqueV2 as any, { target: hote! });
    await laisserTourner();
    expect(hote!.querySelector('[data-grille-collection]')).toBeNull();
    expect(hote!.querySelector('ul.list')).not.toBeNull();
  });

  it('les filtres restent au-dessus de la grille', async () => {
    monte = mount(CollectionPhysiqueV2 as any, { target: hote! });
    await laisserTourner();
    const filtre = hote!.querySelector('[data-format="cd"]')!;
    const grille = hote!.querySelector('[data-grille-collection]')!;
    expect(filtre.compareDocumentPosition(grille) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('le message du jeton dit les DEUX écrans où il se saisit', () => {
    expect(fr['collectionPhysique.sansJeton']).toContain("Clés d'API");
    expect(fr['collectionPhysique.sansJeton']).toContain('Services & Jetons');
  });
});
