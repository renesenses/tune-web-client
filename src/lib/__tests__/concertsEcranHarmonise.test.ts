// @vitest-environment jsdom
//
// rc14 — l'écran Concerts harmonisé (maquette `concerts.html`, 26/11/2026),
// mesuré à l'écran : en-tête, pastilles, liste des pays avec recherche,
// blocs par mois, cartes (bloc date, photo ou initiales, lieu en casse de
// titre, « Billets » en lien externe).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ConcertsView from '../../components/v2-heritage/ConcertsView.svelte';
import { preparerLocale } from '../i18n';
import { activeView } from '../stores/navigation';
import { concertsPlugin } from '../stores/concerts';
import { artists } from '../stores/library';
import fr from '../locales/fr';
import { preferences } from '../stores/preferences';
import { boutonChoix, choisirDans } from './aides/choixConcerts';

const CONCERTS = [
  { artist_name: 'Calogero', event_date: '2026-12-11', city: 'Chalon Sur Saone', venue: 'PARC DES EXPOSITIONS', event_url: 'https://billets.example/2' },
  { artist_name: 'Calogero', event_date: '2026-12-09', city: 'Montmorot', venue: 'JURAPARC', event_url: 'https://billets.example/1' },
  { artist_name: 'Bernard Lavilliers', event_date: '2027-02-18', city: 'Dijon', venue: 'ZENITH DE DIJON', event_url: null },
];

