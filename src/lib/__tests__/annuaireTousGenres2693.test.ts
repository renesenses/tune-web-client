import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { memoriserTous, compteTous } from '../totalTousLesGenres';

// web#2693 — Radio › Annuaire, « 320 kbit/s et plus » : 271 stations listées,
// mais la puce « Tous (1119) » (le relevé entier, `stations`).
const SRC = readFileSync(new URL('../../components/v2/RadioAnnuaire.svelte', import.meta.url), 'utf-8');
const reponse = { total: 271, stations: 1119 };

describe('web#2693 — le compte de « Tous » suit les filtres actifs', () => {
  it('sans genre : le total filtré, pas le relevé entier', () => {
    expect(compteTous(null, 'k', null, reponse.total)).toBe(271);
  });

  it('genre choisi : garde le total sans genre des mêmes filtres', () => {
    const memo = memoriserTous(null, 'k', null, 271);
    const apres = memoriserTous(memo, 'k', 'news', 40);
    expect(compteTous(apres, 'k', 'news', 40)).toBe(271);
  });

  it('autres filtres changés pendant qu’un genre est choisi : nombre inconnu, pas un faux', () => {
    const memo = memoriserTous(null, 'k', null, 271);
    expect(compteTous(memo, 'autre', 'news', 12)).toBeNull();
  });

  it('l’annuaire ne passe plus `stations` (tous filtres levés) à la puce « Tous »', () => {
    expect(SRC).not.toMatch(/total=\{page\?\.stations/);
    expect(SRC).toMatch(/total=\{totalTous\}/);
  });

  it('contre-épreuve : le balisage d’avant échoue à la garde', () => {
    const avant = SRC.replace('total={totalTous}', 'total={page?.stations ?? 0}');
    expect(avant).toMatch(/total=\{page\?\.stations/);
  });
});
