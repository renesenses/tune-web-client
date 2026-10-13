// @vitest-environment jsdom
//
// « Ce qui tourne » dans État du serveur — renesenses/tune-server-rust#4681,
// étape 4 du chantier « priorité de la lecture ».
//
// L'écran dit quelles tâches de fond travaillent, lesquelles cèdent à la
// lecture ou sont en pause, et POURQUOI, à partir du seul
// `GET /system/background-tasks`. Règle : rien n'est inventé.
//
// Les témoins :
//   * la logique (`lib/ceQuiTourne.ts`) : une passe qui décode s'ARRÊTE
//     pendant la lecture même quand son état dit « au repos » ; une passe
//     freinée cite la pause publiée par le serveur, et seulement elle ; une
//     pause manuelle prime ; une inscription du registre n'apparaît pas deux
//     fois ; un serveur ancien ne produit aucune section ;
//   * l'écran MONTÉ : la section est rendue avec ses lignes et ses raisons,
//     et absente face à un serveur qui ne publie rien de tout cela.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import TuneHealthV2 from '../../components/v2/TuneHealthV2.svelte';
import { ceQuiTourne, phraseLecture, remplir } from '../ceQuiTourne';
import lFr from '../locales/fr';

const fr = lFr as Record<string, string>;

function priorite(over: Record<string, unknown> = {}) {
  return {
    playback_active: true,
    playing_zone_ids: [3],
    since_epoch_s: 1_760_000_000,
    throttled: ['replaygain', 'enrichment', 'scan'],
    pause_between_items_ms: 5000,
    policy: {
      enabled: true, pause_between_items_ms: 5000, pause_between_files_ms: 20, scan_width: 2,
      sqlite_reserved_readers: 1, writer_yield_max_ms: 100, low_io_priority: true,
      playback_watch_off_executor: true,
    },
    brakes: {
      scan_files_throttled: 12, sqlite_reads_deferred: 3, sqlite_reads_deferred_ms: 40,
      sqlite_writes_deferred: 1, sqlite_writes_deferred_ms: 9, low_io_priority_applied: 4,
    },
    ...over,
  };
}

function instantane(over: Record<string, unknown> = {}): any {
  return {
    tasks: [
      { id: 'enrich_all', label: 'Enrichissement', kind: 'enrichment', progress: { processed: 340, total: 1183, detail: 'MusicBrainz' } },
      { id: 'types_de_sortie', label: 'Types de sortie', kind: 'enrichment' },
    ],
    pausable: [
      // Le ReplayGain a cédé : la cascade ne décode plus, son état dit « au repos ».
      { id: 'replaygain', state: 'au_repos', paused: false, throttled_for_playback: true },
      { id: 'fingerprints', state: 'au_repos', paused: false, throttled_for_playback: false },
      { id: 'dynamic_range', state: 'en_pause', paused: true, throttled_for_playback: false },
      { id: 'acoustic', state: 'en_cours', paused: false, throttled_for_playback: false },
      { id: 'enrichment', state: 'en_cours', paused: false, throttled_for_playback: true },
      { id: 'artist_images', state: 'au_repos', paused: false, throttled_for_playback: false },
      { id: 'identification', state: 'au_repos', paused: false, throttled_for_playback: false },
      // Un identifiant d'un serveur plus récent : pas de nom, pas de ligne.
      { id: 'inconnue_du_client', state: 'en_cours', paused: false },
    ],
    all_paused: false,
    scan_pausable: false,
    scan: { running: true, throttled_for_playback: true },
    playback_priority: priorite(),
    ...over,
  };
}

