// @vitest-environment jsdom
//
// tune-server-rust#2264 — décisions du 07/10/2026 :
//   - Lecture en cours dit quelle VERSION joue (source et qualité) et la
//     mention « version de repli » ;
//   - la règle se règle PAR PROFIL, dans les réglages du profil ;
//   - un lancement depuis « Autres versions » est un choix explicite.
//
// Chaque témoin monte le composant réel. Contre-épreuves : sans `version`
// (serveur antérieur) ou sans substitution, la pastille ne dit RIEN.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import VersionJoueePastille from '../../components/partages/VersionJoueePastille.svelte';
import ReglageVersionJouee from '../../components/v2/ReglageVersionJouee.svelte';
import { locale } from '../i18n';
import { mentionVersion, type VersionJoueeServeur } from '../versionJouee';
import { choixExplicite, libelleRegle } from '../groupesVersions';

import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';
import hu from '../locales/hu';

const tFr = (k: string) => (fr as Record<string, string>)[k] ?? k;

function version(p: Partial<VersionJoueeServeur>): VersionJoueeServeur {
  return { origin: 'rule', rule: 'local', rule_origin: 'default', requested: null, fallback: false, unavailable_source: null, ...p };
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

async function souffler(n = 8) {
  for (let i = 0; i < n; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status < 400, status,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: async () => JSON.stringify(corps),
    json: async () => corps,
  } as unknown as Response;
}

beforeEach(() => {
  locale.set('fr');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

function monter(Composant: any, props: Record<string, unknown>) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(Composant, { target: hote, props });
}

const texte = (e: Element | null) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('#2264 — Lecture en cours dit quelle version joue', () => {
  it('la règle a substitué : la version JOUÉE, source et qualité', async () => {
    monter(VersionJoueePastille, {
      piste: {
        source: 'local', format: 'flac', sample_rate: 96000, bit_depth: 24,
        version: version({ requested: { track_id: 1, source: 'local', source_id: null } }),
      },
    });
    await souffler();
    const p = document.querySelector('[data-version-jouee]');
    expect(texte(p)).toBe('Version jouée : Bibliothèque · FLAC 96 kHz / 24 bit');
    expect(p?.classList.contains('repli')).toBe(false);
    expect(p?.getAttribute('title')).toContain('Bibliothèque d\'abord');
  });

  it('🔴 le repli est SIGNALÉ, avec la source préférée indisponible', async () => {
    monter(VersionJoueePastille, {
      piste: {
        source: 'local', format: 'flac', sample_rate: 44100, bit_depth: 16,
        version: version({ rule: 'service:qobuz', fallback: true, unavailable_source: 'qobuz' }),
      },
    });
    await souffler();
    const p = document.querySelector('[data-version-jouee]');
    expect(p?.classList.contains('repli')).toBe(true);
    expect(texte(p?.querySelector('.mention-repli') ?? null)).toBe('version de repli');
    expect(p?.getAttribute('title')).toContain('La version préférée (Qobuz) est indisponible');
  });

  it('un choix explicite est dit comme tel', () => {
    const m = mentionVersion({ source: 'qobuz', format: 'flac', sample_rate: 192000, bit_depth: 24, version: version({ origin: 'explicit' }) }, tFr);
    expect(m?.texte).toBe('Version jouée : Qobuz · FLAC 192 kHz / 24 bit (choisie à la main)');
    expect(m?.repli).toBeNull();
  });

  it('contre-épreuve : rien à dire quand la piste lancée joue, ou d\'un serveur antérieur', async () => {
    expect(mentionVersion({ source: 'local', version: version({}) }, tFr)).toBeNull();
    expect(mentionVersion({ source: 'local' }, tFr)).toBeNull();
    monter(VersionJoueePastille, { piste: { source: 'local', version: null } });
    await souffler();
    expect(document.querySelector('[data-version-jouee]')).toBeNull();
  });
});

describe('#2264 — la pastille est dans Lecture en cours', () => {
  it('NowPlaying la monte sur la piste affichée, à côté de la pastille de service', () => {
    // Garde de source : monter NowPlaying entier (5 000 lignes, vingt stores)
    // ne prouverait rien de plus que ce branchement.
    const src = readFileSync(resolve(process.cwd(), 'src/components/partages/NowPlaying.svelte'), 'utf-8');
    const i = src.indexOf('<ServiceBadge source={displayTrack.source} />');
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, i + 400)).toContain('<VersionJoueePastille piste={displayTrack} />');
  });
});

