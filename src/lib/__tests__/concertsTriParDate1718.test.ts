// @vitest-environment jsdom
//
// jsdom : la seconde moitié du banc monte l'écran, et sans `window` `onMount`
// ne se déclencherait pas — un vert qui n'aurait rien exécuté.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ConcertsView from '../../components/v2-heritage/ConcertsView.svelte';
import { grouperConcerts, normaliserTriConcerts, TRI_CONCERTS_DEFAUT } from '../concertsTri';
import type { Concert } from '../api';
import { preparerLocale } from '../i18n';
import { activeView } from '../stores/navigation';
import { concertsPlugin } from '../stores/concerts';
import { preferences } from '../stores/preferences';
import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';
import hu from '../locales/hu';

/**
 * Concerts : trier la liste par date de concert — web#1718.
 *
 * FabienM, fil 2013, point 1 : « permettre de trier sur la date de concert
 * pour afficher les artistes qui se produisent dans les prochaines dates ».
 * L'écran groupait par artiste et rangeait par NOM ; l'ordre chronologique
 * n'existait nulle part sur cet écran.
 *
 * Ce banc porte sur des DONNÉES — listes en entrée, ordre en sortie — et non
 * sur la lecture du source : le tri vit dans `lib/concertsTri.ts`, une
 * fonction pure, et c'est elle qu'on mesure.
 */

const c = (artist_name: string, event_date: string, city = '', venue = ''): Concert => ({
  artist_name,
  event_date,
  city,
  venue,
  country: 'FR',
  event_url: null,
});

/** Volontairement DÉSORDONNÉE, et volontairement pas dans l'ordre alphabétique :
 *  une liste déjà triée ne prouverait ni l'un ni l'autre des deux ordres. */
const LISTE: Concert[] = [
  c('Radiohead', '2026-11-02', 'Paris', 'Accor Arena'),
  c('Air', '2027-01-05', 'Nantes', 'Le Zénith'),
  c('Radiohead', '2026-10-04', 'Lyon', 'Halle Tony Garnier'),
  c('Bertrand Belin', '2026-12-20', 'Dijon', 'La Vapeur'),
  c('Air', '2026-10-20', 'Rennes', 'Le Liberté'),
];

const dates = (l: ReturnType<typeof grouperConcerts>) =>
  l.flatMap((g) => g.concerts.map((x) => x.event_date));
const artistes = (l: ReturnType<typeof grouperConcerts>) => l.map((g) => g.artiste);

