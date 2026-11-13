/**
 * Fil 2809 du forum (JLuc, 13/11/2026) : « Collections » rouvrait toujours sur
 * l'onglet « Smart Collections ». L'écran rouvre désormais sur le dernier
 * onglet choisi, gardé par le même aide que ses autres choix d'affichage.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lireChoix, ecrireChoix } from '../preferencesEcran';

const ecran = () =>
  readFileSync(fileURLToPath(new URL('../../components/v2/CollectionsV2.svelte', import.meta.url)), 'utf8');

const ONGLETS = ['smart', 'manuelle', 'rayons'] as const;

describe('Collections — l’onglet choisi est retenu (fil 2809)', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* jsdom */ } });

  it('l’écran lit et écrit son onglet par preferencesEcran', () => {
    const s = ecran();
    expect(s).toMatch(/let onglet = \$state<Onglet>\(lireChoix<Onglet>\('v2\.collections\.onglet', ONGLETS, 'smart'\)\)/);
    expect(s).toMatch(/ecrireChoix\('v2\.collections\.onglet', onglet\)/);
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
