// @vitest-environment jsdom
//
// #1431 — Marco Polo, fil 1885 : les pistes d'un coffret réuni s'enchaînent
// sans en-tête de disque sur la fiche d'album. Il demande :
//
// > Disque 1 / All by myself / My heart will go on / Disque 2 / Pour que tu
// > m'aimes encore / …
//
// 🔴 CE TÉMOIN MONTE LA LISTE et compte les en-têtes RENDUS, dans les deux
// formes (tableau et lignes), puis vérifie que la fiche d'album les demande.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import ListePistesV2 from '../../components/v2/ListePistesV2.svelte';
import { preferences } from '../stores/preferences';
import { enTetesDisque } from '../enTetesDisque';

const COFFRET = [
  { id: 1, title: 'All by myself', disc_number: 1, track_number: 1, source: 'local' },
  { id: 2, title: 'My heart will go on', disc_number: 1, track_number: 2, source: 'local' },
  { id: 3, title: 'Pour que tu m’aimes encore', disc_number: 2, track_number: 1, source: 'local' },
  { id: 4, title: 'On ne change pas', disc_number: 2, track_number: 2, source: 'local' },
  { id: 5, title: 'Bla bla', disc_number: 3, track_number: 1, source: 'local', disc_subtitle: 'Live' },
] as any[];
const UN_DISQUE = COFFRET.slice(0, 2);

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poser(props: Record<string, unknown>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ListePistesV2 as any, { target: hote, props: { onLire: () => {}, ...props } as any });
  flushSync();
  return hote;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({}), text: async () => '{}',
  } as unknown as Response)));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

const textes = (el: HTMLElement) =>
  [...el.querySelectorAll('.dischead')].map((h) => h.textContent?.replace(/\s+/g, ' ').trim());

describe('#1431 — un en-tête par disque', () => {
  for (const niveau of ['expert', 'intermediate'] as const) {
    it(`🔴 ${niveau} : trois disques, trois en-têtes, avant la bonne piste`, () => {
      preferences.update((p) => ({ ...p, settingsLevel: niveau }));
      const el = poser({ pistes: COFFRET, enTetesDisque: true, numerotation: 'piste' });
      const t = textes(el);
      expect(t.length).toBe(3);
      expect(t[0]).toMatch(/1/);
      expect(t[1]).toMatch(/2/);
      expect(t[2]).toMatch(/3.*Live/);
      // L'en-tête 2 précède « Pour que tu m'aimes encore ».
      const h2 = el.querySelectorAll('.dischead')[1];
      const suivant = h2.nextElementSibling?.textContent ?? '';
      expect(suivant).toContain('Pour que tu');
    });
  }

  it('un seul disque sans sous-titre : aucun en-tête (règle d’Oxygen)', () => {
    preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
    const el = poser({ pistes: UN_DISQUE, enTetesDisque: true });
    expect(textes(el).length).toBe(0);
  });

  it('sans la propriété, les autres écrans ne changent pas', () => {
    preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
    const el = poser({ pistes: COFFRET });
    expect(textes(el).length).toBe(0);
  });

  it('les rangs ne bougent pas : un en-tête par début de disque, rien d’autre', () => {
    const r = enTetesDisque(COFFRET);
    expect(r.length).toBe(COFFRET.length);
    expect(r.map((x) => x?.disque ?? null)).toEqual([1, null, 2, null, 3]);
    expect(enTetesDisque([{ id: 9, title: 'x' } as any])).toEqual([null]);
    expect(enTetesDisque([{ id: 9, title: 'x', disc_subtitle: 'Bonus' } as any]))
      .toEqual([{ disque: 1, sousTitre: 'Bonus' }]);
  });

  it('la fiche d’album demande les en-têtes', () => {
    const fiche = readFileSync('src/components/v2/AlbumDetailV2.svelte', 'utf8');
    const appel = fiche.slice(fiche.indexOf('<ListePistesV2'));
    expect(fiche.indexOf('<ListePistesV2')).toBeGreaterThan(-1);
    expect(appel.slice(0, appel.indexOf('/>'))).toMatch(/\benTetesDisque\b/);
  });
});
