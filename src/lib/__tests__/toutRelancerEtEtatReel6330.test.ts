// @vitest-environment jsdom
/**
 * tune-server-rust#6330 et #6282.
 *
 *  - #6330 (Benjithom, fil 2270) : « Tout relancer » ne faisait rien sur un
 *    ReplayGain suspendu à 99 % et une plage dynamique suspendue à 95 %. Il
 *    doit REPRENDRE tout ce qui est suspendu, ReplayGain compris, rendre les
 *    pistes en échec à la passe, puis lancer ce qui était au repos.
 *  - #6282 (Kimon, fil 2259) : un enrichissement suspendu s'affichait « en
 *    cours » dans le bandeau et les Réglages.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { toutRelancer, type RoutesToutRelancer } from '../lancerTraitement';
import { getBatchEnrichStatus, relaunchAllBackgroundTasks } from '../api';
import { libelleBanniereEnrichissement } from '../tachesDeFond';
import de from '../locales/de';
import en from '../locales/en';
import es from '../locales/es';
import fr from '../locales/fr';
import hu from '../locales/hu';
import viLocale from '../locales/vi';
import elLocale from '../locales/el';
import nbLocale from '../locales/nb';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';

const DICOS = { de, en, es, fr, hu, vi: viLocale, el: elLocale, nb: nbLocale, it: it_, ja, ko, ro, sv, zh } as unknown as Record<
  string,
  Record<string, string>
>;

afterEach(() => vi.unstubAllGlobals());

function routes(opts: { relance?: Error; reprise?: Error } = {}) {
  const appels: string[] = [];
  const lancement = (id: string) => vi.fn(async () => {
    appels.push(id);
    return { status: 'started' };
  });
  const r: RoutesToutRelancer = {
    dr: lancement('dr'),
    enrich: lancement('enrich'),
    covers: lancement('covers'),
    relancerTout: vi.fn(async () => {
      appels.push('relaunch-all');
      if (opts.relance) throw opts.relance;
      return {
        resumed: ['replaygain', 'dynamic_range', 'enrichment', 'artist_images'],
        retried: { replaygain: 84, dynamic_range: 79, deferred: 0 },
      };
    }),
    reprendreTout: vi.fn(async () => {
      appels.push('resume-all');
      if (opts.reprise) throw opts.reprise;
      return {};
    }),
  };
  return { appels, r };
}

describe('#6330 — « Tout relancer »', () => {
  it('l’état du fil 2270 : reprend tout, rend les échecs, ne relance pas ce qui était suspendu', async () => {
    const { appels, r } = routes();
    // Plage dynamique, métadonnées et images d’artistes : suspendues.
    const b = await toutRelancer(new Set(['dr', 'enrich', 'covers'] as const), r);
    expect(appels).toEqual(['relaunch-all']);
    expect(b.repris).toBe(4);
    expect(b.pistes).toBe(163);
    expect(b.lances).toBe(0);
    expect(b.erreurs).toBe(0);
  });

  it('reprend D’ABORD, puis lance ce qui était au repos', async () => {
    const { appels, r } = routes();
    const b = await toutRelancer(new Set(['enrich'] as const), r);
    expect(appels).toEqual(['relaunch-all', 'dr', 'covers']);
    expect(b.lances).toBe(2);
    expect(b.lancements.enrich).toBe('deja');
  });

  it('serveur d’avant #6330 (route absente) : retombe sur resume-all', async () => {
    const { appels, r } = routes({ relance: new Error('404') });
    const b = await toutRelancer(new Set(), r);
    expect(appels).toEqual(['relaunch-all', 'resume-all', 'dr', 'enrich', 'covers']);
    expect(b.repris).toBeNull();
    expect(b.pistes).toBeNull();
    expect(b.erreurs).toBe(0);
  });

  it('les deux reprises refusées : une erreur, et les lancements ont lieu quand même', async () => {
    const { appels, r } = routes({ relance: new Error('500'), reprise: new Error('500') });
    const b = await toutRelancer(new Set(), r);
    expect(appels).toEqual(['relaunch-all', 'resume-all', 'dr', 'enrich', 'covers']);
    expect(b.erreurs).toBe(1);
  });

  it('la vraie fonction d’API appelle POST /system/background-tasks/relaunch-all', async () => {
    const f = vi.fn(async () => new Response(
      JSON.stringify({ tasks: [], resumed: ['replaygain'], retried: { replaygain: 1 } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', f);
    const r = await relaunchAllBackgroundTasks();
    expect(r.resumed).toEqual(['replaygain']);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/system\/background-tasks\/relaunch-all$/);
    expect(init.method).toBe('POST');
  });

  it('branché dans l’écran : le bouton passe par toutRelancer, et paraît dès qu’un traitement est suspendu', () => {
    const src = readFileSync(resolve(__dirname, '../../components/v2/TuneHealthV2.svelte'), 'utf8');
    expect(src).toMatch(/await relancerToutLesTraitements\(lancablesOccupes\)/);
    expect(src).not.toMatch(/await lancerTout\(/);
    expect(src).toMatch(/\|\| Object\.values\(pauses\)\.some\(Boolean\)/);
  });

  it.each(Object.keys(DICOS))('%s porte le bilan, avec ses trois nombres', (l) => {
    const v = DICOS[l]['v2.health.relaunchAllDone'];
    expect(v?.trim(), l).toBeTruthy();
    for (const m of ['{r}', '{p}', '{n}']) expect(v, `${l} ${m}`).toContain(m);
  });
});

describe('#6282 — un enrichissement suspendu ne se dit pas en cours', () => {
  const garee = { id: 'enrich_all', label: 'Enrichissement des métadonnées…', kind: 'enrichment', paused: true };

  it('le bandeau se tait sur une tâche garée', () => {
    expect(libelleBanniereEnrichissement([garee], 'Enrichissement…')).toBeNull();
  });

  it('il montre la tâche qui tourne, pas celle qui est garée', () => {
    const tourne = { id: 'lyrics_fetch', label: 'Recherche des paroles…', kind: 'enrichment' };
    expect(libelleBanniereEnrichissement([garee, tourne], 'x')).toBe('Recherche des paroles…');
  });

  it('témoin : la même tâche non suspendue s’affiche', () => {
    expect(libelleBanniereEnrichissement([{ ...garee, paused: false }], 'x'))
      .toBe('Enrichissement des métadonnées…');
  });

  it('les Réglages lisent « paused » de la vraie route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ status: 'paused', paused: true, enriched: 0, total: 110781 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));
    const st = await getBatchEnrichStatus();
    expect(st.status).toBe('paused');
    const src = readFileSync(resolve(__dirname, '../../components/v2/SettingsV2.svelte'), 'utf8');
    expect(src).toMatch(/enrichPaused = st\?\.status === 'paused';/);
    expect(src).toMatch(/enrichPaused \? 'v2\.piste\.enPause' : enrichRunning \? 'v2\.set\.running'/);
  });
});
