// @vitest-environment jsdom
//
// web#3117 (FabienM, fil 2864, point 2 ; go de Bertrand du 16/11/2026) —
// « Menu tableau de bord : ajouter bloc "top artistes" ».
//
// Ce que ces témoins gardent :
//  - le bloc EXISTE dans le catalogue du Tableau de bord, et suit la période
//    choisie dans l'en-tête ;
//  - il est PEINT : portrait rond, nom, nombre de lectures (du texte, pas un
//    lien) ;
//  - un clic sur la ligne ouvre la PAGE ARTISTE (`ouvrirArtisteDepuis`), avec
//    le service d'écoute quand le classement le porte (#1696) ;
//  - contre-épreuve : les classements d'albums gardent leur pochette carrée
//    et leur lien d'artiste.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.mock('../ouvrirArtisteDepuis', () => ({ ouvrirArtisteDepuis: vi.fn(async () => {}) }));

import { ouvrirArtisteDepuis } from '../ouvrirArtisteDepuis';
import { AJOUTS_TABLEAU_DE_BORD, BLOCS_TABLEAU_DE_BORD, DISPOSITION_DEFAUT_TABLEAU_DE_BORD } from '../tableauDeBordWidgets';
import { marqueursAjouts, migrationAjoutUnique } from '../migrationPremiereLigne';
import { choisirPeriode } from '../tableauDeBordPeriode';
import BlocClassement from '../../components/v2/blocs/BlocClassement.svelte';
import type { Element } from '../accueilWidgets';
import { locale } from '../i18n';
import { activeView } from '../stores/navigation';
import { currentProfileId } from '../stores/profile';
import TableauDeBordV2 from '../../components/v2/TableauDeBordV2.svelte';

vi.setConfig({ testTimeout: 30_000 });

const TABLEAU = {
  period: '30d',
  range: { from: null, to: '' },
  totals: { plays: 10, listening_ms: 1, unique_tracks: 3, unique_artists: 2 },
  top_artists: [
    { artist_name: 'Dominique A', plays: 1234, listening_ms: 1, cover_path: 'abc' },
    { artist_name: 'Brian Eno', plays: 7, listening_ms: 1, cover_path: 'def', source: 'qobuz' },
  ],
  top_albums: [],
  top_tracks: [],
  trend: [],
  hourly: [],
  by_zone: [],
  by_source: [],
  completion: { completed: 0, skipped: 0, avg_listened_ms: 0, avg_track_duration_ms: 0 },
};

let urls: string[] = [];
/** Les réglages du profil servis, et les écritures reçues. */
let reglages: Record<string, unknown> = {};
let ecritures: Record<string, unknown>[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  reglages = {};
  ecritures = [];
  locale.set('fr');
  activeView.set('dashboard' as never);
  urls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entree: unknown, init?: RequestInit) => {
      const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
      urls.push(url);
      if (url.includes('/settings') && init?.method === 'POST') {
        const b = JSON.parse(String(init.body));
        ecritures.push(b);
        reglages = b;
      }
      const corps = url.includes('/history/dashboard') ? TABLEAU : url.includes('/settings') ? reglages : [];
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => corps,
        text: async () => JSON.stringify(corps),
      } as unknown as Response;
    }),
  );
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  choisirPeriode('7d');
  vi.unstubAllGlobals();
  vi.mocked(ouvrirArtisteDepuis).mockClear();
});

function poser(donnees: Element[]): HTMLElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(BlocClassement, { target: hote, props: { donnees } });
  flushSync();
  return hote;
}

const bloc = () => BLOCS_TABLEAU_DE_BORD.find((w) => w.id === 'tdb-top-artistes');

