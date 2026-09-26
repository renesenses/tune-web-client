// @vitest-environment jsdom
//
// « Plage dynamique » — serveur renesenses/tune-server-rust#5168 et #5169.
//
// #5169 : la plage dynamique décodait en DERNIER, après le ReplayGain, les
// empreintes et en alternance avec le CLAP. Le serveur annonce désormais un
// réglage d'ordre dans `GET /system/background-tasks`
// (`dynamic_range_priority`) ; l'écran doit le proposer, et le CHANGER par la
// route `POST /system/background-tasks/dynamic-range-priority`.
//
// #5168 : les DR lus dans les `foo_dr.txt` doivent être comptés À PART sur la
// carte (`dynamic_range_from_sidecar_file`).
//
// 🔴 CE TÉMOIN MONTE L'ÉCRAN, CHOISIT ET LIT LA REQUÊTE PARTIE — sa méthode,
// son chemin, son corps. Et les contre-épreuves : un serveur qui ne connaît
// pas le réglage (≤ 0.9.166) n'affiche AUCUN sélecteur, et un serveur sans le
// compte des rapports garde la ligne d'origine.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import TuneHealthV2 from '../../components/v2/TuneHealthV2.svelte';
import lFr from '../locales/fr';
import { choixPrioriteDr } from '../tachesDeFond';

type Requete = { methode: string; chemin: string; corps: string | null };
let requetes: Requete[] = [];
let connaitLaPriorite = true;
let connaitLesRapports = true;
let priorite = 'last';

const VIDE = /\/(zones|devices|profiles|shortcuts|collections)(\?|\/|$)/;

function corpsPour(chemin: string): unknown {
  if (chemin.includes('/system/background-tasks')) {
    const base: Record<string, unknown> = {
      tasks: [],
      pausable: [{ id: 'dynamic_range', state: 'au_repos', paused: false }],
      all_paused: false,
      scan_pausable: false,
    };
    if (connaitLaPriorite) {
      base.dynamic_range_priority = priorite;
      base.dynamic_range_priority_choices = ['last', 'before_fingerprints', 'first'];
      base.dynamic_range_sidecar = {
        running: false,
        last: { folders: 1234, tracks_written: 56, folders_read: 12 },
        last_finished_epoch_s: 1,
      };
    }
    return base;
  }
  if (chemin.includes('/library/stats/completeness')) {
    const c: Record<string, unknown> = {
      total_tracks: 1000,
      with_dynamic_range: 300,
      dynamic_range_from_analysis: 100,
      dynamic_range_from_tag: 22,
      dynamic_range_unavailable: 0,
      dynamic_range_deferred: 0,
    };
    if (connaitLesRapports) c.dynamic_range_from_sidecar_file = 178;
    return c;
  }
  if (chemin.includes('/system/config')) {
    return { replaygain_mode: 'track', replaygain_analysis_enabled: true };
  }
  if (chemin.includes('/system/scan/status')) return { scanning: false };
  if (VIDE.test(chemin)) return [];
  return {};
}

function enveloppe(corps: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  requetes = [];
  connaitLaPriorite = true;
  connaitLesRapports = true;
  priorite = 'last';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any, init?: any) => {
      const brut = String(typeof url === 'string' ? url : (url?.url ?? ''));
      const chemin = brut.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
      const methode = String(init?.method ?? 'GET').toUpperCase();
      const corps = typeof init?.body === 'string' ? init.body : null;
      requetes.push({ methode, chemin, corps });
      if (methode === 'POST' && chemin.endsWith('/background-tasks/dynamic-range-priority')) {
        priorite = JSON.parse(corps ?? '{}').priority;
      }
      return enveloppe(corpsPour(chemin));
    }),
  );
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
  } as any);
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
  await souffler(120);
  flushSync();
  return hote;
}

function carteDr(): HTMLElement | null {
  const cartes = Array.from(hote!.querySelectorAll('article.card')) as HTMLElement[];
  return cartes.find((c) => c.querySelector('h2')?.textContent?.trim() === lFr['v2.health.cardDr']) ?? null;
}

