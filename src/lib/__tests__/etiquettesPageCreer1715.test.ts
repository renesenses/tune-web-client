// @vitest-environment jsdom
/**
 * web#1715 — étapes 3a et 3b du chantier des étiquettes.
 *
 * Pascal (bluevelvet), fil 953, 06/07/2026 : les étiquettes vivaient dans la
 * rangée des badges de qualité (FLAC / AIFF / WAV), et il « n'a pas retrouvé
 * la manière de créer une troisième étiquette ». Promesse du même jour : une
 * page dédiée au menu latéral, façon Explorer de Roon, avec la gestion
 * complète au même endroit.
 *
 * 3b — la page existait (`EtiquettesV2`), renommer et supprimer y étaient ;
 * CRÉER n'y était pas. On monte le vrai écran, on saisit un nom, on valide :
 * le `POST /tags/` doit partir, et la liste relue doit montrer l'étiquette.
 *
 * 3a — gardé par le contenu : aucune étiquette n'est rendue parmi les
 * badges de qualité, ni dans la barre de filtres de la Bibliothèque, ni dans
 * la rangée `qbadge` de la fiche album, où elles ont un bouton à elles.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import EtiquettesV2 from '../../components/v2/EtiquettesV2.svelte';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 30_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 10) {
  for (let i = 0; i < n; i++) { await respirer(); flushSync(); }
}

let tags: { id: number; name: string; color: string }[] = [];
let posts: { url: string; corps: any }[] = [];
let hote: HTMLDivElement;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  tags = [{ id: 1, name: 'Jazz du dimanche', color: '#3366ff' }];
  posts = [];
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const methode = (init?.method ?? 'GET').toUpperCase();
    let charge: unknown = {};
    if (methode === 'POST' && /\/tags\/$/.test(url)) {
      const corps = JSON.parse(String(init?.body ?? '{}'));
      posts.push({ url, corps });
      const id = tags.length + 1;
      tags = [...tags, { id, name: corps.name, color: '' }];
      charge = { id };
    } else if (methode === 'GET' && /\/tags\/?(\?.*)?$/.test(url)) {
      charge = tags;
    }
    return {
      ok: true, status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge),
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

function nomsAffiches(): string[] {
  return [...hote.querySelectorAll('.liste .tag .nom')].map((e) => e.textContent?.trim() ?? '');
}

describe('web#1715 · 3b — créer une étiquette depuis sa page', () => {
  it('🔴 la page porte un champ et un bouton « Créer »', async () => {
    monte = mount(EtiquettesV2, { target: hote });
    await souffler();
    const champ = hote.querySelector<HTMLInputElement>('form.creer input');
    const bouton = hote.querySelector<HTMLButtonElement>('form.creer button[type="submit"]');
    expect(champ, 'aucun champ de création sur la page').not.toBeNull();
    expect(bouton?.textContent?.trim()).toBe('Créer');
    expect(bouton?.disabled, 'un nom vide ne doit rien créer').toBe(true);
  });

  it('🔴 valider crée l’étiquette (POST /tags/) et la liste la montre', async () => {
    monte = mount(EtiquettesV2, { target: hote });
    await souffler();
    expect(nomsAffiches()).toEqual(['Jazz du dimanche']);

    const champ = hote.querySelector<HTMLInputElement>('form.creer input')!;
    champ.value = '  À réécouter  ';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    hote.querySelector<HTMLFormElement>('form.creer')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await souffler();

    expect(posts).toHaveLength(1);
    expect(posts[0].corps.name, 'le nom part sans ses espaces').toBe('À réécouter');
    expect(nomsAffiches()).toEqual(['Jazz du dimanche', 'À réécouter']);
    expect(hote.querySelector<HTMLInputElement>('form.creer input')!.value, 'le champ est vidé').toBe('');
  });

  it('🔴 la page vide propose aussi la création', async () => {
    tags = [];
    monte = mount(EtiquettesV2, { target: hote });
    await souffler();
    expect(hote.querySelector('form.creer input')).not.toBeNull();
  });
});

describe('web#1715 · 3a — les étiquettes hors de la rangée des badges de qualité', () => {
  const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

  it('la barre de filtres de la Bibliothèque ne rend aucune étiquette', () => {
    const src = lire('src/components/v2/LibraryV2.svelte');
    expect(src).not.toContain('user-tag');
    expect(src).not.toMatch(/api\.getTags\(/);
  });

  it('la rangée des badges de la fiche album ne contient pas les étiquettes', () => {
    const src = lire('src/components/v2/AlbumDetailV2.svelte');
    for (const ligne of src.split('\n').filter((l) => l.includes('qbadge'))) {
      expect(ligne).not.toMatch(/tags|etiquette/i);
    }
    // Elles ont leur bouton à elles, qui ouvre leur panneau.
    expect(src).toContain('etiquettesOuvertes = true');
  });
});
