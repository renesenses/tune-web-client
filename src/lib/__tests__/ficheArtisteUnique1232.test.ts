// @vitest-environment jsdom
//
// renesenses/tune-web-client#1232 — UNE SEULE FICHE ARTISTE.
//
// Bertrand, 18/09/2026 : « 2 vues artistes : `streamingartist` (élue) et
// `library/artist` ». La fiche de bibliothèque (`ArtistesV2`, calque
// `#library/artiste:<id>`) est partie avec #1501 ; ses cinq blocs vivent sur la
// page commune depuis #1485. Restaient trois points d'entrée qui visaient
// encore l'ANCIENNE fiche par sa navigation propre — `selectedArtist` +
// `libraryTab = 'artists'` + `activeView = 'library'` — que plus aucun écran ne
// lisait : le clic tombait sur la grille de la Bibliothèque, sans fiche.
//
//  - le bloc « classement » du Tableau de bord (`BlocClassement`) ;
//  - les classements de l'ancien tableau de bord (`DashboardView.openArtist`) ;
//  - ses cartes « artistes les plus écoutés » (`DashboardHighlights`).
//
// Ces témoins MONTENT deux de ces écrans et cliquent. La garde de source, en
// fin de fichier, interdit le retour de la navigation retirée.
//
// Contre-épreuve : `BlocClassement.svelte` et `DashboardHighlights.svelte`
// remis à `origin/main` font rougir les témoins de clic (la vue atteinte est
// `library`, aucune cible n'est posée).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import BlocClassement from '../../components/v2/blocs/BlocClassement.svelte';
import DashboardHighlights from '../../components/v2-heritage/DashboardHighlights.svelte';
import { activeView, vueDeRetour } from '../stores/navigation';
import { ficheArtisteService } from '../stores/streaming';
import { currentZoneId } from '../stores/zones';

vi.setConfig({ testTimeout: 30_000 });

let artistesTrouves: { id: number; name: string }[] = [];
let topArtistes: unknown[] = [];

function poserLeServeur() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      let corps: any = [];
      if (u.includes('/library/search')) corps = { artists: artistesTrouves, albums: [], tracks: [] };
      else if (u.includes('/history/top-artists')) corps = topArtistes;
      else if (u.includes('/library/stats')) corps = { tracks: 1, albums: 1, artists: 1 };
      else if (u.includes('/history/dashboard')) corps = { top_artists: [], top_albums: [], top_tracks: [] };
      return {
        ok: true, status: 200, statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => corps,
        text: async () => JSON.stringify(corps),
      } as unknown as Response;
    }),
  );
}

const souffler = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function jusqua(condition: () => boolean, borne = 5000): Promise<void> {
  const fin = Date.now() + borne;
  while (!condition()) {
    if (Date.now() > fin) return;
    await souffler(10);
    flushSync();
  }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  poserLeServeur();
  currentZoneId.set(1);
  activeView.set('tableaudebord' as any);
  ficheArtisteService.set(null);
  vueDeRetour.set(null);
  artistesTrouves = [{ id: 51, name: 'Dionne Warwick' }];
  topArtistes = [];
});
afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function monter(Composant: any, props: Record<string, unknown>): HTMLElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(Composant, { target: hote, props });
  flushSync();
  return hote;
}

describe('#1232 — le bloc « classement » ouvre la PAGE COMMUNE', () => {
  const DONNEES = [{ id: 't1', titre: 'Walk On By', sous: 'Dionne Warwick', cover: null, jouer: null }];

  it('🔴 un nom d’artiste de la bibliothèque ouvre la page commune, Retour vers le tableau de bord', async () => {
    const page = monter(BlocClassement, { donnees: DONNEES });
    (page.querySelector('button.art') as HTMLButtonElement).click();
    await jusqua(() => get(activeView) === 'streamingartist');
    expect(get(activeView)).toBe('streamingartist');
    expect(get(ficheArtisteService)).toEqual({ service: null, id: '51', nom: 'Dionne Warwick' });
    expect(get(vueDeRetour)).toBe('tableaudebord');
  });

  it('un approchant n’ouvre AUCUNE fiche', async () => {
    artistesTrouves = [{ id: 99, name: 'Dionne' }];
    const page = monter(BlocClassement, { donnees: DONNEES });
    (page.querySelector('button.art') as HTMLButtonElement).click();
    await jusqua(() => get(activeView) !== 'tableaudebord');
    expect(get(ficheArtisteService)).toBeNull();
  });
});

