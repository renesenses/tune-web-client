// @vitest-environment jsdom
/**
 * #1751 — l'écran « État du serveur » sait LANCER la plage dynamique, les
 * métadonnées et les images d'artistes (Tades, fil 2024 ; Bertrand, fil 2043).
 *
 * Tenu ici :
 *  1. la RÈGLE du bouton, en appelant `boutonLancer` : au repos ou terminé,
 *     jamais en cours, jamais suspendu, jamais d'état inconnu ;
 *  2. la LECTURE des réponses des trois routes (lancé / rien / déjà) ;
 *  3. « Tout relancer » : les trois, dans l'ordre, sans relancer ce qui tourne,
 *     un échec n'empêchant pas les suivants ;
 *  4. la ROUTE de la plage dynamique, appelée en POST, 409 accepté ;
 *  5. le BRANCHEMENT dans l'écran, et les textes dans les onze langues.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CARTES_LANCABLES, CLE_ISSUE, boutonLancer, issueDe, lancerTout, lancerTraitement,
  type RoutesLancement,
} from '../lancerTraitement';
import { lancerPlageDynamique } from '../api';
import de from '../locales/de';
import en from '../locales/en';
import es from '../locales/es';
import fr from '../locales/fr';
import hu from '../locales/hu';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';

const DICOS: Record<string, Record<string, string>> = {
  de, en, es, fr, hu, it: it_, ja, ko, ro, sv, zh,
} as unknown as Record<string, Record<string, string>>;

const LANGUES = ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh'] as const;

function routes(statuts: Partial<Record<keyof RoutesLancement, string | Error>> = {}) {
  const appels: string[] = [];
  const fab = (id: keyof RoutesLancement) => vi.fn(async () => {
    appels.push(id);
    const s = statuts[id];
    if (s instanceof Error) throw s;
    return { status: s ?? 'started' };
  });
  return { appels, r: { dr: fab('dr'), enrich: fab('enrich'), covers: fab('covers') } };
}

afterEach(() => vi.unstubAllGlobals());

describe('#1751 — quelle carte porte « Lancer »', () => {
  it.each(CARTES_LANCABLES)('%s au repos ou terminée : oui', (id) => {
    expect(boutonLancer({ id, etat: 'idle' }, false)).toBe(true);
    expect(boutonLancer({ id, etat: 'done' }, false)).toBe(true);
  });

  it.each(CARTES_LANCABLES)('%s en cours, suspendue, inconnue ou éteinte : non', (id) => {
    expect(boutonLancer({ id, etat: 'running' }, false)).toBe(false);
    expect(boutonLancer({ id, etat: 'idle' }, true)).toBe(false);
    expect(boutonLancer({ id, etat: 'inconnu' }, false)).toBe(false);
    expect(boutonLancer({ id, etat: 'off' }, false)).toBe(false);
  });

  it('les cartes sans route de lancement n’ont pas de bouton', () => {
    for (const id of ['scan', 'clap', 'rg', 'acoustid']) {
      expect(boutonLancer({ id, etat: 'idle' }, false), id).toBe(false);
    }
  });
});

describe('#1751 — lire la réponse des routes', () => {
  it('lancé, rien à faire, déjà en cours', () => {
    expect(issueDe('started')).toBe('lance');
    expect(issueDe('accepted')).toBe('lance');
    expect(issueDe(undefined)).toBe('lance');
    expect(issueDe('nothing_to_do')).toBe('rien');
    expect(issueDe('skipped')).toBe('rien');
    expect(issueDe('already_running')).toBe('deja');
  });

  it('chaque traitement appelle SA route', async () => {
    for (const id of CARTES_LANCABLES) {
      const { appels, r } = routes();
      expect(await lancerTraitement(id, r)).toBe('lance');
      expect(appels).toEqual([id]);
    }
  });
});

describe('#1751 — « Tout relancer »', () => {
  it('lance les trois, dans l’ordre du fil 2043', async () => {
    const { appels, r } = routes({ enrich: 'skipped' });
    const res = await lancerTout(new Set(), r);
    expect(appels).toEqual(['dr', 'enrich', 'covers']);
    expect(res).toEqual({ dr: 'lance', enrich: 'rien', covers: 'lance' });
  });

  it('ne relance pas ce qui tourne déjà', async () => {
    const { appels, r } = routes();
    const res = await lancerTout(new Set(['enrich'] as const), r);
    expect(appels).toEqual(['dr', 'covers']);
    expect(res.enrich).toBe('deja');
  });

  it('un échec n’empêche pas les suivants', async () => {
    const { appels, r } = routes({ dr: new Error('500') });
    const res = await lancerTout(new Set(), r);
    expect(appels).toEqual(['dr', 'enrich', 'covers']);
    expect(res).toEqual({ dr: 'erreur', enrich: 'lance', covers: 'lance' });
  });
});

describe('#1751 — la route de la plage dynamique', () => {
  function stub(status: number, corps: unknown) {
    const f = vi.fn(async () => new Response(JSON.stringify(corps), {
      status, headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', f);
    return f;
  }

  it('POST /system/dynamic-range/analyze', async () => {
    const f = stub(202, { status: 'started', total: 12 });
    const r = await lancerPlageDynamique();
    expect(r.status).toBe('started');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/system\/dynamic-range\/analyze$/);
    expect(init.method).toBe('POST');
  });

  it('409 « déjà en cours » est une réponse, pas une erreur', async () => {
    stub(409, { status: 'already_running' });
    const r = await lancerPlageDynamique();
    expect(issueDe(r.status)).toBe('deja');
  });
});

describe('#1751 — branché dans l’écran, et traduit', () => {
  const src = readFileSync(resolve(__dirname, '../../components/v2/TuneHealthV2.svelte'), 'utf8');

  it('chaque carte lançable porte le bouton, et l’en-tête porte « Tout relancer »', () => {
    expect(src).toMatch(/\{#if boutonLancer\(c, enPause\)\}/);
    expect(src).toMatch(/onclick=\{\(\) => lancer\(c\.id as CarteLancable\)\}/);
    expect(src).toMatch(/onclick=\{toutRelancer\}/);
  });

  const CLES = [
    'v2.health.launch', 'v2.health.launchAll', 'v2.health.launchAllDone', 'v2.health.launchAllErrors',
    ...Object.values(CLE_ISSUE),
  ];
  it.each(LANGUES)('%s porte les sept textes', (l) => {
    const dico = DICOS[l];
    for (const k of CLES) expect(dico[k]?.trim(), `${l} : ${k}`).toBeTruthy();
    expect(dico['v2.health.launchAllDone']).toContain('{n}');
    expect(dico['v2.health.launchAllErrors']).toContain('{n}');
  });
});
