// @vitest-environment jsdom
//
// web#1427 — fil 1671 (GgB) : avec un IR stéréo, seule la courbe du canal
// gauche s'affichait. La route `GET /zones/{id}/convolver/response` porte
// désormais `channels` (tune-server-rust#8349) : une trace par canal, avec
// une légende traduite. Sans `channels` (serveur plus ancien, IR mono), la
// seule courbe `points`, comme avant.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import FirResponseCurve from '../../components/partages/FirResponseCurve.svelte';
import { locale } from '../i18n';
import lFr from '../locales/fr';
import { dictionnaire } from './onzeDictionnaires';

const FR = lFr as Record<string, string>;

const courbe = (db: number) => [20, 100, 1000, 10000, 20000].map((f) => ({ f, db, phase_deg: 0 }));

describe('web#1427 — courbe FIR : une trace par canal', () => {
  let hote: HTMLDivElement;
  let composant: ReturnType<typeof mount> | undefined;
  const stabiliser = async () => { for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };

  async function monter(reponse: unknown) {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(reponse), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })));
    composant = mount(FirResponseCurve, { target: hote, props: { zoneId: 7 } });
    await stabiliser();
  }

  beforeEach(() => {
    locale.set('fr');
    hote = document.createElement('div'); document.body.appendChild(hote);
  });
  afterEach(async () => {
    if (composant) await unmount(composant);
    composant = undefined; hote.remove(); vi.unstubAllGlobals();
  });

  it('IR stéréo : deux traces (gauche, droite) aux tracés différents, et leur légende', async () => {
    await monter({
      loaded: true, taps: 65536, sample_rate: 48000, latency_ms: 682.7,
      points: courbe(-3),
      channels: [
        { channel: 0, taps: 65536, latency_ms: 682.7, points: courbe(-3) },
        { channel: 1, taps: 65536, latency_ms: 682.7, points: courbe(4) },
      ],
    });
    const traces = hote.querySelectorAll('path.magnitude');
    expect(traces.length).toBe(2);
    expect(traces[0].getAttribute('d')).not.toBe(traces[1].getAttribute('d'));
    expect([...traces].map((p) => p.getAttribute('data-channel'))).toEqual(['0', '1']);
    const legende = hote.querySelector('.fir-legend')?.textContent ?? '';
    expect(legende).toContain(FR['zoneConfig.firChannelLeft']);
    expect(legende).toContain(FR['zoneConfig.firChannelRight']);
  });

  it('au-delà de deux canaux : « Canal n »', async () => {
    await monter({
      loaded: true, points: courbe(0),
      channels: [0, 1, 2].map((c) => ({ channel: c, points: courbe(c) })),
    });
    expect(hote.querySelectorAll('path.magnitude').length).toBe(3);
    expect(hote.querySelector('.fir-legend')?.textContent).toContain('Canal 3');
  });

  it('sans `channels` (serveur plus ancien) : une seule trace, sans légende', async () => {
    await monter({ loaded: true, taps: 1024, sample_rate: 48000, points: courbe(-3) });
    expect(hote.querySelectorAll('path.magnitude').length).toBe(1);
    expect(hote.querySelector('.fir-legend')).toBeNull();
  });

  it('IR mono (`channels` à une entrée) : une seule trace, sans légende', async () => {
    await monter({ loaded: true, points: courbe(-3), channels: [{ channel: 0, points: courbe(-3) }] });
    expect(hote.querySelectorAll('path.magnitude').length).toBe(1);
    expect(hote.querySelector('.fir-legend')).toBeNull();
  });

  it('phase affichée : une trace de phase par canal, chacune à sa couleur', async () => {
    await monter({
      loaded: true, points: courbe(-3),
      channels: [
        { channel: 0, points: courbe(-3) },
        { channel: 1, points: courbe(4) },
      ],
    });
    (hote.querySelector('.phase-toggle') as HTMLButtonElement).click();
    await stabiliser();
    const phases = [...hote.querySelectorAll('path.phase')];
    expect(phases.length).toBe(2);
    expect(phases[0].classList.contains('phase-0')).toBe(true);
    expect(phases[1].classList.contains('phase-1')).toBe(true);
    // Les règles CSS existent : sans elles, gauche et droite auraient la même couleur.
    const src = (await import('node:fs')).readFileSync(
      (await import('node:path')).resolve(process.cwd(), 'src/components/partages/FirResponseCurve.svelte'), 'utf-8');
    expect(src).toMatch(/\.phase\.phase-0\s*\{[^}]*stroke/);
    expect(src).toMatch(/\.phase\.phase-1\s*\{[^}]*stroke/);
  });

  it('deux canaux au même numéro (serveur fautif) : pas de plantage, deux traces', async () => {
    await monter({
      loaded: true, points: courbe(0),
      channels: [{ channel: 0, points: courbe(-3) }, { channel: 0, points: courbe(4) }],
    });
    expect(hote.querySelectorAll('path.magnitude').length).toBe(2);
  });

  it('un canal sans courbe (0 ou 1 point) : on reste en stéréo et la légende le dit', async () => {
    for (const pts of [[], courbe(4).slice(0, 1)]) {
      if (composant) await unmount(composant);
      composant = undefined; hote.innerHTML = '';
      await monter({
        loaded: true, points: courbe(-3),
        channels: [{ channel: 0, points: courbe(-3) }, { channel: 1, points: pts }],
      });
      const legende = hote.querySelector('.fir-legend')?.textContent ?? '';
      expect(legende).toContain(FR['zoneConfig.firChannelLeft']);
      expect(legende).toContain(
        FR['zoneConfig.firChannelUnavailable'].replace('{channel}', FR['zoneConfig.firChannelRight']));
      expect(hote.querySelectorAll('path.magnitude[data-channel="0"]').length).toBe(1);
    }
  });

  it('accessibilité : le SVG nomme les canaux, les pastilles sont décoratives', async () => {
    await monter({
      loaded: true, points: courbe(-3),
      channels: [{ channel: 0, points: courbe(-3) }, { channel: 1, points: courbe(4) }],
    });
    const label = hote.querySelector('svg.fir-plot')?.getAttribute('aria-label') ?? '';
    expect(label).toContain(FR['zoneConfig.firResponseTitle']);
    expect(label).toContain(FR['zoneConfig.firChannelLeft']);
    expect(label).toContain(FR['zoneConfig.firChannelRight']);
    const pastilles = [...hote.querySelectorAll('.legend-swatch')];
    expect(pastilles.length).toBe(2);
    for (const p of pastilles) expect(p.getAttribute('aria-hidden')).toBe('true');
  });

  it('les libellés de la légende existent dans les 15 langues', async () => {
    const langues = ['de', 'el', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'nb', 'pl', 'ro', 'sv', 'vi', 'zh'];
    for (const l of langues) {
      const dict = dictionnaire(l);
      for (const k of ['firChannelLeft', 'firChannelRight', 'firChannelN', 'firChannelUnavailable']) {
        expect(dict[`zoneConfig.${k}`], `${l} ${k}`).toBeTruthy();
      }
      expect(dict['zoneConfig.firChannelN'], l).toContain('{n}');
      expect(dict['zoneConfig.firChannelUnavailable'], l).toContain('{channel}');
    }
  });
});
