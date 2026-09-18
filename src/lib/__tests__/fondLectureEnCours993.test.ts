/**
 * #993 — « Fond d'écran délavé dans lecture en cours. Pas assez de
 * contraste. » (FabienM, fil 1774, point 5).
 *
 * Arbitrage de Bertrand, 13/09/2026 : ASSOMBRIR le fond, pas le remplacer
 * par le fond du thème. La pochette floutée reste ; sa luminosité tombe
 * sous 0.15 — une pochette entièrement blanche plafonne alors à #262626,
 * le gris d'un fond sombre, et le texte blanc garde son contraste.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(process.cwd(), 'src/components/partages/NowPlaying.svelte'), 'utf-8');

function luminosite(selecteur: string): number {
  const i = src.indexOf(selecteur);
  expect(i, selecteur).toBeGreaterThan(-1);
  const bloc = src.slice(i, src.indexOf('}', i));
  const m = bloc.match(/brightness\(([\d.]+)\)/);
  expect(m, `brightness dans ${selecteur}`).not.toBeNull();
  return Number(m![1]);
}

describe('#993 — le fond de Lecture en cours', () => {
  it('reste la pochette floutée (le parti pris est gardé)', () => {
    expect(src).toContain('<div class="bg-blur" style="background-image: url({resolvedCoverUrl})"></div>');
    expect(luminosite('.bg-blur {')).toBeGreaterThan(0);
  });
  it('🔴 mais assombrie sous 0.15 — et le kiosque au moins autant', () => {
    const normal = luminosite('.bg-blur {');
    const kiosque = luminosite(':global([data-kiosk]) .bg-blur {');
    expect(normal).toBeLessThanOrEqual(0.15);
    expect(kiosque).toBeLessThanOrEqual(normal);
  });
});

describe('le fond de Lecture en cours suit la TEINTE du thème (17/09/2026)', () => {
  it('une couche de la couleur du thème couvre la pochette assombrie, sans la remplacer', () => {
    expect(src).toContain('<div class="bg-teinte" aria-hidden="true"></div>');
    const i = src.indexOf('.bg-teinte {');
    const bloc = src.slice(i, src.indexOf('}', i));
    // Hors du nouveau client, le jeton manque : la couche est transparente.
    expect(bloc).toContain('background: var(--v2-bg, transparent);');
    const opacite = Number(bloc.match(/opacity:\s*([\d.]+)/)![1]);
    expect(opacite).toBeGreaterThan(0.5);
    expect(opacite).toBeLessThan(1); // la pochette reste perceptible
  });

  it('écartée sur les deux thèmes clairs, pour garder le contraste de #993', () => {
    expect(src).toContain(':global(:root[data-v2-theme="clear-white"]) .bg-teinte');
    expect(src).toContain(':global(:root[data-v2-theme="clear-grey"]) .bg-teinte');
  });
});
