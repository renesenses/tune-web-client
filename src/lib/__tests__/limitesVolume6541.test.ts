import { describe, expect, it } from 'vitest';
import {
  REFUS_VOLUME_FIXE,
  REFUS_ZONE_PURE,
  bornerCurseur,
  cleTexteRefus,
  confort,
  limiteDepuisPourcent,
  plafondDuCurseur,
  plusEnButee,
  pourcentDeLimite,
  refusDeLimite,
  securite,
  serveurConnaitLesLimites,
} from '../limitesVolume';

// tune-server-rust#6541 — les chiffres du fil 2335 : sécurité 70 %, confort 30 %.
const zone = { volume_limit_safety: 0.7, volume_limit_comfort: 0.3 };

describe('limites de volume (#6541)', () => {
  it('le curseur tout à droite s’arrête au confort', () => {
    expect(bornerCurseur(zone, 1, 0.2)).toBe(0.3);
  });

  it('au-dessus du confort, le curseur redescend mais ne monte pas', () => {
    expect(bornerCurseur(zone, 0.4, 0.5)).toBe(0.4);
    expect(bornerCurseur(zone, 0.6, 0.5)).toBe(0.5);
  });

  it('la sécurité borne même un confort mal réglé au-dessus', () => {
    const z = { volume_limit_safety: 0.4, volume_limit_comfort: 0.9 };
    expect(confort(z)).toBe(0.4);
    expect(plafondDuCurseur(z, 0.1)).toBe(0.4);
  });

  it('sans limite, rien ne change', () => {
    expect(bornerCurseur({}, 0.93, 0.1)).toBe(0.93);
    expect(plusEnButee({}, 0.99)).toBe(false);
  });

  it('le bouton + est en butée à la sécurité', () => {
    expect(plusEnButee(zone, 0.7)).toBe(true);
    expect(plusEnButee(zone, 0.68)).toBe(false);
  });

  it('un serveur sans la clé n’a pas la route des boutons', () => {
    expect(serveurConnaitLesLimites({ id: 1 })).toBe(false);
    expect(serveurConnaitLesLimites({ id: 1, volume_limit_safety: null })).toBe(true);
  });

  it('la saisie en % : vide = aucune, hors 1..100 = refus', () => {
    expect(limiteDepuisPourcent('')).toBeNull();
    expect(limiteDepuisPourcent('70')).toBe(0.7);
    expect(limiteDepuisPourcent('62,5 %')).toBe(0.625);
    expect(limiteDepuisPourcent('0')).toBeUndefined();
    expect(limiteDepuisPourcent('150')).toBeUndefined();
    expect(limiteDepuisPourcent('abc')).toBeUndefined();
    expect(pourcentDeLimite(0.625)).toBe('62.5');
    expect(pourcentDeLimite(null)).toBe('');
  });
});

// tune-server-rust#6620 — zone PURE / volume fixe : le serveur publie
// `volume_limits_refusal` et ignore les limites déjà posées.
describe('refus de limite (#6620)', () => {
  const pure = { ...zone, volume_limits_refusal: 'limite_refusee_zone_pure' };
  const fixe = { ...zone, volume_limits_refusal: 'limite_refusee_volume_fixe' };

  it('avec le refus publié, le curseur et le bouton + ignorent les limites', () => {
    expect(bornerCurseur(pure, 1, 0.2)).toBe(1);
    expect(plusEnButee(fixe, 0.7)).toBe(false);
    expect(securite(pure)).toBeNull();
    expect(confort(fixe)).toBeNull();
  });

  it('contre-épreuve : sans refus (null), les limites tiennent', () => {
    const libre = { ...zone, volume_limits_refusal: null };
    expect(bornerCurseur(libre, 1, 0.2)).toBe(0.3);
    expect(plusEnButee(libre, 0.7)).toBe(true);
    expect(refusDeLimite(libre)).toBeNull();
  });

  it('chaque code a sa phrase ; un code inconnu n’en a pas', () => {
    expect(cleTexteRefus(REFUS_ZONE_PURE)).toBe('devices.volumeLimitRefusedPure');
    expect(cleTexteRefus(REFUS_VOLUME_FIXE)).toBe('devices.volumeLimitRefusedFixed');
    expect(cleTexteRefus('autre')).toBeNull();
    expect(refusDeLimite(pure)).toBe(REFUS_ZONE_PURE);
  });
});