describe('#1232 — les cartes « artistes les plus écoutés » ouvrent la PAGE COMMUNE', () => {
  it('🔴 une carte avec identifiant local ouvre la page sur cet artiste', async () => {
    topArtistes = [{ name: 'Miles Davis', plays: 4, artist_id: 3 }];
    const page = monter(DashboardHighlights, {});
    await jusqua(() => !!page.querySelector('button.artist-card'));
    (page.querySelector('button.artist-card') as HTMLButtonElement).click();
    flushSync();
    expect(get(activeView)).toBe('streamingartist');
    expect(get(ficheArtisteService)).toEqual({ service: null, id: '3', nom: 'Miles Davis' });
    expect(get(vueDeRetour)).toBe('tableaudebord');
  });

  it('🔴 une carte sans identifiant passe par le rapprochement exact du nom', async () => {
    topArtistes = [{ name: 'Dionne Warwick', plays: 4 }];
    const page = monter(DashboardHighlights, {});
    await jusqua(() => !!page.querySelector('button.artist-card'));
    (page.querySelector('button.artist-card') as HTMLButtonElement).click();
    await jusqua(() => get(activeView) === 'streamingartist');
    expect(get(ficheArtisteService)).toEqual({ service: null, id: '51', nom: 'Dionne Warwick' });
  });
});

// ── LA RÈGLE : la navigation de l'ancienne fiche ne revient pas ─────────────
describe('#1232 — plus aucune trace de la navigation de l’ancienne fiche', () => {
  const RACINES = ['src/components', 'src/lib'];
  const MOTIFS: { nom: string; motif: RegExp }[] = [
    { nom: 'selectedArtist', motif: /\bselectedArtist\b/g },
    { nom: 'artistAlbums', motif: /\bartistAlbums\b/g },
    { nom: "libraryTab.set('artists')", motif: /libraryTab\.set\(\s*['"]artists['"]\s*\)/g },
    { nom: 'libraryNavigation.ouvrirArtiste', motif: /\bouvrirArtiste(ParNom)?\b[^;]*from\s+['"][./]*lib\/libraryNavigation['"]|import\s*\{[^}]*\bouvrirArtiste(ParNom)?\b[^}]*\}\s*from\s*['"][^'"]*libraryNavigation['"]/g },
  ];
  const sansCommentaires = (s: string) =>
    s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  function fichiers(dossier: string): string[] {
    const sortie: string[] = [];
    for (const nom of readdirSync(dossier)) {
      const chemin = join(dossier, nom);
      if (statSync(chemin).isDirectory()) {
        if (nom !== '__tests__') sortie.push(...fichiers(chemin));
      } else if (/\.(svelte|ts)$/.test(nom) && !/\.test\.ts$/.test(nom)) {
        sortie.push(chemin);
      }
    }
    return sortie;
  }

  it('la garde lit bien les écrans visés — sinon elle est verte pour rien', () => {
    const tous = RACINES.flatMap((r) => fichiers(join(process.cwd(), r))).map((c) => relative(process.cwd(), c).split('\\').join('/'));
    for (const f of [
      'src/components/v2/blocs/BlocClassement.svelte',
      'src/components/v2-heritage/DashboardView.svelte',
      'src/components/v2-heritage/DashboardHighlights.svelte',
      'src/lib/libraryNavigation.ts',
    ]) expect(tous).toContain(f);
  });

  it('🔴 aucun écran ne pose la navigation de l’ancienne fiche', () => {
    const traces: string[] = [];
    for (const racine of RACINES) {
      for (const chemin of fichiers(join(process.cwd(), racine))) {
        const rel = relative(process.cwd(), chemin).split('\\').join('/');
        const src = sansCommentaires(readFileSync(chemin, 'utf-8'));
        for (const m of MOTIFS) {
          const n = (src.match(m.motif) ?? []).length;
          if (n) traces.push(`${rel} : ${m.nom} ×${n}`);
        }
      }
    }
    expect(traces, 'un écran vise encore la fiche d’artiste retirée : passer par `ouvrirArtisteDepuis`').toEqual([]);
  });

  it('les trois écrans passent par le chemin de référence', () => {
    for (const f of [
      'src/components/v2/blocs/BlocClassement.svelte',
      'src/components/v2-heritage/DashboardView.svelte',
      'src/components/v2-heritage/DashboardHighlights.svelte',
    ]) {
      const src = sansCommentaires(readFileSync(join(process.cwd(), f), 'utf-8'));
      expect(src, `${f} n’appelle pas ouvrirArtisteDepuis`).toMatch(/ouvrirArtisteDepuis\(/);
    }
  });
});
