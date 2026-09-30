// @vitest-environment jsdom
//
// 🔴 #1771 — Historique : le cœur d'un titre de RADIO dans la même case que
// celui des autres titres.
//
// Bertrand, 29/09/2026, 0.9.168, capture de l'Historique à l'appui : « il
// manque le cœur, même non rempli, sur l'Historique pour les titres de radio
// diffusés ». Sur la capture, « Jail Cell » (local) et « I Can't Go For
// That » ont leur cœur dans la barre d'actions, entre l'étiquette et le
// « … » ; « Never before » (radio, zone Eversolo DMP-A8) a cette case VIDE,
// et un petit cœur tout à droite, après « Eversolo DMP-A8 · 10 h ago ».
//
// Cause : la barre (`PisteActions`) ne sait pas désigner un titre de radio
// (`coeurPossible` faux → case vide) ; le cœur radio était rendu par le
// snippet `colonnes` de `HistoriqueV2`, dans la colonne de QUEUE (`apres`),
// après la zone et l'instant.
//
// Ce fichier monte l'écran avec une écoute locale et trois écoutes de radio
// — une à enregistrer, une déjà en favori, une « Episode » que #589 exclut —
// aux trois niveaux, et vérifie :
//   - le cœur de chaque ligne est dans la MÊME case de la barre d'actions ;
//   - aucun cœur ne reste hors de la barre (ni dans la queue) ;
//   - « Episode » garde sa case, vide ;
//   - le clic du cœur radio passe par `POST` / `DELETE /radio-favorites`,
//     celui du cœur local n'y touche pas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import HistoriqueV2 from '../../components/v2/HistoriqueV2.svelte';
import { preferences } from '../stores/preferences';
import type { SettingsLevel } from '../settingLevels';

const LOCALE = { track_id: 4242, title: 'Jail Cell', artist_name: 'Air', album_title: 'Talkie Walkie',
  source: 'local', source_id: null, listened_at: '2026-09-29T10:00:00Z', zone_id: 1 };
const RADIO = { track_id: null, title: 'Never before', artist_name: 'Deep Purple', album_title: 'Radio Témoin',
  source: 'radio', source_id: 'https://exemple.invalid/flux', listened_at: '2026-09-29T09:00:00Z', zone_id: 1 };
const RADIO_FAV = { track_id: null, title: 'Oysters', artist_name: 'Maxwell Farrington', album_title: 'Radio Témoin',
  source: 'radio', source_id: 'https://exemple.invalid/flux', listened_at: '2026-09-29T08:00:00Z', zone_id: 1 };
const EPISODE = { track_id: null, title: 'Episode', artist_name: '', album_title: 'Radio Témoin',
  source: 'radio', source_id: 'https://exemple.invalid/flux', listened_at: '2026-09-29T07:00:00Z', zone_id: 1 };
const ECOUTES = [LOCALE, RADIO, RADIO_FAV, EPISODE];
const FAVORIS = [{ id: 7, title: 'Oysters', artist: 'Maxwell Farrington', station_name: 'Radio Témoin' }];

type Appel = { url: string; methode: string };
let appels: Appel[] = [];

function corpsPour(url: string): unknown {
  if (url.includes('/radio-favorites')) return FAVORIS;
  if (url.includes('/library/history')) return { items: ECOUTES, total: ECOUTES.length };
  if (/\/(zones|devices|profiles|shortcuts|collections|tags)(\?|\/|$)/.test(url)) return [];
  return {};
}

