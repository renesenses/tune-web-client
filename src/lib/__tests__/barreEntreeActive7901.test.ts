// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOUTES_ENTREES, estActif } from '../../components/v2/Sidebar.svelte';
import type { View } from '../stores/navigation';

/**
 * tune-server-rust#7901 (fil 2658) — « Bibliothèque » restait surlignée quand
 * « Lecture en cours » était ouverte.
 *
 * L'entrée active de la barre latérale se calcule d'après la route affichée
 * (`activeView`) : chaque vue n'allume qu'une seule entrée, la sienne.
 */
const SIDEBAR = readFileSync(resolve(__dirname, '../../components/v2/Sidebar.svelte'), 'utf8');

function entreesActives(vue: View): string[] {
  return TOUTES_ENTREES.filter((it) => estActif(it, vue)).map((it) => it.view);
}

describe('#7901 — l’entrée surlignée suit l’écran affiché', () => {
  it('Lecture en cours allume « Lecture en cours », pas « Bibliothèque »', () => {
    expect(entreesActives('nowplaying')).toEqual(['nowplaying']);
  });

  it('Bibliothèque allume « Bibliothèque » seule', () => {
    expect(entreesActives('library')).toEqual(['library']);
  });

  it('chaque vue de la barre (alias compris) allume exactement une entrée', () => {
    const vues = new Set<View>();
    for (const it of TOUTES_ENTREES) {
      vues.add(it.view);
      for (const a of it.aussi ?? []) vues.add(a);
    }
    for (const v of vues) {
      expect(entreesActives(v), `vue ${v}`).toHaveLength(1);
    }
  });

  it('les boutons de la barre lisent la route courante, pas la vue précédente', () => {
    const appels = SIDEBAR.match(/class:active=\{estActif\(it, ([^)]+)\)/g) ?? [];
    expect(appels.length).toBeGreaterThan(0);
    for (const a of appels) expect(a).toContain('estActif(it, $activeView)');
    expect(SIDEBAR).not.toMatch(/estActif\([^)]*previousView/);
  });
});
