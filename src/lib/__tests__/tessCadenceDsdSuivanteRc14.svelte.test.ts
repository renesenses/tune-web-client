// @vitest-environment jsdom
//
// rc14 (tune-server-rust#9575, fil 3103) — après un changement de cible DSD
// (DSD128 -> DSD256), le chemin du signal publie la cadence EN COURS dans
// `params.rate` et la prochaine dans `params.pending_rate`.
//
//   1. le panneau affiche la cadence JOUÉE, pas la cible de la chaîne ;
//   2. `pending_rate` présent : « {cadence} à la piste suivante », traduit
//      (jamais le `detail` anglais du serveur) ;
//   3. serveur ancien, sans ces champs : rien ne change ;
//   4. la clé existe dans les vingt langues, traduite.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

import CheminTess from '../../components/v2/tess/CheminTess.svelte';
import { cadenceJoueeDsd, annonceCadenceSuivante, resumeEtapeBarre } from '../tessBarre';
import type { ReponseTessZone } from '../tess';
import { locale } from '../i18n';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const en = dictionnaire('en');
const tr = (k: string) => en[k] ?? k;
const trn = (k: string, n: number) => `${tr(k)} ${n}`;

const etape = (code: string, over: Record<string, unknown> = {}) => ({
  code, plugin_id: null, fixed: true, requested: true, effective: true, reason: null, detail: null, params: null,
  latency_frames: null, ...over,
});
/** Cible de la chaîne : DSD256 ; `joue` : ce que le chemin dit jouer. */
function reponse(params: { up?: Record<string, unknown> | null; mod?: Record<string, unknown> | null }): ReponseTessZone {
  return {
    contract_version: 1, zone_id: 7, transport: 'local', applicability: { status: 'applied' },
    chain: { version: 1, bypass_all: false, plugins: [], fixed: { headroom: { mode: 'auto' }, upsampling: { mode: 'dsd', rate: 'dsd256', filter: 'polyvalent' }, quantization: { dither: 'tpdf' } } },
    active_preset: null, headroom_db: -3, volume: { control: 'software', placement: 'before_dsd_modulator', db: 0 },
    badge: 'processed_by_tess',
    signal_path: [
      etape('source'), etape('headroom'),
      etape('upsampling', { params: params.up === null ? null : { target: 'dsd', ...params.up } }),
      etape('volume'),
      etape('dsd_modulator', { params: params.mod === null ? null : { target: 'dsd', transport: 'native', ...params.mod } }),
      etape('output'),
    ] as any,
    catalog: { plugins: [], groups: [] },
  } as unknown as ReponseTessZone;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); locale.set('en'); });
afterEach(() => { if (monte) unmount(monte); monte = null; hote?.remove(); hote = null; });

function ligneUpsampling(r: ReponseTessZone): string {
  monte = mount(CheminTess, { target: hote!, props: { reponse: r, verrouDe: () => null, onSelect() {}, onToggle() {}, onRemove() {}, onMove() {}, onBypass() {}, onAdd() {} } as any });
  flushSync();
  return hote!.querySelector('[data-tess-etape="upsampling"] .sous')!.textContent!.trim();
}

describe('rc14 : cadence DSD jouée et annonce de la suivante', () => {
  it('cadence jouée ≠ cible : le panneau dit DSD128, pas DSD256', () => {
    const t = ligneUpsampling(reponse({ up: { rate: 'dsd128' }, mod: { rate: 'dsd128' } }));
    expect(t).toContain('DSD128');
    expect(t).not.toContain('DSD256');
  });

  it('`pending_rate` présent : « DSD256 à la piste suivante », le detail anglais est tu', () => {
    const r = reponse({
      up: { rate: 'dsd128', pending_rate: 'dsd256', detail: 'DSD256 at the next track' },
      mod: { rate: 'dsd128', pending_rate: 'dsd256' },
    });
    (r.signal_path[2] as any).detail = 'DSD256 at the next track';
    const t = ligneUpsampling(r);
    const morceaux = t.split(' · ');
    expect(morceaux).toEqual(['DSD128', en['v2.lbl.native'], 'DSD256 at the next track']);
    expect(hote!.textContent).not.toContain('{rate}');
  });

  it('en français : la phrase est traduite', () => {
    locale.set('fr');
    const t = ligneUpsampling(reponse({ up: { rate: 'dsd128', pending_rate: 'dsd256' }, mod: { rate: 'dsd128' } }));
    expect(t).toContain('DSD256 à la piste suivante');
  });

  it('absence de `pending_rate` (serveur ancien) : cible de la chaîne, aucune annonce', () => {
    const t = ligneUpsampling(reponse({ up: null, mod: { transport: 'native' } }));
    expect(t.startsWith('DSD256')).toBe(true);
    expect(t).not.toContain(en['tess.dsd.atNextTrack'].replace('{rate}', '').trim());
  });

  it('`pending_rate` égal à la cadence jouée, ou illisible : pas d\'annonce', () => {
    const etapes = (rate: unknown, pending: unknown) => [{ code: 'upsampling', params: { target: 'dsd', rate, pending_rate: pending } }];
    expect(annonceCadenceSuivante(etapes('dsd128', 'dsd128'), tr)).toBe('');
    expect(annonceCadenceSuivante(etapes('dsd128', 42), tr)).toBe('');
    expect(annonceCadenceSuivante(etapes('dsd128', 'dsd256'), tr)).toBe('DSD256 at the next track');
    expect(cadenceJoueeDsd([{ code: 'dsd_modulator', params: { rate: 'dsd64' } }])).toBe('DSD64');
    expect(cadenceJoueeDsd([])).toBe('');
  });

  it('la barre : cadence jouée et annonce sur l\'étage upsampling ; sans le champ, inchangé', () => {
    const c = { badge: 'processed_by_tess', steps: [] } as any;
    const avec = { code: 'upsampling', effective: true, params: { target: 'dsd', rate: 'dsd128', pending_rate: 'dsd256' } };
    expect(resumeEtapeBarre(avec as any, c, tr, trn)).toBe('DSD128 · DSD256 at the next track');
    const sans = { code: 'upsampling', effective: true, params: { target: 'dsd', rate: 'dsd128' } };
    expect(resumeEtapeBarre(sans as any, c, tr, trn)).toBe('DSD128');
  });

  it('la clé existe, traduite, dans les vingt langues', () => {
    expect(ONZE_LANGUES.length).toBe(20);
    for (const code of ONZE_LANGUES) {
      const v = dictionnaire(code)['tess.dsd.atNextTrack'];
      expect(v, code).toContain('{rate}');
      if (code !== 'en') expect(v, code).not.toBe(en['tess.dsd.atNextTrack']);
    }
  });
});