beforeEach(() => {
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (input: any, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input?.url ?? input);
    appels.push({ url, methode: String(init?.method ?? 'GET').toUpperCase() });
    const corps = corpsPour(url);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps, text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const souffler = (ms = 40) => new Promise((r) => setTimeout(r, ms));

async function monter(niveau: SettingsLevel) {
  preferences.update((p) => ({ ...p, settingsLevel: niveau }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(HistoriqueV2, { target: hote });
  flushSync();
  await souffler(120);
  flushSync();
  return hote;
}

/** La ligne (tableau `.trow`, ou ligne `.avecSuffixe`) qui porte ce titre. */
function ligne(racine: HTMLElement, titre: string): HTMLElement {
  const lignes = Array.from(racine.querySelectorAll<HTMLElement>('.trow, .avecSuffixe'));
  const l = lignes.find((x) => x.querySelector('.pactions') && x.textContent?.includes(titre));
  expect(l, `la ligne « ${titre} » n’est pas rendue`).toBeTruthy();
  return l!;
}

/** La case du cœur dans la barre d'actions : son rang, et l'élément. */
function caseDuCoeur(l: HTMLElement) {
  const barre = l.querySelector<HTMLElement>('.pactions')!;
  const cases = Array.from(barre.children) as HTMLElement[];
  const rang = cases.findIndex((c) => c.matches('button.pa.coeur'));
  return { barre, cases, rang, coeur: rang >= 0 ? (cases[rang] as HTMLButtonElement) : null };
}

/** Tout bouton-cœur de la ligne HORS de la barre d'actions. */
function coeursHorsBarre(l: HTMLElement): Element[] {
  return Array.from(l.querySelectorAll('button')).filter(
    (b) => !b.closest('.pactions') && (b.matches('.fav, .coeur') || /favori|favorite/i.test(b.getAttribute('aria-label') ?? '')),
  );
}

describe('#1771 — le cœur radio est dans la case du cœur de la barre d’actions', () => {
  for (const niveau of ['beginner', 'intermediate', 'expert'] as const) {
    it(`🔴 ${niveau} : locale et radio ont leur cœur dans la MÊME case`, async () => {
      const r = await monter(niveau);
      const locale = caseDuCoeur(ligne(r, 'Jail Cell'));
      const radio = caseDuCoeur(ligne(r, 'Never before'));
      const fav = caseDuCoeur(ligne(r, 'Oysters'));

      expect(locale.rang, 'la ligne locale a perdu son cœur').toBeGreaterThanOrEqual(0);
      expect(radio.coeur, 'la ligne de radio n’a PAS de cœur dans la barre d’actions').not.toBeNull();
      expect(radio.rang, 'le cœur radio n’est pas dans la case du cœur').toBe(locale.rang);
      expect(fav.rang).toBe(locale.rang);
      // Même nombre de cases : la barre ne s'est pas allongée d'un cran.
      expect(radio.cases.length).toBe(locale.cases.length);

      // Vide ou plein selon l'état du favori radio.
      expect(radio.coeur!.classList.contains('on'), '« Never before » n’est pas en favori').toBe(false);
      expect(radio.coeur!.querySelector('svg')!.getAttribute('fill')).toBe('none');
      expect(fav.coeur!.classList.contains('on'), '« Oysters » est en favori : cœur plein').toBe(true);
      expect(fav.coeur!.querySelector('svg')!.getAttribute('fill')).toBe('currentColor');
    });

    it(`🔴 ${niveau} : aucun cœur ne reste hors de la barre d’actions`, async () => {
      const r = await monter(niveau);
      for (const t of ['Jail Cell', 'Never before', 'Oysters', 'Episode']) {
        expect(coeursHorsBarre(ligne(r, t)), `« ${t} » porte un cœur hors de la barre`).toEqual([]);
      }
      expect(r.querySelectorAll('button.fav').length, 'l’ancien cœur de queue est encore rendu').toBe(0);
    });

    it(`${niveau} : « Episode » (#589) n’a pas de cœur, mais garde sa case`, async () => {
      const r = await monter(niveau);
      const locale = caseDuCoeur(ligne(r, 'Jail Cell'));
      const ep = caseDuCoeur(ligne(r, 'Episode'));
      expect(ep.coeur, '« Episode » ne doit pas être enregistrable').toBeNull();
      expect(ep.cases.length).toBe(locale.cases.length);
      expect(ep.cases[locale.rang].matches('span.pa.vide'), 'la case du cœur a disparu').toBe(true);
    });
  }

  it('🔴 le clic du cœur radio passe par POST puis DELETE /radio-favorites', async () => {
    const r = await monter('beginner');
    const radio = caseDuCoeur(ligne(r, 'Never before')).coeur!;
    appels = [];
    radio.click();
    await souffler(60);
    flushSync();
    expect(
      appels.some((a) => a.methode === 'POST' && /\/radio-favorites(\?|$)/.test(a.url)),
      'le cœur radio n’a pas appelé POST /radio-favorites',
    ).toBe(true);

    const fav = caseDuCoeur(ligne(r, 'Oysters')).coeur!;
    appels = [];
    fav.click();
    await souffler(60);
    flushSync();
    expect(
      appels.some((a) => a.methode === 'DELETE' && /\/radio-favorites\/7$/.test(a.url)),
      'le cœur plein n’a pas appelé DELETE /radio-favorites/7',
    ).toBe(true);
  });

  it('le clic du cœur local ne touche pas aux favoris radio', async () => {
    const r = await monter('beginner');
    const locale = caseDuCoeur(ligne(r, 'Jail Cell')).coeur!;
    appels = [];
    locale.click();
    await souffler(60);
    expect(appels.filter((a) => a.methode !== 'GET' && a.url.includes('/radio-favorites'))).toEqual([]);
  });
});
