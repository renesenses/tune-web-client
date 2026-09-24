import { describe, expect, it, vi } from 'vitest';
import {
  CLE_RECHARGEMENT_PRECHARGEMENT,
  FENETRE_ANTI_BOUCLE_MS,
  doitRechargerApresEchecDePrechargement,
  installerRechargementApresMiseAJour,
} from './rechargementApresMiseAJour';

// renesenses/tune-server-rust#4847 — recharger UNE fois après un échec
// d'import dynamique, jamais en boucle.

function stockageMemoire(): Pick<Storage, 'getItem' | 'setItem'> {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
  };
}

describe('doitRechargerApresEchecDePrechargement', () => {
  it('recharge au premier échec et note l’horodatage', () => {
    const s = stockageMemoire();
    expect(doitRechargerApresEchecDePrechargement(s, 1_000_000)).toBe(true);
    expect(s.getItem(CLE_RECHARGEMENT_PRECHARGEMENT)).toBe('1000000');
  });

  it('ne recharge pas une seconde fois dans la fenêtre (anti-boucle)', () => {
    const s = stockageMemoire();
    expect(doitRechargerApresEchecDePrechargement(s, 1_000_000)).toBe(true);
    expect(doitRechargerApresEchecDePrechargement(s, 1_000_000 + 500)).toBe(false);
    expect(
      doitRechargerApresEchecDePrechargement(s, 1_000_000 + FENETRE_ANTI_BOUCLE_MS - 1),
    ).toBe(false);
  });

  it('recharge de nouveau après la fenêtre (mise à jour suivante)', () => {
    const s = stockageMemoire();
    expect(doitRechargerApresEchecDePrechargement(s, 1_000_000)).toBe(true);
    expect(
      doitRechargerApresEchecDePrechargement(s, 1_000_000 + FENETRE_ANTI_BOUCLE_MS),
    ).toBe(true);
  });

  it('sans stockage utilisable, ne recharge pas (pas de boucle possible)', () => {
    expect(doitRechargerApresEchecDePrechargement(null, 1)).toBe(false);
    const jette = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(doitRechargerApresEchecDePrechargement(jette, 1)).toBe(false);
  });

  it('une valeur illisible en stockage n’empêche pas le premier rechargement', () => {
    const s = stockageMemoire();
    s.setItem(CLE_RECHARGEMENT_PRECHARGEMENT, 'n’importe quoi');
    expect(doitRechargerApresEchecDePrechargement(s, 1_000_000)).toBe(true);
  });
});

describe('installerRechargementApresMiseAJour', () => {
  function fausseFenetre() {
    const cible = new EventTarget();
    const reload = vi.fn();
    const fenetre = {
      addEventListener: cible.addEventListener.bind(cible),
      sessionStorage: stockageMemoire(),
      location: { reload },
    } as unknown as Window;
    const declencher = () => {
      const e = new Event('vite:preloadError', { cancelable: true });
      cible.dispatchEvent(e);
      return e;
    };
    return { fenetre, reload, declencher };
  }

  it('deux échecs successifs ne rechargent qu’une fois', () => {
    const { fenetre, reload, declencher } = fausseFenetre();
    installerRechargementApresMiseAJour(fenetre);
    const premier = declencher();
    const second = declencher();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(premier.defaultPrevented).toBe(true);
    // Le second laisse l'erreur remonter : elle reste visible.
    expect(second.defaultPrevented).toBe(false);
  });
});
