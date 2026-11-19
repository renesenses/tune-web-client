// @vitest-environment jsdom
/**
 * Fil du forum 2954 (rc13, web#3276, server#9173) — une forme d'onde plus
 * FINE dans la barre de lecture : 1 000 points demandés au serveur, une
 * barre tous les 2 px, réduction par le maximum (aucune attaque perdue), et
 * repli propre sur les 200 points d'un serveur d'avant.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  POINTS_ONDE_FIN, PX_PAR_BARRE, cheminOnde, largeurTrait, nombreDeBarres, normaliserOnde, reduireOnde,
} from '../barreOnde';
import { getTrackWaveform } from '../api';
import { chargerOnde } from '../stores/ondePiste';

describe('fil 2954 — nombre de barres selon la largeur et les points', () => {
  it('une barre tous les 2 px, plafonnée au nombre de points', () => {
    expect(PX_PAR_BARRE).toBe(2);
    expect(nombreDeBarres(760, 1000), 'barre du bas (760 px au plus)').toBe(380);
    expect(nombreDeBarres(400, 1000), 'téléphone').toBe(200);
    expect(nombreDeBarres(1600, 1000)).toBe(800);
    expect(nombreDeBarres(2400, 1000), 'jamais plus de barres que de points').toBe(1000);
    expect(nombreDeBarres(30, 1000), 'au moins 24').toBe(24);
    expect(nombreDeBarres(0, 1000), 'largeur pas encore mesurée').toBe(100);
  });

  it('repli : un serveur d’avant rend 200 points, la barre les dessine tous', () => {
    const ancien = { track_id: 1, waveform: Array.from({ length: 200 }, (_, i) => (i % 10) / 10) };
    const onde = normaliserOnde(ancien)!;
    expect(onde).toHaveLength(200);
    expect(nombreDeBarres(760, onde.length)).toBe(200);
    expect(reduireOnde(onde, nombreDeBarres(760, onde.length))).toBe(onde);
    // Barres plus larges qu'à 2 px : le trait garde ses 2/3 de case.
    expect(largeurTrait(760, 200)).toBe(0.66);
  });

  it('la réduction de 1 000 points garde chaque crête à sa place (pas de crénelage)', () => {
    for (const pic of [0, 1, 537, 998, 999]) {
      const points = Array.from({ length: POINTS_ONDE_FIN }, () => 0.1);
      points[pic] = 1;
      const barres = reduireOnde(points, 380);
      expect(barres).toHaveLength(380);
      expect(barres.filter((v) => v === 1), `pic ${pic}`).toHaveLength(1);
      // Position proportionnelle, à une barre près.
      expect(Math.abs(barres.indexOf(1) - Math.floor((pic * 380) / 1000))).toBeLessThanOrEqual(1);
      expect(barres.every((v) => v >= 0.1)).toBe(true);
    }
  });

  it('à 2 px la case, un trait de la moitié de la case', () => {
    expect(largeurTrait(760, 380)).toBe(0.5);
    expect(largeurTrait(760, 253)).toBe(0.66);
    expect(largeurTrait(0, 0)).toBe(0.66);
    const d = cheminOnde([0.5, 1], 0.5);
    expect(d).toContain('h0.5v');
    expect(d.match(/M/g)).toHaveLength(2);
  });
});

describe('fil 2954 — la résolution fine est demandée au serveur', () => {
  afterEach(() => vi.unstubAllGlobals());

  function espion() {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      urls.push(typeof input === 'string' ? input : input.toString());
      return new Response(JSON.stringify({ track_id: 7, waveform: [0.2, 1] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }));
    return urls;
  }

  it('une piste locale : `?points=1000`', async () => {
    const urls = espion();
    await chargerOnde(7);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/\/library\/tracks\/7\/waveform\?points=1000$/);
  });

  it('sans résolution : l’URL d’avant, sans paramètre', async () => {
    const urls = espion();
    await getTrackWaveform(7);
    expect(urls[0]).toMatch(/\/library\/tracks\/7\/waveform$/);
  });
});

describe('fil 2954 — l’onde de la barre du bas tient dans `--transport-height`', () => {
  it('bordure + marge + bouton lecture + interligne + onde + marge ≤ 90 px', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/components/partages/TransportBar.svelte', 'utf8');
    const theme = readFileSync('src/styles/tune-theme.css', 'utf8');
    const hauteurBarre = Number(/--transport-height:\s*(\d+)px/.exec(theme)![1]);
    const bouton = /\.play-btn\s*\{[^}]*?width:\s*(\d+)px;\s*height:\s*(\d+)px/.exec(css);
    expect(bouton, '.play-btn introuvable').not.toBeNull();
    const regle = /\.progress-track\.onde\s*\{\s*height:\s*clamp\(\s*(\d+)px,\s*calc\(var\(--transport-height, 90px\) - (\d+)px - max\((\d+)px[^)]*\)\)\),\s*(\d+)px\s*\)/.exec(css);
    expect(regle, 'la hauteur de l’onde suit la place restante').not.toBeNull();
    const [, mini, retrait, margeBas, maxi] = regle!.map(Number);
    // Le retrait du calc = bordure 1 + marge 6 + bouton + interligne 2.
    expect(retrait).toBe(1 + 6 + Number(bouton![2]) + 2);
    expect(retrait + maxi + margeBas).toBeLessThanOrEqual(hauteurBarre);
    expect(mini).toBe(22);
    expect(maxi).toBeGreaterThan(mini);
  });
});
