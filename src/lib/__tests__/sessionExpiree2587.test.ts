// web#2587 — une session expirée GARDE son onglet ; un service jamais connecté reste masqué.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ongletsStreaming, sessionExpiree, servicesExpires } from '../ongletsStreaming';
import { natureErreurConnexion } from '../erreurConnexionService';

const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu', 'vi', 'el', 'nb', 'pl'];

const services = {
  qobuz: { enabled: true, authenticated: false, username: 'bertrand' }, // expirée
  tidal: { enabled: true, authenticated: true, username: 'b' },
  deezer: { enabled: true, authenticated: false, username: null }, // jamais connecté
  spotify: { enabled: false, authenticated: false, username: 'x' }, // désactivé
};

describe('web#2587 onglets à session expirée', () => {
  it('garde l\'onglet expiré, masque le jamais connecté et le désactivé', () => {
    const o = ongletsStreaming(services, false);
    expect(o).toContain('qobuz');
    expect(o).toContain('tidal');
    expect(o).not.toContain('deezer');
    expect(o).not.toContain('spotify');
  });
  it('sessionExpiree / servicesExpires', () => {
    expect(sessionExpiree(services.qobuz)).toBe(true);
    expect(sessionExpiree(services.deezer)).toBe(false);
    expect(sessionExpiree(services.tidal)).toBe(false);
    expect(servicesExpires(services)).toEqual(['qobuz']);
  });
  it('service_app_refused n\'est pas un mauvais mot de passe', () => {
    expect(natureErreurConnexion({ code: 'service_app_refused' })).toBe('application');
    expect(natureErreurConnexion({ code: 'invalid_credentials' })).toBe('identifiants');
  });
  it('les 15 langues portent les clés', () => {
    for (const l of LANGUES) {
      const s = readFileSync(resolve(__dirname, `../locales/${l}.ts`), 'utf8');
      for (const k of ['settings.errAppRefused', 'v2.stream.sessionExpired', 'v2.stream.sessionExpiredDetail', 'v2.stream.reconnect'])
        expect(s, `${l} ${k}`).toContain(`"${k}"`);
      expect(s.match(/"settings\.errAppRefused": ".*\{service\}/), l).toBeTruthy();
    }
  });
});
