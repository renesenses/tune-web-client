// @vitest-environment jsdom
//
// tune-server-rust#9038 (fil 2828, rc12) — dans une playlist Spotify, chaque
// titre portait « Lossy OGG 44.1/16 », alors que la lecture partait en FLAC
// 44,1 kHz / 24 bits : la règle de version du profil (« Meilleure qualité »)
// jouait la version Qobuz du même enregistrement. L'étiquette décrit la
// version du service, sans dire qu'une autre peut jouer.
//
// Tenu ici : avec une règle qui peut remplacer la piste, la cellule Qualité
// d'une piste de service porte une marque (⇄) et une infobulle qui le dit ;
// contre-épreuves : aucune règle, règle « ce service », piste locale.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import ListePistesV2 from '../../components/v2/ListePistesV2.svelte';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';
import { oublierRegleDeVersion, peutJouerUneAutreVersion } from '../qualiteSelonRegle';

const SPOTIFY = { id: null, title: 'Titre', artist_name: 'A', source: 'spotify', source_id: 's1', format: 'OGG', sample_rate: 44100, bit_depth: 16 };
const LOCALE = { id: 3, title: 'Locale', artist_name: 'A', source: 'local', format: 'flac', sample_rate: 44100, bit_depth: 16 };

describe('#9038 — peutJouerUneAutreVersion', () => {
  it('une règle qui peut remplacer une piste de service', () => {
    expect(peutJouerUneAutreVersion('spotify', 'quality')).toBe(true);
    expect(peutJouerUneAutreVersion('spotify', 'service:qobuz')).toBe(true);
    expect(peutJouerUneAutreVersion('spotify', 'local')).toBe(true);
  });
  it('contre-épreuves : sans règle, règle de ce service, piste locale ou autre source', () => {
    expect(peutJouerUneAutreVersion('spotify', 'none')).toBe(false);
    expect(peutJouerUneAutreVersion('spotify', null)).toBe(false);
    expect(peutJouerUneAutreVersion('spotify', 'service:spotify')).toBe(false);
    expect(peutJouerUneAutreVersion('local', 'quality')).toBe(false);
    expect(peutJouerUneAutreVersion('radio', 'quality')).toBe(false);
    expect(peutJouerUneAutreVersion(undefined, 'quality')).toBe(false);
  });
});

describe('#9038 — la liste de titres le signale', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;
  let regle = 'quality';
  beforeEach(() => {
    locale.set('fr');
    oublierRegleDeVersion();
    preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
    vi.stubGlobal('fetch', vi.fn(async (entree: unknown) => {
      const url = String(entree);
      const corps = url.includes('/library/versions/rule')
        ? { rule: regle, origin: 'profile', scope: 'profile', profile_id: 1 }
        : [];
      return new Response(JSON.stringify(corps), { headers: { 'content-type': 'application/json' } });
    }));
  });
  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    hote?.remove();
    hote = null;
    vi.unstubAllGlobals();
  });
  async function monter(pistes: Record<string, unknown>[]) {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(ListePistesV2, { target: hote, props: { pistes, onLire: () => {} } as any });
    flushSync();
    for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 0)); await tick(); }
    flushSync();
    return hote;
  }
  it('🔴 règle « Meilleure qualité » : la piste Spotify porte la marque et l’infobulle', async () => {
    regle = 'quality';
    const el = await monter([SPOTIFY]);
    const m = el.querySelector('[data-autre-version]');
    expect(m, 'aucune marque : l’étiquette OGG passe pour la version jouée').not.toBeNull();
    const bulle = m!.getAttribute('title') ?? '';
    expect(bulle).toMatch(/Spotify/);
    expect(bulle).toMatch(/la qualité réelle s'affiche à la lecture/);
    expect(bulle).not.toMatch(/\{rule\}|\{service\}/);
  });
  it('contre-épreuve : règle « Spotify d’abord », ou piste locale → aucune marque', async () => {
    regle = 'service:spotify';
    let el = await monter([SPOTIFY]);
    expect(el.querySelector('[data-autre-version]')).toBeNull();
    unmount(monte!); monte = null; hote?.remove(); hote = null;
    oublierRegleDeVersion();
    regle = 'quality';
    el = await monter([LOCALE]);
    expect(el.querySelector('[data-autre-version]')).toBeNull();
  });
});
