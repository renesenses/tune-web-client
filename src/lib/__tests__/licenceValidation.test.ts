import { describe, expect, it } from 'vitest';
import {
  statutDistantDepuisMessage,
  verdictValidationLicence,
} from '../licenceValidation';

const GRATUIT = { tier: 'free', conflitDeSession: false };
const PREMIUM = { tier: 'premium', conflitDeSession: false };

describe('verdict de validation de licence (#570)', () => {
  it('ne dit « validée » que si la licence est réellement posée en premium', () => {
    const v = verdictValidationLicence({ status: 'validated' }, PREMIUM);
    expect(v.succes).toBe(true);
    expect(v.cle).toBe('settings.licenseValidated');
  });

  it('refuse le succès quand le serveur confirme mais que le palier reste gratuit', () => {
    // L'écran de Bruno : trois messages de succès, badge FREE.
    const v = verdictValidationLicence({ status: 'validated' }, GRATUIT);
    expect(v.succes).toBe(false);
    expect(v.cle).toBe('settings.licenseValidatedNotPremium');
  });

  it('nomme le conflit de session plutôt qu’un palier manquant', () => {
    const v = verdictValidationLicence(
      { status: 'validated' },
      { tier: 'free', conflitDeSession: true },
    );
    expect(v.succes).toBe(false);
    expect(v.cle).toBe('settings.licenseSessionConflictTitle');
  });

  it('traite « pro » comme premium, exactement comme le badge', () => {
    expect(
      verdictValidationLicence({ status: 'validated' }, { tier: 'pro', conflitDeSession: false }).succes,
    ).toBe(true);
  });

  it('AUCUN cas d’échec de la route ne passe pour un succès', () => {
    // Les cinq corps que `license_validate` renvoie en HTTP 200 sans rien poser.
    const echecs = [
      { status: 'cached', message: 'Validation endpoint not available yet', cached: true },
      { status: 'error', message: 'Server returned 429 Too Many Requests', cached: true },
      { status: 'error', message: 'Validation request failed: connection refused', cached: true },
      { status: 'error', message: 'Failed to parse response: expected value', cached: true },
      { status: 'invalid', message: 'License key is not valid' },
      { status: 'no_license', message: 'No license key configured' },
    ];
    for (const corps of echecs) {
      const v = verdictValidationLicence(corps, GRATUIT);
      expect(v.succes, `${corps.status} / ${corps.message}`).toBe(false);
    }
  });

  it('donne un motif DISTINCT à chaque échec — plus un seul écran pour tous', () => {
    const cles = [
      verdictValidationLicence({ status: 'cached' }, GRATUIT).cle,
      verdictValidationLicence(
        { status: 'error', message: 'Server returned 429 Too Many Requests' },
        GRATUIT,
      ).cle,
      verdictValidationLicence(
        { status: 'error', message: 'Server returned 503 Service Unavailable' },
        GRATUIT,
      ).cle,
      verdictValidationLicence(
        { status: 'error', message: 'Validation request failed: dns error' },
        GRATUIT,
      ).cle,
      verdictValidationLicence({ status: 'invalid' }, GRATUIT).cle,
      verdictValidationLicence({ status: 'no_license' }, GRATUIT).cle,
    ];
    expect(new Set(cles).size).toBe(cles.length);
  });

  it('distingue le plafond de requêtes d’un serveur injoignable', () => {
    const plafond = verdictValidationLicence(
      { status: 'error', message: 'Server returned 429 Too Many Requests' },
      GRATUIT,
    );
    expect(plafond.cle).toBe('settings.licenseRateLimited');
    expect(plafond.statutDistant).toBe(429);
    expect(plafond.repos).toBe(true);

    const injoignable = verdictValidationLicence(
      { status: 'error', message: 'Validation request failed: error sending request' },
      GRATUIT,
    );
    expect(injoignable.cle).toBe('settings.licenseValidateUnreachable');
    expect(injoignable.statutDistant).toBe(null);
    expect(injoignable.repos).toBe(false);
  });

  it('remonte le statut HTTP distant pour les autres erreurs', () => {
    const v = verdictValidationLicence(
      { status: 'error', message: 'Server returned 502 Bad Gateway' },
      GRATUIT,
    );
    expect(v.cle).toBe('settings.licenseValidateServerError');
    expect(v.statutDistant).toBe(502);
  });

  it('ne prend pas un statut inconnu, ni un corps vide, pour un succès', () => {
    expect(verdictValidationLicence({ status: 'futur_statut' }, PREMIUM).succes).toBe(false);
    expect(verdictValidationLicence({}, PREMIUM).succes).toBe(false);
    expect(verdictValidationLicence(null, PREMIUM).succes).toBe(false);
    expect(verdictValidationLicence(undefined, PREMIUM).cle).toBe('settings.licenseValidationError');
  });
});

describe('statut HTTP distant extrait du message serveur', () => {
  it('ne lit que la forme exacte que la route écrit', () => {
    expect(statutDistantDepuisMessage('Server returned 429 Too Many Requests')).toBe(429);
    expect(statutDistantDepuisMessage('Server returned 500 Internal Server Error')).toBe(500);
  });

  it('ne devine rien à partir d’un message qui ne porte pas de statut', () => {
    expect(statutDistantDepuisMessage('Validation request failed: timeout after 10s')).toBe(null);
    expect(statutDistantDepuisMessage('Failed to parse response: expected value at line 1')).toBe(null);
    expect(statutDistantDepuisMessage('')).toBe(null);
    expect(statutDistantDepuisMessage(null)).toBe(null);
    expect(statutDistantDepuisMessage(undefined)).toBe(null);
  });
});
