// @vitest-environment jsdom
//
// 🔴 #1696, LE CAS RESTÉ OUVERT — l'artiste écouté en streaming SEULEMENT.
//
// Daniel LEVY, fil 2005, 28/09/2026, à la question « ces artistes sont-ils
// dans votre bibliothèque, ou écoutés seulement en streaming ? » :
// « Effectivement écoutés sur Qobuz ». La PR #1737 corrigeait le
// rapprochement LOCAL et laissait ce cas en repli Bibliothèque, faute de
// savoir où chercher : `top_artists[]` ne portait qu'un nom.
//
// Le serveur dit désormais le service où l'artiste est écouté
// (`top_artists[].source`). Ce fichier garde les trois issues du clic :
//
//  1. fiche locale trouvée → la page commune, comme avant (le service ne
//     passe PAS devant la bibliothèque) ;
//  2. pas de fiche locale, service connu → la fiche de l'artiste CHEZ ce
//     service, plus la Bibliothèque ;
//  3. pas de fiche locale, aucun service (serveur ancien, ou artiste jamais
//     écouté hors bibliothèque) → le repli d'avant, inchangé.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import { ouvrirArtisteDepuis } from '../ouvrirArtisteDepuis';
import { widgetParId } from '../accueilWidgets';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { currentProfileId } from '../stores/profile';
import { currentZoneId } from '../stores/zones';
import { activeView, pendingLibraryArtist, pendingSearchQuery, vueDeRetour } from '../stores/navigation';
import { ficheArtisteService } from '../stores/streaming';

/** Ce que la bibliothèque connaît : « Air » seulement. */
function bibliotheque(q: string): { id: number; name: string }[] {
  return q === 'Air' ? [{ id: 3671, name: 'Air' }] : [];
}

/** Ce que Qobuz rend à la recherche fédérée. */
function qobuz(q: string): { id: string; name: string }[] {
  if (q === 'Jo-Yu Chen') return [{ id: '123456', name: 'Jo-Yu Chen' }];
  if (q === 'Blondshell') return [{ id: '777', name: 'Blondshell' }];
  return [];
}

const TABLEAU = {
  period: '7d',
  range: { from: null, to: '' },
  totals: { plays: 10, listening_ms: 1, unique_tracks: 3, unique_artists: 3 },
  top_artists: [
    { artist_name: 'Jo-Yu Chen', plays: 12, listening_ms: 1, cover_path: null, source: 'qobuz' },
    { artist_name: 'Air', plays: 9, listening_ms: 1, cover_path: null, source: 'qobuz' },
    { artist_name: 'Gretchen Parlato', plays: 3, listening_ms: 1, cover_path: null },
  ],
  // Les trois colonnes du gros widget ne se rendent que pleines.
  top_albums: [{ album_title: 'Moon Safari', artist_name: 'Air', cover_path: null, plays: 9, album_id: 4242 }],
  top_tracks: [{ track_id: 777, title: 'La femme d’argent', artist_name: 'Air', plays: 6, listening_ms: 1 }],
  trend: [], hourly: [], by_zone: [], by_source: [],
  completion: { completed: 0, skipped: 0, avg_listened_ms: 0, avg_track_duration_ms: 0 },
};

/** Les recherches fédérées parties : `[q, sources]`. */
let federees: [string, string | null][] = [];

function poserLeServeur() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      const p = new URLSearchParams(u.includes('?') ? u.slice(u.indexOf('?') + 1) : '');
      let corps: any = {};
      if (u.includes('/history/dashboard')) corps = TABLEAU;
      else if (u.includes('/library/search')) {
        corps = { artists: bibliotheque(p.get('q') ?? ''), albums: [], tracks: [] };
      } else if (/\/search\?/.test(u)) {
        const q = p.get('q') ?? '';
        federees.push([q, p.get('sources')]);
        corps = { services: { qobuz: { artists: qobuz(q), albums: [], tracks: [] } } };
      } else if (u.includes('/tracks')) corps = [];
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
}