describe('web#3117 — le bloc « Top artistes » du Tableau de bord', () => {
  it('existe, au défaut, en dernier et sur un tiers : les trois rangées de la maquette ne bougent pas', () => {
    const w = bloc();
    expect(w, 'aucun bloc « Top artistes » dans le catalogue').toBeTruthy();
    expect(w!.forme).toBe('bloc');
    expect(w!.cleTitre).toBe('dashboard.section.top_artists');
    expect(w!.bloc?.composant).toBe(BlocClassement);
    expect(w!.bloc?.etendue).toBe(2);
    expect(w!.bloc?.icone).toBeTruthy();
    expect(DISPOSITION_DEFAUT_TABLEAU_DE_BORD.at(-1)).toBe('tdb-top-artistes');
  });

  it('suit la PÉRIODE de l’en-tête et rend des artistes qui s’ouvrent', async () => {
    choisirPeriode('30d');
    const els = (await bloc()!.bloc!.donnees({ profileId: 1, albums: [], zones: [], langue: 'fr' })) as Element[];
    expect(urls.some((u) => u.includes('/history/dashboard') && u.includes('period=30d')),
      'le bloc n’a pas demandé la période choisie').toBe(true);
    expect(els.map((e) => e.titre)).toEqual(['Dominique A', 'Brian Eno']);
    expect(els.every((e) => e.ouvrir === 'artiste')).toBe(true);
    expect(els[0].sous, 'le nombre de lectures, formaté en français').toMatch(/^1\s234$/);
    expect(els[1].artisteService).toBe('qobuz');
  });

  it('🔴 peint un portrait ROND, le compte en texte, et le clic ouvre la page artiste', async () => {
    choisirPeriode('7d');
    const els = (await bloc()!.bloc!.donnees({ profileId: 1, albums: [], zones: [], langue: 'fr' })) as Element[];
    const page = poser(els);
    const lignes = [...page.querySelectorAll('li')];
    expect(lignes).toHaveLength(2);
    expect(lignes[0].querySelector('.vign.rond'), 'le portrait n’est pas rond').toBeTruthy();
    expect(lignes[0].querySelector('button.art'), 'le compte de lectures ne doit pas être un lien').toBeNull();
    expect(lignes[0].querySelector('span.art.compte')?.textContent).toMatch(/1\s234/);

    (lignes[1].querySelector('button.corps') as HTMLButtonElement).click();
    expect(ouvrirArtisteDepuis).toHaveBeenCalledWith({ name: 'Brian Eno', service_ecoute: 'qobuz' }, 'dashboard');
  });

  it('contre-épreuve : une ligne d’ALBUM garde sa pochette carrée et son lien d’artiste', () => {
    const page = poser([{ id: 'a', titre: 'Le temps qui passe sans moi', sous: 'Dominique A', cover: null }]);
    expect(page.querySelector('.vign.rond')).toBeNull();
    const lien = page.querySelector('button.art') as HTMLButtonElement;
    expect(lien?.textContent).toBe('Dominique A');
    lien.click();
    expect(ouvrirArtisteDepuis).toHaveBeenCalledWith({ name: 'Dominique A' }, 'dashboard');
  });
});

describe('web#3117 — « Top artistes » entre UNE fois dans un tableau de bord déjà rangé', () => {
  const ID = 'tdb-top-artistes';
  const MARQUEUR = AJOUTS_TABLEAU_DE_BORD[0].cleMarqueur;

  it('le Tableau de bord le déclare', () => {
    expect(AJOUTS_TABLEAU_DE_BORD).toEqual([{ id: ID, cleMarqueur: MARQUEUR }]);
  });

  it('🔴 une disposition rangée sans lui le reçoit EN QUEUE, le reste dans le même ordre', () => {
    expect(migrationAjoutUnique(['tdb-serie', 'tdb-tendance'], undefined, ID))
      .toEqual({ disposition: ['tdb-serie', 'tdb-tendance', ID], aMigrer: true });
  });

  it('contre-épreuves : rien d’enregistré, déjà là, ou marqueur posé — rien à écrire', () => {
    expect(migrationAjoutUnique([], undefined, ID).aMigrer).toBe(false);
    expect(migrationAjoutUnique(null, undefined, ID).aMigrer).toBe(false);
    expect(migrationAjoutUnique([ID, 'tdb-serie'], undefined, ID).aMigrer).toBe(false);
    // Retiré par l'utilisateur après la migration : il ne revient pas.
    expect(migrationAjoutUnique(['tdb-serie'], true, ID))
      .toEqual({ disposition: ['tdb-serie'], aMigrer: false });
  });

  it('un enregistrement de l’utilisateur pose le marqueur avec sa disposition', () => {
    expect(marqueursAjouts(AJOUTS_TABLEAU_DE_BORD)).toEqual({ [MARQUEUR]: true });
  });
});

describe('web#3117 — la migration, à l’écran', () => {
  class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

  it('🔴 un tableau de bord rangé sans « Top artistes » le montre, et l’écrit UNE fois avec son marqueur', async () => {
    vi.stubGlobal('ResizeObserver', ObservateurInerte);
    vi.stubGlobal('IntersectionObserver', ObservateurInerte);
    currentProfileId.set(1);
    reglages = { tableau_de_bord_widgets: ['tdb-serie', 'tdb-tendance'] };
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(TableauDeBordV2, { target: hote, props: {} });
    for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 0));
    flushSync();
    const titres = [...hote.querySelectorAll('section.bloc')].length;
    expect(titres, 'la disposition rangée + le bloc ajouté').toBe(3);
    const ecrite = ecritures.find((e) => Array.isArray(e.tableau_de_bord_widgets));
    expect(ecrite?.tableau_de_bord_widgets).toEqual(['tdb-serie', 'tdb-tendance', 'tdb-top-artistes']);
    expect(ecrite?.[AJOUTS_TABLEAU_DE_BORD[0].cleMarqueur]).toBe(true);
    currentProfileId.set(null);
  });
});
