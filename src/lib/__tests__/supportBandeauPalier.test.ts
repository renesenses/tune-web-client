/**
 * Bandeau d'erreur du support : il suit le palier que montre le badge.
 * Fil 3105 : bandeau « réservé à Tune Premium » affiché sur un serveur Premium.
 */
import { describe, it, expect } from 'vitest';
import { fr as frBrut } from './onzeDictionnaires';
import { messageErreurSupportSelonPalier } from '../supportErrors';

const fr = frBrut as Record<string, string>;
const tr = (k: string) => fr[k] ?? k;

function refus(status: number): Error {
  const e = new Error(String(status)) as Error & { status: number };
  e.status = status;
  return e;
}

const chargee = (tier: string) => ({ loaded: true, tier });

describe('bandeau du support selon le palier', () => {
  for (const s of [402, 403]) {
    it(`Premium + ${s} : jamais « réservé à Tune Premium »`, () => {
      const m = messageErreurSupportSelonPalier(refus(s), tr, 'fr', chargee('premium'));
      expect(m).toBe(fr['support.errorPremiumRefusedRemote']);
      expect(m).not.toBe(fr['support.errorPremiumOnly']);
    });

    it(`Free + ${s} : le bandeau « réservé à Tune Premium »`, () => {
      expect(messageErreurSupportSelonPalier(refus(s), tr, 'fr', chargee('free'))).toBe(
        fr['support.errorPremiumOnly'],
      );
    });

    it(`licence en chargement + ${s} : rien`, () => {
      expect(messageErreurSupportSelonPalier(refus(s), tr, 'fr', { loaded: false, tier: 'free' })).toBeNull();
    });
  }

  it('la sentinelle premium_required suit la même règle', () => {
    const e = new Error('premium_required');
    expect(messageErreurSupportSelonPalier(e, tr, 'fr', chargee('pro'))).toBe(fr['support.errorPremiumRefusedRemote']);
    expect(messageErreurSupportSelonPalier(e, tr, 'fr', chargee('free'))).toBe(fr['support.errorPremiumOnly']);
  });

  it('les autres erreurs ne dépendent pas du palier', () => {
    expect(messageErreurSupportSelonPalier(refus(412), tr, 'fr', { loaded: false, tier: 'free' })).toBe(
      fr['support.errorNotConnected'],
    );
    expect(messageErreurSupportSelonPalier(refus(503), tr, 'fr', chargee('premium'))).toBe(
      fr['support.errorUnavailable'],
    );
  });
});
