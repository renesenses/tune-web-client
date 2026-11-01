/**
 * tune-server-rust#7619 (L5) — le préchargement au survol est LIMITÉ : une
 * intention (survol tenu), un seau à jetons, une mémoire. Et le registre ne
 * rend une requête préchargée qu'une fois, tant qu'elle est fraîche.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  DELAI_INTENTION_MS, DUREE_VIE_MS, INTERVALLE_MS, RAFALE, limiteur, type Horloge,
} from './prechargement';
import { DUREE_PRECHARGE_MS, deposerPrecharge, oublierPrecharges, retirerPrecharge } from './precharges';

function horlogeFactice() {
  let t = 1_000_000;
  const minuteurs = new Map<number, { f: () => void; a: number }>();
  let n = 0;
  const h: Horloge = {
    maintenant: () => t,
    differer: (f, ms) => { n += 1; minuteurs.set(n, { f, a: t + ms }); return n; },
    annuler: (m) => { minuteurs.delete(m as number); },
  };
  const avancer = (ms: number) => {
    t += ms;
    for (const [k, m] of [...minuteurs]) if (m.a <= t) { minuteurs.delete(k); m.f(); }
  };
  return { h, avancer };
}

describe('limiteur de préchargement', () => {
  it('ne charge qu’après un survol tenu', () => {
    const { h, avancer } = horlogeFactice();
    const charger = vi.fn();
    const l = limiteur(charger, h);
    l.survol(1);
    avancer(DELAI_INTENTION_MS - 1);
    expect(charger).not.toHaveBeenCalled();
    avancer(1);
    expect(charger).toHaveBeenCalledWith(1);
  });

  it('un passage de souris (sortie avant le délai) ne charge rien', () => {
    const { h, avancer } = horlogeFactice();
    const charger = vi.fn();
    const l = limiteur(charger, h);
    for (let id = 1; id <= 30; id++) { l.survol(id); avancer(10); }
    l.fin();
    avancer(DELAI_INTENTION_MS * 2);
    expect(charger).not.toHaveBeenCalled();
  });

  it('au plus une rafale, puis un par intervalle', () => {
    const { h, avancer } = horlogeFactice();
    const charger = vi.fn();
    const l = limiteur(charger, h);
    for (let id = 1; id <= RAFALE + 3; id++) { l.survol(id); avancer(DELAI_INTENTION_MS); }
    expect(charger).toHaveBeenCalledTimes(RAFALE);
    avancer(INTERVALLE_MS);
    l.survol(100); avancer(DELAI_INTENTION_MS);
    expect(charger).toHaveBeenCalledTimes(RAFALE + 1);
  });

  it('ne recharge pas une fiche déjà préchargée tant qu’elle est fraîche', () => {
    const { h, avancer } = horlogeFactice();
    const charger = vi.fn();
    const l = limiteur(charger, h);
    l.survol(7); avancer(DELAI_INTENTION_MS); l.fin();
    l.survol(7); avancer(DELAI_INTENTION_MS); l.fin();
    expect(charger).toHaveBeenCalledTimes(1);
    avancer(DUREE_VIE_MS);
    l.survol(7); avancer(DELAI_INTENTION_MS);
    expect(charger).toHaveBeenCalledTimes(2);
  });
});

describe('registre des requêtes préchargées', () => {
  it('rend la requête une seule fois', async () => {
    oublierPrecharges();
    deposerPrecharge('/a', () => Promise.resolve(42), 0);
    const p = retirerPrecharge<number>('/a', 10);
    expect(p).not.toBeNull();
    expect(await p).toBe(42);
    expect(retirerPrecharge('/a', 10)).toBeNull();
  });

  it('ne rend pas une requête trop vieille', () => {
    oublierPrecharges();
    deposerPrecharge('/b', () => Promise.resolve(1), 0);
    expect(retirerPrecharge('/b', DUREE_PRECHARGE_MS + 1)).toBeNull();
  });

  it('ne relance pas une requête déjà en vol', () => {
    oublierPrecharges();
    const charger = vi.fn(() => Promise.resolve(1));
    deposerPrecharge('/c', charger, 0);
    deposerPrecharge('/c', charger, 5);
    expect(charger).toHaveBeenCalledTimes(1);
  });

  it('une invalidation oublie tout', () => {
    deposerPrecharge('/d', () => Promise.resolve(1), 0);
    oublierPrecharges();
    expect(retirerPrecharge('/d', 1)).toBeNull();
  });
});
