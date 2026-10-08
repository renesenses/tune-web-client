import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cibleDefilement, amenerSousEntete, RETRAIT_SOUS_ENTETE } from '../amenerSousEntete';

const src = readFileSync(resolve(__dirname, '../../components/v2/SettingsV2.svelte'), 'utf-8');

describe('Réglages : une carte visée par ancre reste sous l\'en-tête (Profils trop haut)', () => {
  it('la cible garde un retrait sous le bord haut', () => {
    // carte à 300 px sous le haut du conteneur, défilement 0, contenu long
    expect(cibleDefilement(400, 100, 0, 2000, 500)).toBe(300 - RETRAIT_SOUS_ENTETE);
  });
  it('contre-épreuve : en butée, la cible est bornée au défilement possible', () => {
    // contenu 600, visible 500 : max 100, alors que l'ancien block:start voulait 284
    expect(cibleDefilement(400, 100, 0, 600, 500)).toBe(100);
    expect(cibleDefilement(100, 100, 0, 600, 500)).toBe(0);
  });
  it('seul le conteneur défilant bouge, jamais le cadre overflow:hidden', () => {
    const cadre = document.createElement('div');
    cadre.style.overflow = 'hidden';
    const pane = document.createElement('div');
    pane.style.overflowY = 'auto';
    const carte = document.createElement('section');
    cadre.append(pane); pane.append(carte); document.body.append(cadre);
    const defile: string[] = [];
    pane.scrollTo = ((o: any) => { defile.push('pane'); pane.scrollTop = o.top; }) as any;
    cadre.scrollTo = (() => { defile.push('cadre'); }) as any;
    (carte as any).scrollIntoView = () => defile.push('scrollIntoView');
    amenerSousEntete(carte);
    expect(defile).toEqual(['pane']);
    cadre.remove();
  });
  it('SettingsV2 n\'utilise plus scrollIntoView pour ses ancres', () => {
    expect(src).not.toMatch(/scrollIntoView/);
    expect(src).toContain('amenerSousEntete(document.querySelector(`[data-section="${section}"]`))');
  });
});
