// @vitest-environment jsdom
//
// Fil 2126 (#5710 serveur) — un album ALAC en `.m4a` s'affichait « LOSSY AAC ».
// Le serveur écrit désormais `m4a` quand il n'a pas pu lire le codec (PR
// #5731), et ne lui donne aucun badge d'album. Décision de Bertrand du 04/10 :
// « ni palier ni badge ». Le client, lui, retombait sur le palier `lossy` pour
// tout format hors de ses deux listes : la pastille aurait dit « LOSSY M4A ».
//
// Témoins : `getQualityTier` ne rend plus `lossy` pour `m4a` ni pour un format
// déclaré mais inconnu, et la pastille MONTÉE affiche « M4A » seul, sans mot
// de palier.
import { afterEach, describe, expect, it } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import {
  getQualityTier,
  getQualityTierLabel,
  formatQualityTooltip,
} from '../utils';
import QualityBadge from '../../components/partages/QualityBadge.svelte';

let monte: ReturnType<typeof mount> | null = null;
afterEach(() => {
  if (monte) {
    unmount(monte);
    monte = null;
  }
  document.body.innerHTML = '';
});

describe('fil 2126 — un format au codec non déterminé ne porte aucun palier', () => {
  it('m4a : aucun palier, quelles que soient les spécifications', () => {
    for (const [sr, bd] of [
      [44100, 0],
      [44100, 16],
      [96000, 0],
      [96000, 24],
    ]) {
      const tier = getQualityTier({ format: 'm4a', sample_rate: sr, bit_depth: bd });
      expect(tier, `m4a ${sr}/${bd}`).toBe('inconnu');
      expect(getQualityTierLabel(tier)).toBe('');
    }
    expect(getQualityTier({ format: 'M4A', sample_rate: 44100 })).toBe('inconnu');
  });

  it('un format déclaré mais inconnu ne retombe plus sur « lossy »', () => {
    expect(getQualityTier({ format: 'xyz', sample_rate: 44100, bit_depth: 16 })).toBe('inconnu');
    // Les spécifications qui prouvent le sans-perte gardent leur palier.
    expect(getQualityTier({ format: 'xyz', sample_rate: 96000, bit_depth: 24 })).toBe('hires');
    // Les codecs avec perte restent « lossy », et sans format le repli d'avant demeure.
    expect(getQualityTier({ format: 'aac', sample_rate: 44100 })).toBe('lossy');
    expect(getQualityTier({ format: null, sample_rate: 44100 })).toBe('lossy');
  });

  it('la pastille affiche « M4A » seul, sans « Lossy »', () => {
    const cible = document.createElement('div');
    document.body.appendChild(cible);
    monte = mount(QualityBadge, {
      target: cible,
      props: { format: 'm4a', sampleRate: 44100, bitDepth: null },
    });
    flushSync();
    const texte = (cible.textContent ?? '').replace(/\s+/g, ' ').trim();
    expect(texte).toBe('M4A');
    expect(texte.toLowerCase()).not.toContain('lossy');
    expect(cible.querySelector('.qb-tier')).toBeNull();
    expect(cible.querySelector('.quality-badge.tier-neutre')).not.toBeNull();
  });

  it("l'infobulle ne prête aucun palier", () => {
    const bulle = formatQualityTooltip({ format: 'm4a', sample_rate: 44100 });
    expect(bulle).toContain('Format: M4A');
    expect(bulle).not.toContain('Quality:');
    expect(bulle.toLowerCase()).not.toContain('lossy');
  });
});