describe('ceQuiTourne — la logique', () => {
  it('chaque ligne vient d\'un champ publié, avec sa raison', () => {
    const c = ceQuiTourne(instantane())!;
    const par = Object.fromEntries(c.lignes.map((l) => [l.id, l]));

    expect(par.replaygain.etat).toBe('cedee');
    expect(par.replaygain.raisonCle).toBe('v2.health.running.why.decodeYield');

    expect(par.dynamic_range.etat).toBe('en_pause');
    expect(par.dynamic_range.raisonCle).toBe('v2.health.running.why.paused');

    expect(par.acoustic.etat).toBe('en_cours');
    expect(par.acoustic.raisonCle).toBeUndefined();

    expect(par.enrichment.etat).toBe('ralentie');
    expect(par.enrichment.raisonCle).toBe('v2.health.running.why.itemPause');
    expect(par.enrichment.params).toEqual({ s: 5 });
    // L'avancement de son inscription au registre est rattaché à SA ligne…
    expect(par.enrichment.avancement).toEqual({ fait: 340, total: 1183, detail: 'MusicBrainz' });
    // … et l'inscription n'est pas montrée une seconde fois.
    expect(par['tache:enrich_all']).toBeUndefined();
    // Une inscription sans traitement nommé garde le libellé du serveur.
    expect(par['tache:types_de_sortie'].libelle).toBe('Types de sortie');

    expect(par.scan.etat).toBe('ralentie');
    expect(par.scan.params).toEqual({ n: 2, ms: 20 });

    expect(par.inconnue_du_client).toBeUndefined();
    // Empreintes, images d'artistes, identification : au repos, comptées.
    expect(c.auRepos).toBe(3);
    expect(c.lecture).toEqual({ active: true, zones: 1, depuisEpochS: 1_760_000_000, freinsDesactives: false });
    expect(c.freins?.fichiersDeScanRetenus).toBe(12);
  });

  it('l\'interrupteur général se dit comme tel', () => {
    const inst = instantane({ all_paused: true });
    const c = ceQuiTourne(inst)!;
    expect(c.lignes.find((l) => l.id === 'dynamic_range')!.raisonCle).toBe('v2.health.running.why.allPaused');
  });

  it('sans durée publiée, aucune durée n\'est citée', () => {
    const pp = priorite({ pause_between_items_ms: undefined, policy: { enabled: true } });
    const c = ceQuiTourne(instantane({ playback_priority: pp }))!;
    const enr = c.lignes.find((l) => l.id === 'enrichment')!;
    expect(enr.raisonCle).toBe('v2.health.running.why.slowed');
    expect(enr.params).toBeUndefined();
    expect(c.lignes.find((l) => l.id === 'scan')!.raisonCle).toBe('v2.health.running.why.slowed');
  });

  it('une passe qui décode au repos SANS avoir cédé n\'est pas montrée', () => {
    const c = ceQuiTourne(instantane())!;
    expect(c.lignes.find((l) => l.id === 'fingerprints')).toBeUndefined();
  });

  it('un serveur ancien (ni pausable ni playback_priority) : pas de section', () => {
    expect(ceQuiTourne({ tasks: [] })).toBeNull();
    expect(ceQuiTourne(null)).toBeNull();
  });

  it('la phrase de lecture suit le nombre de zones et les freins coupés', () => {
    expect(phraseLecture(ceQuiTourne(instantane()))!.cle).toBe('v2.health.running.playbackOne');
    expect(phraseLecture(ceQuiTourne(instantane({ playback_priority: priorite({ playing_zone_ids: [1, 2] }) })))).toEqual({
      cle: 'v2.health.running.playbackMany', params: { n: 2 },
    });
    expect(phraseLecture(ceQuiTourne(instantane({ playback_priority: priorite({ playback_active: false, playing_zone_ids: [] }) })))!.cle)
      .toBe('v2.health.running.playbackIdle');
    expect(ceQuiTourne(instantane({ playback_priority: priorite({ policy: { enabled: false } }) }))!.lecture!.freinsDesactives).toBe(true);
  });

  it('toutes les clés employées existent en français', () => {
    const c = ceQuiTourne(instantane())!;
    const cles = new Set<string>(['v2.health.running.title', 'v2.health.running.since', 'v2.health.running.brakes',
      'v2.health.running.nothing', 'v2.health.running.idleCount', 'v2.health.running.progress', 'v2.health.running.brakesOff']);
    for (const l of c.lignes) {
      if (l.nomCle) cles.add(l.nomCle);
      if (l.raisonCle) cles.add(l.raisonCle);
      cles.add(`v2.health.running.state.${l.etat}`);
    }
    for (const k of cles) expect(fr[k], k).toBeTruthy();
    expect(remplir(fr['v2.health.running.why.itemPause'], { s: 5 })).toContain('5 s');
  });
});

// ── L'écran monté ──────────────────────────────────────────────────────────
const VIDE = /\/(zones|devices|profiles|shortcuts|collections)(\?|\/|$)/;
let corpsTaches: unknown = null;

function corpsPour(chemin: string): unknown {
  if (chemin.includes('/system/background-tasks')) return corpsTaches;
  if (chemin.includes('/system/scan/status')) return { scanning: false };
  if (VIDE.test(chemin)) return [];
  return {};
}

function enveloppe(corps: unknown): Response {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const brut = String(typeof url === 'string' ? url : (url?.url ?? ''));
    return enveloppe(corpsPour(brut.replace(/^https?:\/\/[^/]+/, '').split('?')[0]));
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} } as any);
});

afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const souffler = (ms = 60) => new Promise((r) => setTimeout(r, ms));

async function monterLEcran() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(TuneHealthV2, { target: hote });
  flushSync();
  await souffler(150);
  flushSync();
  return hote;
}

describe('« Ce qui tourne » — l\'écran monté', () => {
  it('montre les tâches, leur état et pourquoi', async () => {
    corpsTaches = instantane();
    const h = await monterLEcran();
    const section = h.querySelector('[data-testid="running-tasks"]') as HTMLElement | null;
    expect(section, 'la section « Ce qui tourne » doit être rendue').not.toBeNull();
    const texte = section!.textContent ?? '';
    expect(texte).toContain(fr['v2.health.running.title']);
    expect(texte).toContain(fr['v2.health.running.playbackOne']);

    const rg = section!.querySelector('[data-tache="replaygain"]') as HTMLElement;
    expect(rg.dataset.etat).toBe('cedee');
    expect(rg.textContent).toContain(fr['v2.health.running.why.decodeYield']);

    const enr = section!.querySelector('[data-tache="enrichment"]') as HTMLElement;
    expect(enr.textContent).toContain(remplir(fr['v2.health.running.why.itemPause'], { s: 5 }));
    expect(enr.textContent).toContain('MusicBrainz');

    expect(section!.querySelector('[data-tache="dynamic_range"]')!.textContent).toContain(fr['v2.health.running.why.paused']);
    expect(section!.querySelector('[data-tache="scan"]')!.textContent)
      .toContain(remplir(fr['v2.health.running.why.scanNarrow'], { n: 2, ms: 20 }));
    expect(section!.querySelector('[data-tache="inconnue_du_client"]')).toBeNull();
  });

  it('se tait face à un serveur qui ne publie rien de tout cela', async () => {
    corpsTaches = { tasks: [] };
    const h = await monterLEcran();
    expect(h.querySelector('[data-testid="running-tasks"]')).toBeNull();
  });
});
