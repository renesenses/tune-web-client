/**
 * #3306 — « Image impossible à réduire assez » sur un navigateur sans encodage
 * WebP (signalé sur HCFR, probablement Safari).
 *
 * `toDataURL('image/webp', q)` y rend silencieusement un PNG. Avant le
 * correctif, `encodeCanevas` gardait ce PNG — ~100 Ko et plus pour une photo de
 * 192 px — et le refus `poids` tombait sur toute photo. Ces tests simulent ce
 * navigateur : WebP ignoré, PNG au poids d'une image INCOMPRESSIBLE (le pire
 * cas : 4 octets par pixel, en base64), JPEG honoré ou non.
 */
import { describe, expect, it } from 'vitest';
import {
  COTE_MAX,
  COTES_REPLI,
  POIDS_ENCODE_MAX,
  QUALITES_JPEG,
  encodeAvecReduction,
  encodeCanevas,
  octetsDataUrl,
} from '../avatarLocal';

/** Poids base64 d'un PNG sans compression utile, pour un carré de `cote`. */
function pngPireCas(cote: number): string {
  return 'data:image/png;base64,' + 'A'.repeat(Math.ceil((cote * cote * 4 * 4) / 3));
}

type Appel = { type: string; q: number; cote: number };

/**
 * Un canevas de façade qui ignore 'image/webp' (rend du PNG, comme Safari).
 * `jpeg` : le navigateur honore-t-il 'image/jpeg' ? Le JPEG rendu pèse
 * proportionnellement à la surface et à la qualité.
 */
function canevasSansWebp(cote: number, appels: Appel[], jpeg = true) {
  return {
    width: cote,
    height: cote,
    toDataURL(type: string, q: number) {
      appels.push({ type, q, cote });
      if (type === 'image/jpeg' && jpeg) {
        return 'data:image/jpeg;base64,' + 'A'.repeat(Math.ceil(cote * cote * 4 * q));
      }
      return pngPireCas(cote);
    },
  } as unknown as HTMLCanvasElement;
}

describe('#3306 — un navigateur sans WebP', () => {
  it('le PNG de repli d’une photo de 192 px dépasse le plafond (le cas signalé)', () => {
    expect(octetsDataUrl(pngPireCas(COTE_MAX))).toBeGreaterThan(POIDS_ENCODE_MAX);
  });

  it('🔴 repli JPEG : la photo passe au lieu d’être refusée', () => {
    const appels: Appel[] = [];
    const url = encodeCanevas(canevasSansWebp(COTE_MAX, appels));
    expect(url.startsWith('data:image/jpeg'), 'le repli doit être du JPEG').toBe(true);
    expect(octetsDataUrl(url)).toBeLessThanOrEqual(POIDS_ENCODE_MAX);
    // Une seule tentative WebP : la qualité n'a pas d'effet sur le PNG rendu.
    expect(appels.filter((a) => a.type === 'image/webp')).toHaveLength(1);
  });

  it('le JPEG essaie des qualités DÉCROISSANTES, en commençant par la meilleure', () => {
    const appels: Appel[] = [];
    encodeCanevas(canevasSansWebp(COTE_MAX, appels));
    const q = appels.filter((a) => a.type === 'image/jpeg').map((a) => a.q);
    expect(q[0]).toBe(QUALITES_JPEG[0]);
    expect([...q].sort((a, b) => b - a)).toEqual(q);
  });

  it('🔴 sans WebP NI JPEG, la réduction de dimension finit par passer', () => {
    const appels: Appel[] = [];
    const url = encodeAvecReduction(
      (cote) => canevasSansWebp(cote, appels, false),
      COTE_MAX,
    );
    expect(octetsDataUrl(url)).toBeLessThanOrEqual(POIDS_ENCODE_MAX);
    const cotes = [...new Set(appels.map((a) => a.cote))];
    expect(cotes[0], 'on essaie d’abord le côté plein').toBe(COTE_MAX);
    expect(cotes.length, 'il a fallu réduire').toBeGreaterThan(1);
  });

  it('le dernier côté de repli tient TOUJOURS, même en PNG incompressible', () => {
    const plusPetit = COTES_REPLI[COTES_REPLI.length - 1];
    expect(octetsDataUrl(pngPireCas(plusPetit))).toBeLessThanOrEqual(POIDS_ENCODE_MAX);
  });

  it('un navigateur avec WebP n’est pas réduit pour rien', () => {
    const cotes: number[] = [];
    const url = encodeAvecReduction((cote) => {
      cotes.push(cote);
      return { toDataURL: () => 'data:image/webp;base64,AAAA' } as unknown as HTMLCanvasElement;
    }, COTE_MAX);
    expect(url).toBe('data:image/webp;base64,AAAA');
    expect(cotes).toEqual([COTE_MAX]);
  });
});
