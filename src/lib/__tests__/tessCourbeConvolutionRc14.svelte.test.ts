// @vitest-environment jsdom
//
// rc14 (Rémi, GO de Bertrand) — la courbe du filtre de convolution dans le
// panneau Convolution de TESS, avec la phase.
//
//   1. la courbe (composant partagé `FirResponseCurve`, celui du bloc de
//      correction de pièce) est montée dans le panneau Convolution quand un
//      jeu de filtres est actif, et se relit après un dépôt ;
//   2. la phase est MASQUÉE par défaut ; le bouton l'affiche ; le serveur
//      publie la phase DÉROULÉE (retard retiré) : c'est elle qui se trace, une
//      courbe par canal, interrompue là où elle n'est pas publiée (bruit), et
//      une note dit ce qui a été fait (retard retiré, pas de lissage) ;
//   3. un serveur ancien (phase repliée seulement) garde l'ancien tracé ;
//   4. Réglages ▸ par zone : avec TESS, le bloc renvoie au panneau
//      Convolution ; sans TESS, il reste.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import FirResponseCurve from '../../components/partages/FirResponseCurve.svelte';
import PanneauConvolution from '../../components/v2/tess/PanneauConvolution.svelte';
import { locale } from '../i18n';
import lFr from '../locales/fr';

const FR = lFr as Record<string, string>;

let hote: HTMLDivElement;
let composant: ReturnType<typeof mount> | undefined;
const stabiliser = async () => { for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
const json = (corps: unknown) => new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });

/** Une courbe de 8 points, phase déroulée trouée de 2 points (bruit). */
function points(db: number, phase: (i: number) => number | null) {
  return [20, 50, 100, 500, 1000, 5000, 10000, 20000].map((f, i) => ({
    f, db, phase_deg: ((phase(i) ?? 0) + 180) % 360 - 180, phase_unwrapped_deg: phase(i),
  }));
}
const reponseFft = {
  loaded: true, taps: 4096, sample_rate: 48000, latency_ms: 42.7, grid_points: 512,
  points: points(-3, (i) => -100 * i),
  channels: [
    { channel: 0, taps: 4096, latency_ms: 42.7, phase_delay_samples: 480, phase_delay_ms: 10, points: points(-3, (i) => -100 * i) },
    { channel: 1, taps: 4096, latency_ms: 42.7, phase_delay_samples: 480, phase_delay_ms: 10, points: points(2, (i) => (i === 5 || i === 6 ? null : -50 * i)) },
  ],
};

beforeEach(() => {
  locale.set('fr');
  hote = document.createElement('div');
  document.body.appendChild(hote);
});
afterEach(async () => {
  if (composant) await unmount(composant);
  composant = undefined;
  hote.remove();
  vi.unstubAllGlobals();
});

