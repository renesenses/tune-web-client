/**
 * #764 — la recherche fédérée était plafonnée à cinquante, et le plafond
 * venait du CLIENT.
 *
 * Le serveur n'active `recherche_paginee(plafond)` qu'au-delà de cinquante :
 * à cinquante pile, la pagination ne se déclenche jamais.
 *
 * Mesuré sur le .18 le 08/09/2026, `/search?q=miles` :
 *
 *     limite   local (pistes / albums)   qobuz   tidal
 *       50           50 /  50              50      50
 *      100          100 /  92             100     100
 *      200          200 /  92             200     200
 *
 * Le ticket réservait sa conclusion à un seul service ; la mesure la lève.
 * Et à cent, le nombre d'albums atteint son total réel (92) au lieu d'être
 * tronqué — ce que cinquante cachait.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { SEARCH_FEDEREE_LIMIT, SEARCH_PAGE_LIMIT } from '../api';

describe('Le plafond de la recherche fédérée', () => {
  it('🔴 dépasse cinquante — sans quoi le serveur ne pagine PAS', () => {
    expect(SEARCH_FEDEREE_LIMIT).toBeGreaterThan(50);
  });

  it('🔴 reste distinct du plafond de page par service', () => {
    // Cinquante est le plafond de l'API Qobuz : il est juste pour la recherche
    // service par service, qui pagine par `offset`. Fusionner les deux ferait
    // demander cent à Qobuz, qui n'en rendra jamais que cinquante.
    expect(SEARCH_PAGE_LIMIT).toBe(50);
    expect(SEARCH_FEDEREE_LIMIT).not.toBe(SEARCH_PAGE_LIMIT);
  });

  it('est bien le défaut de `federatedSearch`', () => {
    const source = readFileSync('src/lib/api.ts', 'utf8');
    expect(source).toMatch(
      /export function federatedSearch\([^)]*limit = SEARCH_FEDEREE_LIMIT/,
    );
  });

  it('🔴 la barre de suggestions garde le plafond ÉTROIT', () => {
    // Elle part à chaque frappe : lui donner le plafond élargi doublerait le
    // trafic de la frappe, pour un menu déroulant que personne ne fait défiler.
    const barre = readFileSync('src/components/GlobalSearchBar.svelte', 'utf8');
    expect(barre).toContain('api.SEARCH_PAGE_LIMIT');
  });

  it('les deux écrans de recherche COMPLETS prennent le défaut', () => {
    // C'est là que le plafond se voyait — « seulement cinquante résultats ».
    const v0 = readFileSync('src/components/SearchView.svelte', 'utf8');
    const v2 = readFileSync('src/components/v2/SearchV2.svelte', 'utf8');
    expect(v0).toContain('api.federatedSearch(searchQuery.trim(), activeSources)');
    expect(v2).toContain('api.federatedSearch(query)');
  });
});