const souffler = (ms = 60) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  federees = [];
  poserLeServeur();
  activeView.set('home' as any);
  pendingLibraryArtist.set(null);
  pendingSearchQuery.set('');
  ficheArtisteService.set(null);
  vueDeRetour.set(null);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('#1696 — un artiste du classement écouté sur un service seulement', () => {
  it('🔴 ouvre SA FICHE chez le service, plus la Bibliothèque', async () => {
    await ouvrirArtisteDepuis({ name: 'Jo-Yu Chen', service_ecoute: 'qobuz' }, 'home' as any);
    expect(get(activeView), 'le clic retombe sur la Bibliothèque').toBe('streamingartist');
    expect(get(ficheArtisteService)).toEqual({ service: 'qobuz', id: '123456', nom: 'Jo-Yu Chen' });
    expect(get(vueDeRetour), 'le Retour de la fiche ne ramène plus à l’accueil').toBe('home');
    expect(federees, 'la fiche a été cherchée ailleurs que chez le service d’écoute').toEqual([
      ['Jo-Yu Chen', 'qobuz'],
    ]);
  });

  it('la fiche LOCALE passe toujours devant le service', async () => {
    await ouvrirArtisteDepuis({ name: 'Air', service_ecoute: 'qobuz' }, 'home' as any);
    expect(get(ficheArtisteService)).toEqual({ service: null, id: '3671', nom: 'Air' });
    expect(federees, 'le service a été interrogé alors que la bibliothèque avait la fiche').toEqual([]);
  });

  it('introuvable chez le service : le repli PARLE et ouvre la recherche, jamais la Bibliothèque', async () => {
    await ouvrirArtisteDepuis({ name: 'Inconnu du service', service_ecoute: 'qobuz' }, 'home' as any);
    expect(get(activeView)).toBe('search');
    expect(get(pendingSearchQuery)).toBe('Inconnu du service');
    expect(get(ficheArtisteService), 'un artiste au hasard a été ouvert').toBeNull();
  });

  it('sans service connu, le repli d’avant ne change pas (serveur ancien)', async () => {
    await ouvrirArtisteDepuis({ name: 'Gretchen Parlato' }, 'home' as any);
    expect(get(activeView)).toBe('library');
    expect(federees).toEqual([]);
  });

  it('une `source` sans `source_id` garde son ancien chemin — seul `service_ecoute` est lu', async () => {
    await ouvrirArtisteDepuis({ name: 'Gretchen Parlato', source: 'qobuz' }, 'home' as any);
    expect(get(activeView)).toBe('library');
    expect(federees).toEqual([]);
  });
});

describe('#1696 — le geste réel, sur les deux widgets de classement', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;

  beforeEach(() => {
    currentProfileId.set(1);
    currentZoneId.set(1);
  });
  afterEach(() => {
    if (monte) { unmount(monte); monte = null; }
    hote?.remove();
    hote = null;
  });

  async function monter(id: string, cle: string) {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(PageWidgets, {
      target: hote,
      props: { catalogue: [widgetParId(id)!], dispositionDefaut: [id], cle },
    });
    flushSync();
    await souffler(150);
    flushSync();
    return hote;
  }

  it('🔴 « Vos tops » : l’artiste Qobuz ouvre sa fiche Qobuz', async () => {
    const h = await monter('tops', 'accueil_tops_1696_service');
    const colonnes = h.querySelectorAll('.tops .topcol');
    expect(colonnes.length, 'le widget des tops n’a pas rendu ses trois colonnes').toBe(3);
    (colonnes[0].querySelector('li button.toprang') as HTMLButtonElement).click();
    await souffler(150);
    flushSync();
    expect(get(ficheArtisteService)).toEqual({ service: 'qobuz', id: '123456', nom: 'Jo-Yu Chen' });
    expect(get(activeView)).toBe('streamingartist');
  });

  it('🔴 « Artistes les plus écoutés » : le service voyage du classement au clic', async () => {
    const { widgetParId: parId } = await import('../accueilWidgets');
    const w = parId('top-artistes')!;
    const elements: any[] = await w.charger({ langue: 'fr' } as any);
    const jo = elements.find((e) => e.titre === 'Jo-Yu Chen');
    const gretchen = elements.find((e) => e.titre === 'Gretchen Parlato');
    expect(jo?.artisteService, 'le service du classement est perdu en route').toBe('qobuz');
    expect(gretchen?.artisteService, 'un service a été inventé').toBeUndefined();
  });
});