describe('#2264 — la règle se règle pour le profil actif', () => {
  type Appel = { url: string; method: string; body: unknown };
  let appels: Appel[];
  let regleProfil: string | null;

  beforeEach(() => {
    appels = [];
    regleProfil = null;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      appels.push({ url, method, body });
      if (url.includes('/library/versions/rule')) {
        if (method === 'PUT') regleProfil = (body as { rule: string | null }).rule;
        if (url.includes('scope=global')) return reponse(200, { rule: 'quality', origin: 'setting', scope: 'global', profile_id: null });
        return reponse(200, regleProfil
          ? { rule: regleProfil, origin: 'profile', scope: 'profile', profile_id: 1 }
          : { rule: 'quality', origin: 'setting', scope: 'profile', profile_id: 1 });
      }
      return reponse(200, {});
    }));
  });

  it('montre le défaut suivi, puis range la règle choisie, puis la retire', async () => {
    monter(ReglageVersionJouee, {});
    await souffler();
    const sel = document.querySelector('[data-reglage="version-jouee"] select') as HTMLSelectElement;
    expect(sel).toBeTruthy();
    expect(sel.value).toBe('');
    expect(texte(sel.options[0])).toBe('Défaut du serveur (Meilleure qualité)');
    expect([...sel.options].map((o) => o.value)).toEqual(['', 'local', 'quality', 'service:qobuz', 'service:tidal', 'service:deezer', 'service:spotify']);

    sel.value = 'service:qobuz';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await souffler();
    const put = appels.find((a) => a.method === 'PUT');
    expect(put?.body).toEqual({ rule: 'service:qobuz' });
    expect(sel.value).toBe('service:qobuz');

    sel.value = '';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await souffler();
    expect(appels.filter((a) => a.method === 'PUT').at(-1)?.body).toEqual({ rule: null });
    expect(sel.value).toBe('');
  });
});

describe('#2264 — un serveur sans la route', () => {
  it('contre-épreuve : réponse d\'une autre forme → aucun réglage affiché, aucune erreur', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse(200, {})));
    monter(ReglageVersionJouee, {});
    await souffler();
    expect(document.querySelector('[data-reglage="version-jouee"]')).toBeNull();
  });
});

describe('#2264 — aides et libellés', () => {
  it('un lancement depuis « Autres versions » porte le drapeau du choix explicite', () => {
    expect(choixExplicite({ track_id: 7 })).toEqual({ track_id: 7, explicit_version: true });
    expect(choixExplicite(null)).toBeNull();
  });

  it('chaque règle a son libellé', () => {
    expect(libelleRegle('local', tFr)).toBe('Bibliothèque d\'abord');
    expect(libelleRegle('quality', tFr)).toBe('Meilleure qualité');
    expect(libelleRegle('service:tidal', tFr)).toBe('Tidal d\'abord');
  });

  it('les libellés existent dans les onze langues', () => {
    const cles = [
      'nowplaying.version.played', 'nowplaying.version.library', 'nowplaying.version.fallback',
      'nowplaying.version.fallbackTip', 'nowplaying.version.ruleTip', 'nowplaying.version.explicit',
      'profiles.versionRule.title', 'profiles.versionRule.hint', 'profiles.versionRule.inherit',
      'profiles.versionRule.local', 'profiles.versionRule.quality', 'profiles.versionRule.service',
      'profiles.versionRule.error',
    ];
    for (const dict of [fr, en, de, es, it_, ja, ko, ro, sv, zh, hu] as Record<string, string | undefined>[]) {
      for (const c of cles) expect(dict[c], c).toBeTruthy();
      expect(dict['nowplaying.version.fallbackTip']).toContain('{source}');
      expect(dict['profiles.versionRule.service']).toContain('{service}');
      expect(dict['profiles.versionRule.inherit']).toContain('{rule}');
    }
  });
});
