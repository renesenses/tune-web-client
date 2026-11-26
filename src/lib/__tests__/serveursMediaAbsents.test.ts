// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { fr } from './onzeDictionnaires';
import { get } from 'svelte/store';
import { tn, locale } from '../i18n';
import MediaServersV2 from '../../components/v2/MediaServersV2.svelte';
import {
  depuisSecondes, etiquetteServeur, ongletParDefaut, repartirParPresence,
} from '../presenceServeursMedia';
import type { MediaServer } from '../types';

/**
 * Réseau › Serveurs multimédia : des « doublons » qui étaient des ABSENTS.
 *
 * Bertrand, 27/09/2026 : 11 pastilles sur le .18, « 192.168.1.19 » deux fois,
 * « 192.168.1.41 TUNE » quatre fois. `/network/media-servers` rend le registre
 * durable, absents compris (`presence: 'absent'`, `last_seen_secs`) ; l'écran
 * peignait tout le registre en pastilles, sans le port, et ouvrait d'office le
 * premier élément, absent ou non.
 *
 * On MONTE l'écran : le défaut est un affichage, seul le DOM rendu le garde.
 */
const DELAI_MONTAGE = 60_000;
const JOUR = 86_400;

function serveur(id: string, host: string, port: number, extra: Partial<MediaServer> = {}): MediaServer {
  return { id, name: id, host, port, manufacturer: 'Tiers', model: 'Tiers', ...extra };
}

// L'ordre compte : un ABSENT en tête, pour prouver qu'il ne s'ouvre pas d'office.
const REGISTRE: MediaServer[] = [
  serveur('sonos-ms', '192.168.1.19', 1400, { presence: 'absent', last_seen_secs: 3 * JOUR, name: 'Sonos _MS' }),
  serveur('dlna-41', '192.168.1.41', 8200, { presence: 'present', last_seen_secs: 5 }),
  serveur('asset', '192.168.1.19', 26125, { presence: 'absent', last_seen_secs: 12 * JOUR, name: 'Asset UPnP' }),
  serveur('autre-41', '192.168.1.41', 9000, { presence: 'present', last_seen_secs: 8 }),
  serveur('test-8896', '192.168.1.41', 8896, { presence: 'absent', last_seen_secs: 2 * 3600 }),
];

const RACINE = {
  object_id: '0', containers: [{ id: 'musique', title: 'Musique', child_count: 3 }],
  items: [], total_matches: 1, number_returned: 1,
};

function json(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

let registre: MediaServer[];
let parcourus: string[];
let cible: HTMLElement;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  registre = REGISTRE;
  parcourus = [];
  vi.stubGlobal('fetch', vi.fn(async (entree: RequestInfo | URL) => {
    const url = String(entree);
    const b = url.match(/\/network\/media-servers\/([^/]+)\/browse/);
    if (b) { parcourus.push(decodeURIComponent(b[1])); return json(RACINE); }
    if (/\/network\/media-servers(\?|$)/.test(url)) {
      return json({ absent_apres_secs: 600, items: registre, proposables: [], total: registre.length });
    }
    return json({ items: [] });
  }));
  cible = document.createElement('div');
  document.body.appendChild(cible);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  cible.remove();
  vi.unstubAllGlobals();
});

async function ouvrir(): Promise<HTMLElement> {
  monte = mount(MediaServersV2, { target: cible, props: {} });
  flushSync();
  await vi.waitFor(() => {
    if (!cible.querySelector('.svcs button.srv')) throw new Error('cartes pas encore affichées');
  });
  flushSync();
  return cible;
}

/** L'étiquette d'adresse de chaque carte de serveur présent (harmonisation
 *  rc14 : cartes à la place des pastilles, l'IP en petit sous le nom). */
const pastilles = (r: HTMLElement) =>
  [...r.querySelectorAll<HTMLElement>('.svcs button.srv .ip')].map((b) => (b.textContent ?? '').trim());
/** La carte repliable des absents, et la liste qu'elle déplie. */
const carteAbsents = (r: HTMLElement) => r.querySelector<HTMLButtonElement>('.svcs button.srv-absents');
function deplierAbsents(r: HTMLElement): HTMLElement {
  carteAbsents(r)!.click();
  flushSync();
  return r.querySelector<HTMLElement>('.absents')!;
}

describe('carte des absents : pluriel (« 1 absents » corrigé)', () => {
  it('1 absent au singulier, 3 absents au pluriel, polonais à 4 formes', () => {
    locale.set('fr');
    expect(get(tn)('v2.ms.absentCard', 1)).toBe('1 absent');
    expect(get(tn)('v2.ms.absentHint', 1)).toBe('Pas vu récemment');
    expect(get(tn)('v2.ms.absentCard', 3)).toBe('3 absents');
    expect(get(tn)('v2.ms.absentHint', 3)).toBe('Pas vus récemment');
    locale.set('pl');
    expect(get(tn)('v2.ms.absentCard', 5)).toBe('5 nieobecnych');
    locale.set('fr');
  });
});

