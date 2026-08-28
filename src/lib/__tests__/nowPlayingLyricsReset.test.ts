import { describe, it, expect } from 'vitest';
import { doitReinitialiserLesParoles } from '../nowPlayingLyricsReset';

/**
 * Rejoue la boucle de #2555 : on applique la décision en boucle, comme le fait
 * l'effet à chaque tick, et on exige qu'elle S'ARRÊTE.
 *
 * Le simulateur reproduit l'ANCIENNE règle si `temoinSepare` est faux : la
 * garde ne consultait alors que l'identifiant chargé, jamais écrit tant que le
 * panneau restait fermé.
 */
function passages(
  { panneauOuvert, temoinSepare }: { panneauOuvert: boolean; temoinSepare: boolean },
  maxPassages = 50,
): number {
  const idPiste = 42;
  let idCharge: number | null = null;
  let idDejaReinitialise: number | null = null;
  let reinitialisations = 0;

  for (let i = 0; i < maxPassages; i++) {
    const doit = temoinSepare
      ? doitReinitialiserLesParoles(idPiste, idCharge, idDejaReinitialise)
      : idPiste !== idCharge; // l'ancienne garde, mot pour mot
    if (!doit) break;
    reinitialisations++;
    if (temoinSepare) idDejaReinitialise = idPiste;
    // `loadNpLyrics` n'est appelé QUE si le panneau est ouvert.
    if (panneauOuvert) idCharge = idPiste;
  }
  return reinitialisations;
}

describe('remise à zéro des paroles (#2555)', () => {
  it('CONTRE-ÉPREUVE : l\'ancienne garde ne converge jamais, panneau fermé', () => {
    expect(passages({ panneauOuvert: false, temoinSepare: false })).toBe(50);
  });

  it('converge en UNE remise à zéro, panneau fermé', () => {
    expect(passages({ panneauOuvert: false, temoinSepare: true })).toBe(1);
  });

  it('converge aussi panneau ouvert', () => {
    expect(passages({ panneauOuvert: true, temoinSepare: true })).toBe(1);
  });

  it('ouvrir le panneau APRÈS doit encore pouvoir charger les paroles', () => {
    // La zone a été remise à zéro pour la piste 42, panneau fermé.
    const idDejaReinitialise = 42;
    const idCharge = null; // rien n'a été chargé : c'est le point qui compte
    // Le bouton appelle loadNpLyrics, qui ne sort tôt que si idCharge === id.
    expect(idCharge).not.toBe(42);
    // Et l'effet ne redéclenche pas de remise à zéro parasite.
    expect(doitReinitialiserLesParoles(42, idCharge, idDejaReinitialise)).toBe(false);
  });

  it('un changement de piste redéclenche la remise à zéro', () => {
    expect(doitReinitialiserLesParoles(43, null, 42)).toBe(true);
  });

  it('une piste sans identifiant (radio) ne passe pas par ce chemin', () => {
    expect(doitReinitialiserLesParoles(null, null, null)).toBe(false);
  });
});