describe('#5169 — l’ordre de passage de la plage dynamique', () => {
  it('🔴 le sélecteur est proposé et le choix PART vers le serveur', async () => {
    await monterLEcran();
    const dr = carteDr();
    expect(dr, 'la carte Plage dynamique doit être rendue').toBeTruthy();
    const choix = dr!.querySelector('select') as HTMLSelectElement | null;
    expect(
      choix,
      'aucun sélecteur d’ordre sur la carte : le réglage du serveur #5169 reste inaccessible',
    ).toBeTruthy();
    expect(choix!.value).toBe('last');
    expect(Array.from(choix!.options).map((o) => o.textContent?.trim())).toEqual([
      lFr['v2.health.drPriorityLast'],
      lFr['v2.health.drPriorityBeforeFingerprints'],
      lFr['v2.health.drPriorityFirst'],
    ]);

    choix!.value = 'first';
    choix!.dispatchEvent(new Event('change', { bubbles: true }));
    await souffler(120);
    flushSync();

    const posts = requetes.filter(
      (r) => r.methode === 'POST' && r.chemin.endsWith('/system/background-tasks/dynamic-range-priority'),
    );
    expect(posts.length, `aucun POST de priorité n’est parti : ${JSON.stringify(requetes)}`).toBe(1);
    expect(JSON.parse(posts[0].corps ?? '{}')).toEqual({ priority: 'first' });
    // Le détail de la carte suit le réglage.
    expect(carteDr()!.querySelector('.detail')?.textContent).toContain(
      lFr['v2.health.drQueuedFirst'].split('{n}')[1],
    );
  });

  it('contre-épreuve : un serveur qui ne connaît pas le réglage n’affiche AUCUN sélecteur', async () => {
    connaitLaPriorite = false;
    await monterLEcran();
    expect(carteDr(), 'la carte doit être rendue').toBeTruthy();
    expect(carteDr()!.querySelector('select')).toBeNull();
    expect(carteDr()!.querySelector('.detail')?.textContent).toContain(
      lFr['v2.health.drQueuedBehindRg'].split('{n}')[1],
    );
  });

  it('la lecture de l’instantané ne propose que ce qu’elle sait nommer', () => {
    expect(choixPrioriteDr(null)).toBeNull();
    expect(choixPrioriteDr({ tasks: [] })).toBeNull();
    expect(choixPrioriteDr({ tasks: [], dynamic_range_priority: 'bientot' })).toBeNull();
    expect(
      choixPrioriteDr({
        tasks: [],
        dynamic_range_priority: 'first',
        dynamic_range_priority_choices: ['last', 'first', 'inconnu'],
      }),
    ).toEqual({ courante: 'first', choix: ['last', 'first'] });
  });
});

describe('#5168 — les DR lus dans les foo_dr.txt, comptés à part', () => {
  it('🔴 la ligne de la carte nomme les pistes lues dans les foo_dr.txt', async () => {
    await monterLEcran();
    const ligne = carteDr()!.querySelector('.line')?.textContent ?? '';
    expect(
      ligne,
      'la carte doit compter à part les DR lus dans les foo_dr.txt (#5168)',
    ).toContain('178');
    expect(ligne).toContain('178' + lFr['v2.health.drLineSidecar'].split('{s}')[1]);
    const detail = carteDr()!.querySelector('.detail')?.textContent ?? '';
    const [avantD] = lFr['v2.health.drSidecarLast'].split('{d}');
    expect(detail).toContain(avantD);
    expect(detail).toContain('56');
  });

  it('contre-épreuve : un serveur sans ce compte garde la ligne d’origine', async () => {
    connaitLesRapports = false;
    await monterLEcran();
    const ligne = carteDr()!.querySelector('.line')?.textContent ?? '';
    expect(ligne).not.toContain('foo_dr');
    expect(ligne).toContain(lFr['v2.health.drLine'].split('{g}')[1]);
  });
});