type Appel = { url: string; method: string; body: unknown };
let appels: Appel[] = [];
let artistesServeur: unknown;

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

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  preferences.update((p) => ({ ...p, concertsLieu: 'plus-tard', concertsTri: null }));
  artists.set([]);
  artistesServeur = { items: [{ id: 1, name: 'Calogero', image_path: '/library/artists/1/image' }, { id: 2, name: 'Bernard Lavilliers', image_path: null }] };
  vi.useFakeTimers();
  appels = [];
  concertsPlugin.set({ name: 'concerts', installed: true, enabled: true });
  activeView.set('concerts');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = (init?.method ?? 'GET').toUpperCase();
      appels.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (u.includes('/ext/concerts/upcoming')) return reponse(200, { concerts: CONCERTS, scope: 'country', country: 'FR', total: 3 });
      if (u.includes('/ext/concerts/location')) {
        if (method === 'POST') {
          const b = JSON.parse(String(init?.body));
          return reponse(200, { scope: b.scope, city: b.city, country: b.country, radius_km: b.radius_km, located: true });
        }
        return reponse(200, { scope: 'country', city: 'Dijon', postal_code: null, country: 'FR', radius_km: 100 });
      }
      if (u.includes('/library/artists')) return reponse(200, artistesServeur);
      return reponse(200, {});
    }),
  );
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as unknown as typeof WebSocket);
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function laisserFaire() {
  for (let i = 0; i < 10; i++) {
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

const posts = () => appels.filter((a) => a.url.includes('/ext/concerts/location') && a.method === 'POST');

describe('Concerts harmonisé — en-tête et périmètre', () => {
  it('l’en-tête commun : sur-titre, titre et sous-titre, alignés à gauche', async () => {
    const el = await poser();
    const tete = el.querySelector('header.v2-top')!;
    expect(tete).not.toBeNull();
    expect(tete.querySelector('.v2-eyebrow')!.textContent).toBe(fr['concerts.surtitre']);
    expect(tete.querySelector('h1')!.textContent).toBe(fr['concerts.titre']);
    expect(tete.querySelector('.cc-sous')!.textContent).toBe(fr['concerts.sousTitre']);
  });

  it('les trois crans sont des pastilles, l’actif annoncé par `aria-pressed`', async () => {
    const el = await poser();
    const pastilles = [...el.querySelectorAll('.cc-crans .cc-pastille')];
    expect(pastilles).toHaveLength(3);
    expect(pastilles.map((p) => p.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
  });

  it('plus aucun `<select>` natif : pays et rayon sont des listes au style Tune', async () => {
    const el = await poser();
    (el.querySelector('.cc-crans .cc-pastille') as HTMLButtonElement).click();
    await laisserFaire();
    expect(el.querySelector('select')).toBeNull();
    expect(boutonChoix(el.querySelector('.cc-pays'))).not.toBeNull();
    expect(boutonChoix(el.querySelector('.cc-rayon'))).not.toBeNull();
    // Le formulaire tient sur une ligne : pays, commune, code postal, rayon, Appliquer.
    const ligne = el.querySelector('.cc-formulaire')!;
    expect(ligne.querySelector('.cc-commune .cc-principal')!.textContent!.trim()).toBe(fr['concerts.appliquer']);
    expect(el.querySelector('.cc-sans-frontiere')!.textContent).toBe(fr['concerts.aideUneLigne']);
  });

  it('la recherche de pays filtre la liste, et choisir enregistre sous « Dans mon pays »', async () => {
    const el = await poser();
    const pays = el.querySelector('.cc-pays')!;
    boutonChoix(pays)!.click();
    flushSync();
    const champ = pays.querySelector('.cc-choix-recherche input') as HTMLInputElement;
    expect(champ.getAttribute('placeholder')).toBe(fr['concerts.chercherPays']);
    champ.value = 'suis';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    const options = [...pays.querySelectorAll('.cc-choix-option')].map((o) => o.getAttribute('data-valeur'));
    expect(options).toEqual(['CH']);
    champ.value = 'zzz';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(pays.querySelector('.cc-choix-vide')!.textContent).toBe(fr['concerts.aucunPays']);
    boutonChoix(pays)!.click();
    flushSync();
    choisirDans(pays, 'BE');
    await laisserFaire();
    expect(posts()).toHaveLength(1);
    expect(posts()[0].body).toMatchObject({ scope: 'country', country: 'BE' });
  });

  it('la liste se ferme à Échap, et le pays courant est coché', async () => {
    const el = await poser();
    const pays = el.querySelector('.cc-pays')!;
    boutonChoix(pays)!.click();
    flushSync();
    expect(pays.querySelector('.cc-choix-option.sel')!.getAttribute('data-valeur')).toBe('FR');
    expect(pays.querySelector('.cc-choix-option.sel')!.getAttribute('aria-selected')).toBe('true');
    pays.querySelector('.cc-choix')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    expect(pays.querySelector('.cc-choix-liste')).toBeNull();
  });
});

describe('Concerts harmonisé — la liste en cartes', () => {
  it('« Par date » : un bloc par mois, avec son compte au pluriel', async () => {
    const el = await poser();
    const blocs = [...el.querySelectorAll('.cc-liste > li.cc-bloc')];
    expect(blocs.map((b) => b.querySelector('h3')!.textContent)).toEqual(['Décembre 2026', 'Février 2027']);
    expect(blocs.map((b) => b.querySelector('.cc-bloc-n')!.textContent)).toEqual(['2 concerts', '1 concert']);
    // Dans le mois, la plus proche d'abord.
    expect([...blocs[0].querySelectorAll('.cc-date')].map((d) => d.getAttribute('datetime')))
      .toEqual(['2026-12-09', '2026-12-11']);
  });

  it('la carte : bloc date, artiste, ville · salle en casse de titre', async () => {
    const el = await poser();
    const carte = el.querySelector('.cc-carte')!;
    expect(carte.querySelector('.cc-date-j')!.textContent).toBe('09');
    expect(carte.querySelector('.cc-date-m')!.textContent).toBe('DÉC');
    expect(carte.querySelector('.cc-artiste')!.textContent).toBe('Calogero');
    expect(carte.querySelector('.cc-lieu')!.textContent).toBe('Montmorot · Juraparc');
    const lieux = [...el.querySelectorAll('.cc-lieu')].map((l) => l.textContent);
    expect(lieux).toContain('Dijon · Zenith de Dijon');
    // Un nom qui a déjà des minuscules n'est pas retouché.
    expect(lieux).toContain('Chalon Sur Saone · Parc des Expositions');
  });

  it('« Billets » est un lien externe, et n’apparaît pas sans adresse', async () => {
    const el = await poser();
    const liens = [...el.querySelectorAll('a.cc-billets')] as HTMLAnchorElement[];
    expect(liens).toHaveLength(2);
    expect(liens[0].getAttribute('href')).toBe('https://billets.example/1');
    expect(liens[0].getAttribute('target')).toBe('_blank');
    expect(liens[0].getAttribute('rel')).toContain('noopener');
    expect(liens[0].textContent!.trim()).toBe(fr['concerts.billets']);
  });

  it('photo de l’artiste si la bibliothèque en a une, sinon ses initiales', async () => {
    const el = await poser();
    expect(appels.filter((a) => a.url.includes('/library/artists'))).toHaveLength(1);
    const cartes = [...el.querySelectorAll('.cc-carte')];
    const de = (nom: string) => cartes.find((c) => c.querySelector('.cc-artiste')!.textContent === nom)!;
    expect(de('Calogero').querySelector('.cc-initiales')).toBeNull();
    expect(de('Bernard Lavilliers').querySelector('.cc-initiales')!.textContent).toBe('BL');
  });

  it('les artistes déjà chargés par la bibliothèque servent sans nouvelle demande', async () => {
    artists.set([{ id: 9, name: 'Bernard Lavilliers', image_path: '/library/artists/9/image' }] as never);
    const el = await poser();
    expect(appels.filter((a) => a.url.includes('/library/artists'))).toHaveLength(0);
    expect(el.querySelectorAll('.cc-initiales')).toHaveLength(2);
  });

  it('l’échec de la liste des artistes ne coûte que les photos', async () => {
    artistesServeur = null;
    const el = await poser();
    expect(el.querySelectorAll('.cc-carte')).toHaveLength(3);
    expect(el.querySelectorAll('.cc-initiales')).toHaveLength(3);
  });

  it('« Par artiste » : un bloc par artiste, le tri By date / By artist est gardé', async () => {
    const el = await poser();
    const parArtiste = [...el.querySelectorAll('.cc-tri button')].find((b) => b.textContent!.trim() === fr['concerts.triArtiste']) as HTMLButtonElement;
    parArtiste.click();
    await laisserFaire();
    const blocs = [...el.querySelectorAll('.cc-liste > li.cc-bloc')];
    expect(blocs.map((b) => b.querySelector('h3')!.textContent)).toEqual(['Bernard Lavilliers', 'Calogero']);
    expect(blocs[1].querySelector('.cc-bloc-n')!.textContent).toBe('2 concerts');
    expect(parArtiste.getAttribute('aria-pressed')).toBe('true');
  });
});
