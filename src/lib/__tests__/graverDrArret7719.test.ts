// @vitest-environment jsdom
//
// tune-server-rust#7719 (Tades, ~522 000 pistes) : « un bouton pour ARRÊTER
// la gravure du DR en cours ». Sur une telle bibliothèque, la passe lancée
// depuis Métadonnées › Dynamic Range dure des heures, sans moyen de l'arrêter.
//
// Le serveur expose `POST /library/dr/gravure/cancel` : il finit le fichier
// entamé, n'écrit plus rien, et l'état passe à `cancelled`, compteurs gardés.
// Côté client :
//  - pendant la passe, un bouton « Arrêter » appelle cette route en POST ;
//  - l'état `cancelled` rend le bouton Graver cliquable et dit où la passe
//    s'est arrêtée : « Arrêtée à N / M — reprendre » ;
//  - les deux libellés existent dans toutes les langues.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import MetadataV2 from '../../components/v2/MetadataV2.svelte';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const LANGUES = ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'vi', 'el', 'nb', 'pl'];

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let etatDr: Record<string, unknown>;
const arrets: string[] = [];

function json(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

/** L'écran Métadonnées, onglet Dynamic Range ouvert. */
async function ongletDr(): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(MetadataV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  const onglet = [...hote.querySelectorAll<HTMLButtonElement>('button')]
    .find((b) => b.textContent?.startsWith('Dynamic Range'));
  expect(onglet, 'onglet Dynamic Range introuvable').toBeTruthy();
  onglet!.click();
  await attendre();
  return hote;
}

const boutonGraver = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLButtonElement>('button.go')].find((b) => b.closest('.auto'));

beforeEach(() => {
  arrets.length = 0;
  etatDr = { status: 'running', total: 2, written: 1, already: 0, skipped: 0, errors: 0,
    a_graver: 1, hors_format: 0, dans_les_fichiers: 1 };
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/library/dr/gravure/cancel')) {
      arrets.push(init?.method ?? 'GET');
      etatDr = { ...etatDr, status: 'cancelled' };
      return json({ cancelled: true });
    }
    if (u.endsWith('/library/dr/gravure')) return json(etatDr);
    return json(/\/(zones|profiles|devices|playlists|shortcuts|proposals)(\?|$)/.test(u) ? [] : {});
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('arrêter la gravure du DR (tune-server-rust#7719)', () => {
  it('pendant la passe, « Arrêter » demande l’arrêt au serveur puis montre où elle s’est arrêtée',
    { timeout: 60_000 }, async () => {
      const el = await ongletDr();
      expect(boutonGraver(el)?.disabled, 'pendant la passe, Graver est grisé').toBe(true);
      const arreter = el.querySelector<HTMLButtonElement>('[data-dr="arreter"]');
      expect(arreter, 'aucun bouton Arrêter pendant la gravure').not.toBeNull();

      arreter!.click();
      await attendre();

      expect(arrets, 'l’arrêt doit partir en POST sur /library/dr/gravure/cancel').toEqual(['POST']);
      expect(el.querySelector('[data-dr="arreter"]'), 'plus rien à arrêter').toBeNull();
      const graver = boutonGraver(el)!;
      expect(graver.disabled, 'après l’arrêt, la gravure se relance').toBe(false);
      expect(graver.textContent).toMatch(/1 \/ 2/);
    });

  it('sans passe en cours, pas de bouton Arrêter', { timeout: 60_000 }, async () => {
    etatDr = { ...etatDr, status: 'done' };
    const el = await ongletDr();
    expect(el.querySelector('[data-dr="arreter"]')).toBeNull();
  });

  it('les deux libellés existent dans toutes les langues', () => {
    for (const l of LANGUES) {
      const src = lire(`src/lib/locales/${l}.ts`);
      expect(src, `${l} : v2.meta.drStop`).toMatch(/"v2\.meta\.drStop": "[^"]+"/);
      const m = /"v2\.meta\.drCancelled": "([^"]+)"/.exec(src);
      expect(m, `${l} : v2.meta.drCancelled`).not.toBeNull();
      expect(m![1], l).toContain('{done}');
      expect(m![1], l).toContain('{total}');
    }
  });
});
