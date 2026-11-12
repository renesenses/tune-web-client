import { describe, expect, it } from 'vitest';
import { messageDuPont, relirePont } from '../etatDuPont';

describe('Réglages › Accès à distance : pourquoi « Déconnecté » (#7714)', () => {
  it('rien à dire, pont éteint ou connecté', () => {
    expect(messageDuPont({ enabled: false })).toBeNull();
    expect(messageDuPont({ enabled: true, connected: true, client_lance: true })).toBeNull();
    expect(messageDuPont(null)).toBeNull();
  });

  it('serveur antérieur : le redémarrage reste le seul remède', () => {
    expect(messageDuPont({ enabled: true, connected: false })).toEqual({
      cle: 'settings.restartToReachRelay',
    });
  });

  it('serveur récent : jamais « Redémarrez »', () => {
    const cas = [
      { enabled: true, connected: false, client_lance: false, premium: true },
      { enabled: true, connected: false, client_lance: true, premium: true, derniere_erreur: null },
      { enabled: true, connected: false, client_lance: false, premium: false },
      { enabled: true, connected: false, client_lance: true, premium: true, derniere_erreur: 'ws connect: timeout' },
    ];
    for (const e of cas) expect(messageDuPont(e)?.cle).not.toBe('settings.restartToReachRelay');
  });

  it('dit la cause : Premium, clé refusée, refus du relais, relais injoignable', () => {
    expect(messageDuPont({ enabled: true, client_lance: false, premium: false })?.cle).toBe(
      'settings.relayNeedsPremium',
    );
    expect(
      messageDuPont({
        enabled: true, client_lance: true, premium: true,
        derniere_erreur: 'relay rejected: cle du serveur requise',
      })?.cle,
    ).toBe('settings.relayKeyRefused');
    expect(
      messageDuPont({
        enabled: true, client_lance: true, premium: true,
        derniere_erreur: 'relay rejected: not_premium',
      }),
    ).toEqual({ cle: 'settings.relayRejected', raison: 'not_premium' });
    expect(
      messageDuPont({
        enabled: true, client_lance: true, premium: true,
        derniere_erreur: 'ws connect: HTTP error: 502 Bad Gateway',
      }),
    ).toEqual({ cle: 'settings.relayUnreachable', raison: 'ws connect: HTTP error: 502 Bad Gateway' });
    expect(messageDuPont({ enabled: true, client_lance: false, premium: true })?.cle).toBe(
      'settings.relayConnecting',
    );
  });

  it('l’état est relu tant que le pont est activé sans être connecté', () => {
    expect(relirePont({ enabled: true, connected: false })).toBe(true);
    expect(relirePont({ enabled: true, connected: true })).toBe(false);
    expect(relirePont({ enabled: false })).toBe(false);
  });
});
