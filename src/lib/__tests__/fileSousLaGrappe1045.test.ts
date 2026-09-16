/**
 * #1045 — Alex Campbell, 14/09/2026 : « The queue vs the profile are still
 * fighting for dominance. » Sur « Lecture en cours », la colonne de la file
 * d'attente est pincée en haut à droite — sous la grappe avatar/signet/
 * loupe/TV que la coquille pose au même endroit, un cran au-dessus. Son
 * en-tête et sa première piste passaient dessous.
 *
 * La coquille mesure le BAS de la grappe et l'écrit dans `--v2-grappe-h` ;
 * la colonne commence là. Hors coquille (ancienne interface), 0.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { reserveHauteDeLaGrappe, RESERVE_HAUTE_MINIMALE, AIR } from '../gouttiereGrappe';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

describe('#1045 — la réserve verticale de la grappe', () => {
  it('mesure + air, jamais sous le minimum', () => {
    expect(reserveHauteDeLaGrappe(52)).toBe(Math.max(RESERVE_HAUTE_MINIMALE, 52 + AIR));
    expect(reserveHauteDeLaGrappe(80)).toBe(80 + AIR);
    expect(reserveHauteDeLaGrappe(80.2)).toBe(81 + AIR);
  });
  it('sans mesure, le minimum — pas zéro', () => {
    expect(reserveHauteDeLaGrappe(0)).toBe(RESERVE_HAUTE_MINIMALE);
    expect(reserveHauteDeLaGrappe(Number.NaN)).toBe(RESERVE_HAUTE_MINIMALE);
    expect(RESERVE_HAUTE_MINIMALE).toBeGreaterThanOrEqual(20 + 32);
  });
  it('🔴 la coquille l’écrit, et la colonne de la file la lit', () => {
    const shell = lire('src/components/v2/ShellV2.svelte');
    expect(shell).toContain("c.style.setProperty('--v2-grappe-h', `${reserveHauteDeLaGrappe(r.bottom - c.getBoundingClientRect().top)}px`);");
    const np = lire('src/components/partages/NowPlaying.svelte');
    const i = np.indexOf('.queue-sheet.wide-layout {');
    const bloc = np.slice(i, np.indexOf('}', i));
    expect(bloc).toContain('top: var(--v2-grappe-h, 0px);');
    expect(bloc).not.toMatch(/top:\s*0;/);
  });
});