describe('serveurs multimédia absents', () => {
  it('2 présents et 3 absents : 2 pastilles distinguées par le port, et « Absents (3) » replié',
    { timeout: DELAI_MONTAGE }, async () => {
      const racine = await ouvrir();

      expect(pastilles(racine), 'les absents sont peints en pastilles').toEqual(['192.168.1.41:8200', '192.168.1.41:9000']);

      const carte = carteAbsents(racine);
      expect(carte, 'aucune carte des absents').not.toBeNull();
      // Pluriel ICU via $tn : « 3 absents · Pas vus récemment », jamais « {n, plural… ».
      expect(carte!.textContent).toContain('3 absents');
      expect(carte!.textContent).toContain('Pas vus récemment');
      expect(carte!.textContent).not.toContain('plural');
      expect(carte!.getAttribute('aria-expanded'), 'les absents doivent être repliés par défaut').toBe('false');
      expect(racine.querySelector('.absents')).toBeNull();

      const groupe = deplierAbsents(racine);
      const absents = [...groupe.querySelectorAll<HTMLButtonElement>('button.absent')];
      expect(absents.length).toBe(3);
      expect(absents[0].textContent).toContain('192.168.1.19:1400');
      expect(absents[0].textContent).toContain('vu il y a 3 j');
      expect(absents[2].textContent).toContain('vu il y a 2 h');
    });

  it('la sélection d’office tombe sur le premier PRÉSENT, jamais sur un absent',
    { timeout: DELAI_MONTAGE }, async () => {
      const racine = await ouvrir();
      const on = racine.querySelector('.svcs button.srv.on');
      expect(on, 'aucun onglet présent ouvert d’office').not.toBeNull();
      expect(on!.textContent).toContain('192.168.1.41:8200');
      await vi.waitFor(() => { if (!parcourus.length) throw new Error('aucun parcours'); });
      expect(parcourus).not.toContain('sonos-ms');
    });

  it('un absent reste cliquable : pas de parcours, mais le retrait de la bibliothèque reste là',
    { timeout: DELAI_MONTAGE }, async () => {
      const racine = await ouvrir();
      await vi.waitFor(() => { if (!parcourus.length) throw new Error('aucun parcours'); });
      deplierAbsents(racine).querySelector<HTMLButtonElement>('button.absent')!.click();
      flushSync();
      await vi.waitFor(() => {
        if (!(racine.textContent ?? '').includes(fr['v2.ms.absentHere'])) throw new Error('pas d’annonce d’absence');
      });
      expect(racine.querySelector('.idx.danger'), 'le retrait doit rester accessible').not.toBeNull();
      expect(parcourus, 'un absent ne se parcourt pas').not.toContain('sonos-ms');
      expect(racine.querySelector('.err'), 'aucun bandeau d’erreur pour un absent').toBeNull();
    });

  it('un serveur ancien sans `presence` : tout reste présent, sans groupe des absents',
    { timeout: DELAI_MONTAGE }, async () => {
      registre = REGISTRE.map(({ presence: _p, last_seen_secs: _l, ...s }) => s as MediaServer);
      const racine = await ouvrir();
      expect(pastilles(racine).length).toBe(5);
      expect(carteAbsents(racine)).toBeNull();
    });
});

describe('presenceServeursMedia', () => {
  it('répartit, étiquette et choisit l’onglet', () => {
    const { presents, absents } = repartirParPresence(REGISTRE);
    expect(presents.map((s) => s.id)).toEqual(['dlna-41', 'autre-41']);
    expect(absents.map((s) => s.id)).toEqual(['sonos-ms', 'asset', 'test-8896']);
    // Un hôte seul parmi les présents garde son étiquette courte.
    const seul = serveur('seul', '192.168.1.50', 8200);
    expect(etiquetteServeur(seul, [seul, ...presents])).toBe('192.168.1.50');
    expect(etiquetteServeur(presents[0], presents)).toBe('192.168.1.41:8200');
    expect(ongletParDefaut(null, REGISTRE)).toBe('dlna-41');
    expect(ongletParDefaut('asset', REGISTRE), 'un choix explicite est gardé').toBe('asset');
    expect(ongletParDefaut(null, absents)).toBeNull();
  });

  it('« il y a X » depuis `last_seen_secs`', () => {
    const t = (c: string) => (fr as Record<string, string>)[c];
    expect(depuisSecondes(30, t)).toBe(fr['v2.hist.justNow']);
    expect(depuisSecondes(5 * 60, t)).toBe('il y a 5 min');
    expect(depuisSecondes(12 * JOUR, t)).toBe('il y a 12 j');
    expect(depuisSecondes(undefined, t)).toBeNull();
  });
});
