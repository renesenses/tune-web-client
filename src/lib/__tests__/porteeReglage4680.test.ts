import { describe, expect, it } from 'vitest';
import { atteintLeSon } from '../porteeReglage';

/**
 * tune-server-rust#4680 — recette v0.9.161, Eversolo DMP-A8 en DLNA :
 * « Prendra effet à la piste suivante » s'affichait alors que l'effet
 * s'entend tout de suite. Le serveur relance le flux à la position courante
 * et répondait `applied_live: false` ; il dit désormais `portee: 'restart'`.
 */
describe('atteintLeSon : seule la piste suivante annonce la piste suivante', () => {
  it('une relance réseau s’entend : pas d’annonce « piste suivante »', () => {
    expect(atteintLeSon(false, 'restart')).toBe(true);
  });

  it('immédiat : entendu', () => {
    expect(atteintLeSon(true, 'immediate')).toBe(true);
  });

  it('piste suivante : la seule portée qui l’annonce', () => {
    expect(atteintLeSon(false, 'next_track')).toBe(false);
  });

  it('rien ne joue : rien à annoncer', () => {
    expect(atteintLeSon(false, 'not_playing')).toBeUndefined();
  });

  it('serveur antérieur (pas de portée) : `applied_live` tel quel, absent = muet', () => {
    expect(atteintLeSon(false, undefined)).toBe(false);
    expect(atteintLeSon(true, undefined)).toBe(true);
    expect(atteintLeSon(undefined, undefined)).toBeUndefined();
  });
});
