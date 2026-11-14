import { formaterPluriel } from '../pluriel';
// @vitest-environment jsdom
//
// tune-server-rust#7872 — la requête avancée de la Bibliothèque
// (`GET /library/query`) et l'`expression` des collections intelligentes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';

import {
  chercherParRequete,
  indiceUtf16,
  lireErreurDeRequete,
  EXEMPLES_DE_REQUETE,
} from '../requeteAvancee';
import { t } from '../i18n';
import SaisieRequeteV2 from '../../components/v2/SaisieRequeteV2.svelte';
import RequeteBibliothequeV2 from '../../components/v2/RequeteBibliothequeV2.svelte';
import CollectionSmartEditeurV2 from '../../components/v2/CollectionSmartEditeurV2.svelte';

const tr = (cle: string) => get(t)(cle);

const ISSUE = 'composer:beethoven conductor:karajan year:1960..1969 -genre:live';

function reponse(statut: number, corps: unknown) {
  return new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } });
}

/** Les appels faits au faux serveur : méthode, adresse, corps. */
let appels: { methode: string; url: string; corps: any }[] = [];
let routeur: (methode: string, url: URL, corps: any) => Response;

beforeEach(() => {
  appels = [];
  routeur = (m) => reponse(200, m === 'GET' ? [] : {});
  vi.stubGlobal('fetch', vi.fn(async (entree: any, init?: RequestInit) => {
    const url = new URL(String(entree), 'http://tune.test');
    const methode = (init?.method ?? 'GET').toUpperCase();
    const corps = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    appels.push({ methode, url: url.pathname + url.search, corps });
    return routeur(methode, url, corps);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

async function attendre() {
  for (let i = 0; i < 8; i++) { await Promise.resolve(); await tick(); }
  flushSync();
}

const PAGE = {
  items: [
    { id: 1, title: 'Allegro con brio', artist_name: 'Berliner Philharmoniker', album_title: 'Cinquième', duration_ms: 1000 },
    { id: 2, title: 'Andante con moto', artist_name: 'Berliner Philharmoniker', album_title: 'Cinquième', duration_ms: 1000 },
  ],
  total: 3, limit: 50, offset: 0, has_more: true,
};
const REFUS = { error: 'champ inconnu', code: 'requete_invalide', position: 10, attendu: 'un champ connu', message: 'champ inconnu « ratng »' };

describe('GET /library/query', () => {
  it('envoie la requête encodée et lit la page sous la forme de /library/tracks', async () => {
    routeur = () => reponse(200, PAGE);
    const r = await chercherParRequete(ISSUE, 50, 25);
    const appel = new URL(appels[0].url, 'http://x');
    expect(appel.pathname).toBe('/api/v1/library/query');
    expect(appel.searchParams.get('q')).toBe(ISSUE);
    expect(appel.searchParams.get('limit')).toBe('25');
    expect(appel.searchParams.get('offset')).toBe('50');
    expect(r).toEqual({ ok: true, page: { items: PAGE.items, total: 3, limit: 50, offset: 0, hasMore: true } });
  });

  it('la première page ne porte pas d’offset', async () => {
    routeur = () => reponse(200, PAGE);
    await chercherParRequete('genre:jazz');
    expect(new URL(appels[0].url, 'http://x').searchParams.has('offset')).toBe(false);
  });

  it('un 400 devient le refus, avec sa position, sans lever', async () => {
    routeur = () => reponse(400, REFUS);
    const r = await chercherParRequete('year:1963 ratng:5');
    expect(r).toEqual({ ok: false, erreur: { position: 10, attendu: 'un champ connu', message: 'champ inconnu « ratng »' } });
  });

  it('un corps sans position n’est pas un refus de requête', () => {
    expect(lireErreurDeRequete({ error: 'max_limit' })).toBeNull();
    expect(lireErreurDeRequete(null)).toBeNull();
    expect(lireErreurDeRequete({ position: 'x' })).toBeNull();
    expect(lireErreurDeRequete({ position: 2.7, error: 'e' })).toEqual({ position: 2, attendu: '', message: 'e' });
  });

  it('la position en caractères devient un indice UTF-16 pour le curseur', () => {
    expect(indiceUtf16('année:x', 6)).toBe(6);
    expect(indiceUtf16('🎵 ratng:5', 2)).toBe(3);
  });
});

describe('la saisie partagée', () => {
  let cible: HTMLElement;
  let monte: ReturnType<typeof mount> | null = null;
  afterEach(() => { if (monte) unmount(monte); monte = null; cible?.remove(); });

  function monter(props: Record<string, unknown>) {
    cible = document.createElement('div');
    document.body.appendChild(cible);
    monte = mount(SaisieRequeteV2, { target: cible, props: props as any });
    flushSync();
  }

  it('marque le caractère fautif et dit ce qui était attendu', async () => {
    monter({ value: 'year:1963 ratng:5', erreur: { position: 10, attendu: 'un champ connu', message: 'champ inconnu' } });
    await attendre();
    const refus = cible.querySelector('[role="alert"]')!;
    expect(refus.textContent).toContain(tr('requeteAvancee.errorAt').replace('{n}', '11'));
    expect(refus.querySelector('mark')?.textContent).toBe('r');
    expect(refus.querySelector('.repere')?.textContent).toBe('year:1963 ratng:5');
    expect(refus.textContent).toContain('un champ connu');
    expect(cible.querySelector('input')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('une erreur en fin de texte marque la place qui suit', async () => {
    monter({ value: 'composer:(bach', erreur: { position: 14, attendu: ')', message: '' } });
    await attendre();
    expect(cible.querySelector('mark')?.textContent).toBe(' ');
  });

  it('« ? » ouvre l’aide ; un exemple se recopie dans le champ', async () => {
    monter({ value: '' });
    expect(cible.textContent).not.toContain(EXEMPLES_DE_REQUETE[0].requete);
    (cible.querySelector('.aide-btn') as HTMLButtonElement).click();
    flushSync();
    expect(cible.textContent).toContain(ISSUE);
    expect(cible.textContent).toContain(tr('requeteAvancee.exemple.karajan'));
    (cible.querySelector('.ex') as HTMLButtonElement).click();
    flushSync();
    expect(cible.querySelector('input')?.value).toBe(ISSUE);
  });
});

describe('le panneau de la Bibliothèque', () => {
  let cible: HTMLElement;
  let monte: ReturnType<typeof mount> | null = null;
  afterEach(() => { if (monte) unmount(monte); monte = null; cible?.remove(); });

  function monter(initiale: string) {
    cible = document.createElement('div');
    document.body.appendChild(cible);
    monte = mount(RequeteBibliothequeV2, { target: cible, props: { initiale, onClose: () => {} } });
    flushSync();
  }

  it('cherche le texte de départ, montre le compte et les pistes, puis la page suivante', async () => {
    routeur = (_m, url) => reponse(200, url.searchParams.get('offset') === '2'
      ? { items: [{ id: 3, title: 'Finale', duration_ms: 1000 }], total: 3, limit: 50, offset: 2, has_more: false }
      : PAGE);
    monter(ISSUE);
    await attendre();
    expect(cible.textContent).toContain(formaterPluriel(tr('requeteAvancee.countN'), 3, 'fr'));
    expect(cible.textContent).toContain('Allegro con brio');
    const plus = [...cible.querySelectorAll('button')].find((b) => b.textContent?.trim() === tr('requeteAvancee.more'))!;
    expect(plus).toBeTruthy();
    plus.click();
    await attendre();
    const derniere = new URL(appels.filter((a) => a.url.startsWith('/api/v1/library/query')).at(-1)!.url, 'http://x');
    expect(derniere.searchParams.get('q')).toBe(ISSUE);
    expect(derniere.searchParams.get('offset')).toBe('2');
    expect(cible.textContent).toContain('Finale');
    expect(cible.textContent).toContain('Allegro con brio');
  });

  it('un refus montre le repère, pas de liste', async () => {
    routeur = () => reponse(400, REFUS);
    monter('year:1963 ratng:5');
    await attendre();
    expect(cible.querySelector('mark')?.textContent).toBe('r');
    expect(cible.textContent).not.toContain(formaterPluriel(tr('requeteAvancee.countN'), 3, 'fr'));
  });
});

describe('l’éditeur des collections intelligentes', () => {
  let cible: HTMLElement;
  let monte: ReturnType<typeof mount> | null = null;
  afterEach(() => { if (monte) unmount(monte); monte = null; cible?.remove(); });

  it('relit, prévisualise et enregistre l’expression', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      routeur = (m, url, corps) => {
        if (url.pathname === '/api/v1/library/smart-collections/7' && m === 'GET') {
          return reponse(200, { id: 7, name: 'Karajan', rules: [], match_mode: 'all', expression: 'conductor:karajan' });
        }
        if (url.pathname.endsWith('/smart-collections/preview')) {
          return String(corps?.expression).includes('ratng')
            ? reponse(400, REFUS)
            : reponse(200, { albums: [], total: 4 });
        }
        if (url.pathname === '/api/v1/library/smart-collections/7' && m === 'PUT') {
          return reponse(200, { id: 7, ...corps });
        }
        return reponse(200, m === 'GET' ? [] : {});
      };
      cible = document.createElement('div');
      document.body.appendChild(cible);
      monte = mount(CollectionSmartEditeurV2, { target: cible, props: { id: 7, onClose: () => {}, onSaved: () => {} } });
      await attendre();
      const champ = cible.querySelector('[data-expression-collection] input') as HTMLInputElement;
      expect(champ.value).toBe('conductor:karajan');

      // L'aperçu envoie l'expression, et annonce son compte.
      vi.advanceTimersByTime(450);
      await attendre();
      const apercu = appels.filter((a) => a.url.endsWith('/preview')).at(-1)!;
      expect(apercu.corps.expression).toBe('conductor:karajan');
      expect(cible.querySelector('.apercu')?.textContent).toContain(formaterPluriel(tr('v2.smart.previewN'), 4, 'fr'));

      // Une expression fautive : le repère sous le champ.
      champ.value = 'year:1963 ratng:5';
      champ.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
      vi.advanceTimersByTime(450);
      await attendre();
      expect(cible.querySelector('[data-expression-collection] mark')?.textContent).toBe('r');

      // Corrigée puis enregistrée : l'expression part avec la collection.
      champ.value = 'conductor:bohm';
      champ.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
      const enregistrer = [...cible.querySelectorAll('button.play')][0] as HTMLButtonElement;
      enregistrer.click();
      await attendre();
      const put = appels.find((a) => a.methode === 'PUT')!;
      expect(put.corps.expression).toBe('conductor:bohm');
    } finally {
      vi.useRealTimers();
    }
  });

  it('une expression vide part en null : elle efface celle de la collection', () => {
    const src = readFileSync('src/components/v2/CollectionSmartEditeurV2.svelte', 'utf8');
    expect(src).toContain('expression: expression.trim() || null');
  });

  it('la Bibliothèque ouvre le panneau depuis son champ de recherche, sur la bibliothèque locale', () => {
    const src = readFileSync('src/components/v2/LibraryV2.svelte', 'utf8');
    expect(src).toMatch(/\{#if !depot\}\s*<button[^>]*data-requete-avancee-bib[^>]*onclick=\{\(\) => \(requeteOuverte = true\)\}/);
    expect(src).toContain("import('./RequeteBibliothequeV2.svelte')");
    expect(src).toContain('<m.default initiale={q} onClose={() => (requeteOuverte = false)} />');
  });
});