describe('courbe du filtre : la phase déroulée', () => {
  async function monter(reponse: unknown) {
    vi.stubGlobal('fetch', vi.fn(async () => json(reponse)));
    composant = mount(FirResponseCurve, { target: hote, props: { zoneId: 7 } });
    await stabiliser();
  }

  it('masquée par défaut, affichée au bouton : une courbe par canal, trouée là où elle n’est pas publiée', async () => {
    await monter(reponseFft);
    expect(hote.querySelectorAll('path.magnitude').length).toBe(2);
    expect(hote.querySelector('path.phase'), 'phase masquée par défaut').toBeNull();
    expect(hote.querySelector('[data-fir-phase-note]')).toBeNull();
    const bouton = hote.querySelector<HTMLButtonElement>('[data-fir-phase]')!;
    expect(bouton.getAttribute('aria-pressed')).toBe('false');
    bouton.click();
    flushSync();
    expect(bouton.getAttribute('aria-pressed')).toBe('true');
    const phases = [...hote.querySelectorAll<SVGPathElement>('path[data-phase-deroulee]')];
    expect(phases.map((p) => p.getAttribute('data-channel'))).toEqual(['0', '1']);
    const d0 = phases[0].getAttribute('d')!;
    const d1 = phases[1].getAttribute('d')!;
    expect(d0.match(/M/g)?.length, 'canal 0 : un seul trait').toBe(1);
    expect(d1.match(/M/g)?.length, 'canal 1 : interrompu par le trou').toBe(2);
    // Déroulée : pas de repli à ±180°, l'échelle s'étend (−700° ⇒ ±720°).
    expect([...hote.querySelectorAll('.phase-label')].map((t) => t.textContent)).toContain('-720°');
    expect(hote.querySelector('[data-fir-phase-note]')?.textContent?.trim())
      .toBe(FR['zoneConfig.firPhaseUnwrappedNote'].replace('{ms}', (10).toLocaleString()));
    bouton.click();
    flushSync();
    expect(hote.querySelector('path.phase')).toBeNull();
  });

  it('serveur ancien (phase repliée seulement) : l’ancien tracé, sans note', async () => {
    const vieux = (db: number) => [20, 100, 1000, 10000, 20000].map((f) => ({ f, db, phase_deg: -170 + f / 200 }));
    await monter({ loaded: true, taps: 1024, sample_rate: 48000, latency_ms: 10, points: vieux(0) });
    hote.querySelector<HTMLButtonElement>('[data-fir-phase]')!.click();
    flushSync();
    expect(hote.querySelector('path.phase')).not.toBeNull();
    expect(hote.querySelector('path[data-phase-deroulee]')).toBeNull();
    expect(hote.querySelector('[data-fir-phase-note]')).toBeNull();
    expect([...hote.querySelectorAll('.phase-label')].map((t) => t.textContent)).toEqual(['-180°', '-90°', '0°', '+90°', '+180°']);
  });
});

describe('panneau Convolution de TESS : la courbe du filtre chargé', () => {
  it('jeu actif : la courbe est montée et lue sur la route de la zone', async () => {
    const appels: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: any) => {
      const u = String(url);
      appels.push(u);
      if (u.includes('/room-correction/ir/status/')) {
        return json({ active: true, zone_id: 7, ir_path: '/d/salon.wav', files: [{ path: '/d/salon.wav', sample_rate: 48000, channels: 2, taps: 4096, main: true }], resample: true, in_use: null });
      }
      if (u.includes('/convolver/response')) return json(reponseFft);
      return json({});
    }));
    composant = mount(PanneauConvolution, { target: hote, props: { zoneId: 7 } });
    await stabiliser();
    expect(hote.querySelector('[data-conv-courbe]')).not.toBeNull();
    expect(appels.some((u) => u.endsWith('/zones/7/convolver/response'))).toBe(true);
    expect(hote.querySelectorAll('[data-conv-courbe] path.magnitude').length).toBe(2);
    expect(hote.querySelector('[data-conv-courbe] path.phase'), 'phase masquée par défaut').toBeNull();
  });

  it('aucun jeu : pas de courbe', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: any) => (String(url).includes('/room-correction/ir/status/')
      ? json({ active: false, files: [], resample: true })
      : json({ loaded: false }))));
    composant = mount(PanneauConvolution, { target: hote, props: { zoneId: 7 } });
    await stabiliser();
    expect(hote.querySelector('[data-conv-courbe]')).toBeNull();
  });
});

describe('Réglages ▸ par zone : le bloc de correction de pièce renvoie à TESS', () => {
  it('avec TESS : renvoi vers le panneau Convolution ; sans TESS : le bloc reste', () => {
    const src = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
    const i = src.indexOf('data-renvoi-tess-fir');
    expect(i).toBeGreaterThan(-1);
    const avant = src.lastIndexOf('{#if dspRegroupeDansTess($capaciteTess)}', i);
    expect(avant).toBeGreaterThan(-1);
    const bloc = src.slice(avant, src.indexOf('{/if}', i));
    expect(bloc).toContain("ouvrirTess('convolution')");
    expect(bloc).toContain('{:else}');
    expect(bloc).toContain('<CorrectionAcoustiqueZone zone={z} />');
    void get;
  });
});
