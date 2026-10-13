// @vitest-environment jsdom
/**
 * web#2166 (serveur : tune-server-rust#6257) — réorganiser les étiquettes.
 *
 * Le serveur n'avait aucune notion d'ordre : toutes les listes sortaient par
 * nom. Il range désormais les étiquettes selon l'ordre enregistré par
 * `PUT /tags/order`. Ce banc garde le côté client :
 *
 * 1. les gestes purs (`deplacer`, `rangVise`, `selonOrdre`) ;
 * 2. la page Étiquettes MONTÉE : Alt + flèche et glisser-déposer réordonnent
 *    l'écran ET envoient l'ordre complet ; un échec reprend l'ordre d'avant ;
 * 3. partout ailleurs, l'ordre du serveur n'est plus défait par un tri par
 *    nom (éditeurs de règles « Étiquette »).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import EtiquettesV2 from '../../components/v2/EtiquettesV2.svelte';
import { locale } from '../i18n';
import { deplacer, rangVise, selonOrdre } from '../ordreEtiquettes';

vi.setConfig({ testTimeout: 30_000 });

describe('web#2166 — les gestes purs', () => {
  it('deplacer déplace un élément et borne la cible', () => {
    expect(deplacer(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(deplacer(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(deplacer(['a', 'b', 'c'], 1, 9)).toEqual(['a', 'c', 'b']);
    expect(deplacer(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });

  it('rangVise : Alt + flèche, Alt + Début / Fin ; sans Alt, rien', () => {
    expect(rangVise({ key: 'ArrowRight', altKey: true }, 0, 3)).toBe(1);
    expect(rangVise({ key: 'ArrowDown', altKey: true }, 1, 3)).toBe(2);
    expect(rangVise({ key: 'ArrowLeft', altKey: true }, 2, 3)).toBe(1);
    expect(rangVise({ key: 'ArrowUp', altKey: true }, 0, 3)).toBeNull();
    expect(rangVise({ key: 'ArrowRight', altKey: true }, 2, 3)).toBeNull();
    expect(rangVise({ key: 'Home', altKey: true }, 2, 3)).toBe(0);
    expect(rangVise({ key: 'End', altKey: true }, 0, 3)).toBe(2);
    expect(rangVise({ key: 'ArrowRight', altKey: false }, 0, 3)).toBeNull();
  });

  it('selonOrdre range selon la référence, l’inconnu à la fin', () => {
    const ref = [{ id: 3 }, { id: 1 }, { id: 2 }];
    expect(selonOrdre([{ id: 1 }, { id: 9 }, { id: 2 }, { id: 3 }], ref).map((x) => x.id))
      .toEqual([3, 1, 2, 9]);
  });
});

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 10) {
  for (let i = 0; i < n; i++) { await respirer(); flushSync(); }
}

let tags: { id: number; name: string; color: string }[] = [];
let ordres: number[][] = [];
let ordreRefuse = false;
let hote: HTMLDivElement;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  tags = [
    { id: 1, name: 'Ambient', color: '' },
    { id: 2, name: 'Blues', color: '' },
    { id: 3, name: 'Cool jazz', color: '' },
  ];
  ordres = [];
  ordreRefuse = false;
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const methode = (init?.method ?? 'GET').toUpperCase();
    let charge: unknown = {};
    let status = 200;
    if (methode === 'PUT' && /\/tags\/order$/.test(url)) {
      if (ordreRefuse) {
        status = 404;
        charge = { detail: 'Not Found' };
      } else {
        const ids: number[] = JSON.parse(String(init?.body ?? '{}')).ids;
        ordres.push(ids);
        tags = ids.map((id) => tags.find((x) => x.id === id)!);
        status = 204;
        charge = '';
      }
    } else if (methode === 'GET' && /\/tags\/?(\?.*)?$/.test(url)) {
      charge = tags;
    }
    return {
      ok: status < 400, status,
      statusText: status === 404 ? 'Not Found' : 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => (charge === '' ? '' : JSON.stringify(charge)),
      json: async () => charge,
    } as unknown as Response;
  }));
  hote = document.createElement('div');
  document.body.append(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote.remove();
  vi.unstubAllGlobals();
});

const noms = () => [...hote.querySelectorAll('.liste .tag .nom')].map((e) => e.textContent?.trim() ?? '');
const bouton = (nom: string) =>
  [...hote.querySelectorAll<HTMLButtonElement>('.liste .tag')].find((b) => b.textContent?.includes(nom))!;
const ligne = (nom: string) => bouton(nom).closest('li')!;

describe('web#2166 — la page Étiquettes réordonne', () => {
  it('🔴 Alt + flèche droite avance l’étiquette, envoie l’ordre complet, garde le focus', async () => {
    monte = mount(EtiquettesV2, { target: hote });
    await souffler();
    expect(noms()).toEqual(['Ambient', 'Blues', 'Cool jazz']);

    bouton('Ambient').focus();
    bouton('Ambient').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true }));
    await souffler();

    expect(ordres, 'PUT /tags/order doit partir avec l’ordre complet').toEqual([[2, 1, 3]]);
    expect(noms()).toEqual(['Blues', 'Ambient', 'Cool jazz']);
    expect(document.activeElement?.textContent).toContain('Ambient');
    expect(hote.querySelector('[aria-live="polite"]')?.textContent).toContain('Ambient : position 2 sur 3');
  });

  it('une flèche SANS Alt ne réordonne rien', async () => {
    monte = mount(EtiquettesV2, { target: hote });
    await souffler();
    bouton('Ambient').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await souffler();
    expect(ordres).toEqual([]);
    expect(noms()).toEqual(['Ambient', 'Blues', 'Cool jazz']);
  });

  it('🔴 glisser « Cool jazz » sur « Ambient » la met en tête', async () => {
    monte = mount(EtiquettesV2, { target: hote });
    await souffler();
    ligne('Cool jazz').dispatchEvent(new Event('dragstart', { bubbles: true }));
    ligne('Ambient').dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
    ligne('Ambient').dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    await souffler();
    expect(ordres).toEqual([[3, 1, 2]]);
    expect(noms()).toEqual(['Cool jazz', 'Ambient', 'Blues']);
  });

  it('🔴 un serveur sans la route : l’écran reprend l’ordre d’avant', async () => {
    ordreRefuse = true;
    monte = mount(EtiquettesV2, { target: hote });
    await souffler();
    bouton('Blues').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', altKey: true, bubbles: true, cancelable: true }));
    await souffler();
    expect(noms()).toEqual(['Ambient', 'Blues', 'Cool jazz']);
  });

  it('la page explique le geste', async () => {
    monte = mount(EtiquettesV2, { target: hote });
    await souffler();
    expect(hote.querySelector('.aide')?.textContent).toMatch(/Glissez.*Alt/);
  });
});

describe('web#2166 — partout ailleurs, l’ordre du serveur n’est pas défait', () => {
  const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
  for (const f of [
    'src/components/v2/CollectionSmartEditeurV2.svelte',
    'src/components/v2/PlaylistSmartEditeurV2.svelte',
    'src/components/v2-heritage/SmartPlaylistsView.svelte',
  ]) {
    it(f, () => {
      const src = lire(f);
      const appel = src.indexOf('api.getTags(');
      expect(appel, 'getTags a disparu de l’écran').toBeGreaterThan(-1);
      // Les 400 caractères qui suivent l'appel : là où vivait le tri par nom.
      expect(src.slice(appel, appel + 400)).not.toMatch(/localeCompare/);
    });
  }

  it('le panneau d’une pochette range la posée selon l’ordre', () => {
    expect(lire('src/components/v2/EtiquettesPanneau.svelte')).toContain('selonOrdre([...posees, tag], toutes)');
  });
});
