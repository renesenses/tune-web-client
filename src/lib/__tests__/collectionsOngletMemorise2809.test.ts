// @vitest-environment jsdom
/**
 * Fil 2809 du forum (JLuc, 13/11/2026) : « Collections » rouvrait toujours sur
 * l'onglet « Smart Collections ». L'écran rouvre désormais sur le dernier
 * onglet choisi, gardé par le même aide que ses autres choix d'affichage.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lireChoix, ecrireChoix } from '../preferencesEcran';

const ecran = () =>
  readFileSync(resolve(process.cwd(), 'src/components/v2/CollectionsV2.svelte'), 'utf8');

const ONGLETS = ['smart', 'manuelle', 'rayons'] as const;

describe('Collections — l’onglet choisi est retenu (fil 2809)', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* jsdom */ } });

  it('l’écran lit et écrit son onglet par preferencesEcran', () => {
    const s = ecran();
    expect(s).toMatch(/let onglet = \$state<Onglet>\(lireChoix<Onglet>\('v2\.collections\.onglet', ONGLETS, 'smart'\)\)/);
    // écrit au clic seulement, jamais par un $effect (repli auto, ouverture
    // depuis la barre latérale)
    expect(s).toMatch(/function choisirOnglet\(o: Onglet\) \{ onglet = o; ecrireChoix\('v2\.collections\.onglet', o\); \}/);
    expect(s).not.toMatch(/\$effect\(\(\) => \{ ecrireChoix\('v2\.collections\.onglet'/);
    for (const o of ONGLETS) expect(s).toContain(`onclick={() => choisirOnglet('${o}')}`);
  });

  it('« Collections » choisi une fois est rendu à la visite suivante', () => {
    ecrireChoix('v2.collections.onglet', 'manuelle');
    expect(lireChoix('v2.collections.onglet', ONGLETS, 'smart')).toBe('manuelle');
  });

  it('sans choix, ou avec une valeur inconnue, on reste sur « Smart »', () => {
    expect(lireChoix('v2.collections.onglet', ONGLETS, 'smart')).toBe('smart');
    ecrireChoix('v2.collections.onglet', 'nimporte');
    expect(lireChoix('v2.collections.onglet', ONGLETS, 'smart')).toBe('smart');
  });
});