describe('grouperConcerts — l’ordre demandé, mesuré sur les données', () => {
  it('🔴 « par date » rend les concerts du plus proche au plus lointain', () => {
    expect(dates(grouperConcerts(LISTE, 'date'))).toEqual([
      '2026-10-04',
      '2026-10-20',
      '2026-11-02',
      '2026-12-20',
      '2027-01-05',
    ]);
  });

  it('« par date » garde une ligne par concert, chacune nommant son artiste', () => {
    const g = grouperConcerts(LISTE, 'date');
    expect(g).toHaveLength(LISTE.length);
    expect(artistes(g)).toEqual(['Radiohead', 'Air', 'Radiohead', 'Bertrand Belin', 'Air']);
    expect(g.every((x) => x.concerts.length === 1)).toBe(true);
  });

  it('« par artiste » reste l’ordre d’origine : groupes rangés par nom', () => {
    const g = grouperConcerts(LISTE, 'artiste');
    expect(artistes(g)).toEqual(['Air', 'Bertrand Belin', 'Radiohead']);
    expect(g.map((x) => x.concerts.length)).toEqual([2, 1, 2]);
  });

  it('dans un groupe d’artiste, la prochaine date vient en premier', () => {
    const air = grouperConcerts(LISTE, 'artiste')[0];
    expect(air.artiste).toBe('Air');
    expect(air.concerts.map((x) => x.event_date)).toEqual(['2026-10-20', '2027-01-05']);
  });

  it('le défaut est « par artiste » : l’écran de qui n’a rien demandé ne bouge pas', () => {
    expect(TRI_CONCERTS_DEFAUT).toBe('artiste');
    expect(artistes(grouperConcerts(LISTE))).toEqual(artistes(grouperConcerts(LISTE, 'artiste')));
  });

  it('un tri inconnu ou absent retombe sur l’ordre d’origine, il ne vide rien', () => {
    for (const mauvais of [undefined, null, '', 'chronologique', 42, {}]) {
      expect(normaliserTriConcerts(mauvais)).toBe('artiste');
      expect(grouperConcerts(LISTE, mauvais)).toHaveLength(3);
    }
  });

  it('les clés de boucle sont uniques, même sur deux lignes jumelles', () => {
    const jumelles = [c('Air', '2026-10-20', 'Rennes', 'Le Liberté'), c('Air', '2026-10-20', 'Rennes', 'Le Liberté')];
    const cles = grouperConcerts(jumelles, 'date').map((g) => g.cle);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it('une date vide ou mal formée passe en FIN de liste, elle ne disparaît pas', () => {
    const avecTrou = [...LISTE, c('Zone Libre', ''), c('Yves Jamait', 'bientôt')];
    const g = grouperConcerts(avecTrou, 'date');
    expect(g).toHaveLength(avecTrou.length);
    expect(artistes(g).slice(-2).sort()).toEqual(['Yves Jamait', 'Zone Libre']);
    expect(dates(g).slice(0, 5)).toEqual([
      '2026-10-04',
      '2026-10-20',
      '2026-11-02',
      '2026-12-20',
      '2027-01-05',
    ]);
  });

  it('la liste reçue n’est jamais triée sur place', () => {
    const copie = [...LISTE];
    grouperConcerts(copie, 'date');
    grouperConcerts(copie, 'artiste');
    expect(copie.map((x) => x.event_date)).toEqual(LISTE.map((x) => x.event_date));
  });

  it('une liste vide, nulle ou absente ne rend aucun groupe', () => {
    expect(grouperConcerts([], 'date')).toEqual([]);
    expect(grouperConcerts(null, 'date')).toEqual([]);
    expect(grouperConcerts(undefined, 'artiste')).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */

type Dict = Record<string, string | undefined>;

const LANGUES: Array<[string, Dict]> = [
  ['fr', fr as Dict],
  ['en', en as Dict],
  ['de', de as Dict],
  ['es', es as Dict],
  ['it', it_ as Dict],
  ['ja', ja as Dict],
  ['ko', ko as Dict],
  ['ro', ro as Dict],
  ['sv', sv as Dict],
  ['zh', zh as Dict],
  ['hu', hu as Dict],
];

const CLES = ['concerts.trier', 'concerts.triArtiste', 'concerts.triDate'] as const;

describe('les libellés du tri des concerts, dans les onze langues', () => {
  it('les onze langues sont couvertes par ce test', () => {
    expect(LANGUES).toHaveLength(11);
  });

  for (const [nom, dict] of LANGUES) {
    for (const cle of CLES) {
      it(`${nom} traduit ${cle}`, () => {
        const valeur = dict[cle];
        expect(valeur, `${cle} manque en ${nom}`).toBeDefined();
        expect(String(valeur).trim().length).toBeGreaterThan(0);
        expect(valeur).not.toBe(cle);
      });
    }
  }

  it('les deux pastilles ne se confondent dans aucune langue', () => {
    for (const [nom, dict] of LANGUES) {
      expect(dict['concerts.triArtiste'], `pastilles indiscernables en ${nom}`)
        .not.toBe(dict['concerts.triDate']);
    }
  });

  it('le français porte ses accents', () => {
    expect(fr['concerts.triDate']).toBe('Par date');
    expect(hu['concerts.trier']).toBe('Rendezés');
  });
});

/* ------------------------------------------------------------------ */

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  vi.useFakeTimers();
  concertsPlugin.set({ name: 'concerts', installed: true, enabled: true });
  activeView.set('concerts');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('/ext/concerts/upcoming')) {
      return reponse(200, { concerts: LISTE, scope: 'country', country: 'FR' });
    }
    if (u.includes('/ext/concerts/location')) {
      return reponse(200, { scope: 'country', city: 'Dijon', country: 'FR', radius_km: 100, located: true });
    }
    return reponse(200, {});
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  // APRÈS le doublage de `fetch` : chaque écriture de préférence part en PATCH,
  // et on ne veut pas d'un appel réel dans un banc.
  preferences.update((p) => ({ ...p, concertsTri: 'artiste' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  preferences.update((p) => ({ ...p, concertsTri: 'artiste' }));
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function laisserFaire() {
  for (let i = 0; i < 8; i++) {
    await vi.advanceTimersByTimeAsync(0);
    flushSync();
  }
}

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ConcertsView as never, { target: hote });
  flushSync();
  await laisserFaire();
  return hote;
}

const entetes = (el: HTMLElement) =>
  [...el.querySelectorAll('.cc-liste > li > h3')].map((h) => (h.textContent ?? '').trim());
const datesAffichees = (el: HTMLElement) =>
  [...el.querySelectorAll('.cc-liste .cc-date')].map((d) => (d.textContent ?? '').trim());
const bouton = (el: HTMLElement, libelle: string) =>
  [...el.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === libelle) as HTMLButtonElement | undefined;

describe('Concerts — la bascule de tri à l’écran', () => {
  it('s’ouvre groupé par artiste, et propose les deux ordres', async () => {
    const el = await poser();
    expect(entetes(el)).toEqual(['Air', 'Bertrand Belin', 'Radiohead']);
    expect(bouton(el, fr['concerts.triArtiste'])!.classList.contains('actif')).toBe(true);
    expect(bouton(el, fr['concerts.triDate'])!.classList.contains('actif')).toBe(false);
  });

  it('🔴 « Par date » réordonne la liste du plus proche au plus lointain', async () => {
    const el = await poser();
    bouton(el, fr['concerts.triDate'])!.click();
    await laisserFaire();
    expect(entetes(el)).toEqual(['Radiohead', 'Air', 'Radiohead', 'Bertrand Belin', 'Air']);
    // Les dates affichées suivent — comparées au rendu attendu, jamais
    // reparsées : `toLocaleDateString()` ne rend pas le même ordre de champs
    // selon la locale du moteur, et un banc qui devine ne garde rien.
    const attendues = ['2026-10-04', '2026-10-20', '2026-11-02', '2026-12-20', '2027-01-05']
      .map((iso) => new Date(`${iso}T00:00:00`).toLocaleDateString());
    expect(datesAffichees(el)).toEqual(attendues);
  });

  it('le choix est RETENU comme les autres réglages d’affichage', async () => {
    const el = await poser();
    bouton(el, fr['concerts.triDate'])!.click();
    await laisserFaire();
    expect(get(preferences).concertsTri).toBe('date');
    // Rouvrir l'écran : il rouvre sur l'ordre choisi, pas sur le défaut.
    unmount(monte!); monte = null; hote?.remove(); hote = null;
    const rouvert = await poser();
    expect(bouton(rouvert, fr['concerts.triDate'])!.classList.contains('actif')).toBe(true);
    expect(entetes(rouvert)).toEqual(['Radiohead', 'Air', 'Radiohead', 'Bertrand Belin', 'Air']);
    void el;
  });

  it('on revient à l’ordre par artiste, et le choix se réenregistre', async () => {
    const el = await poser();
    bouton(el, fr['concerts.triDate'])!.click();
    await laisserFaire();
    bouton(el, fr['concerts.triArtiste'])!.click();
    await laisserFaire();
    expect(get(preferences).concertsTri).toBe('artiste');
    expect(entetes(el)).toEqual(['Air', 'Bertrand Belin', 'Radiohead']);
  });
});
