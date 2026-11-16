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
import { BLOCS_TABLEAU_DE_BORD, DISPOSITION_DEFAUT_TABLEAU_DE_BORD } from '../tableauDeBordWidgets';
import { choisirPeriode } from '../tableauDeBordPeriode';
import BlocClassement from '../../components/v2/blocs/BlocClassement.svelte';
import type { Element } from '../accueilWidgets';
import { locale } from '../i18n';
import { activeView } from '../stores/navigation';

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
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  locale.set('fr');
  activeView.set('dashboard' as never);
  urls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entree: unknown) => {
      const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
      urls.push(url);
      const corps = url.includes('/history/dashboard') ? TABLEAU : [];
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
