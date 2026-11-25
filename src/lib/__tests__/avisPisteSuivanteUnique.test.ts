// rc14 (retour de Rémi sur la rc13.90) — « Prendra effet à la piste
// suivante » s'affichait sur CHAQUE greffon (égaliseur, crossfeed, Crossfeed
// Pro, Crosstalk, profileur : un drapeau par écran). Il ne doit apparaître
// qu'une fois pour toute la chaîne TESS.
//
// CONTRE-ÉPREUVE : avant ce correctif, `prevenirPisteSuivanteUneFois`
// n'existait pas ; chaque écran prévenait de son côté (deux écrans, deux avis).
import { beforeEach, describe, expect, it } from 'vitest';
import { prevenirPisteSuivanteUneFois, rearmerAvisPisteSuivante } from '../porteeReglage';

describe('avis « piste suivante » unique pour la chaîne TESS', () => {
  beforeEach(() => rearmerAvisPisteSuivante());

  it('deux greffons qui attendent la piste suivante : un seul avis', () => {
    const avis: string[] = [];
    prevenirPisteSuivanteUneFois(false, true, () => avis.push('egaliseur'));
    prevenirPisteSuivanteUneFois(false, true, () => avis.push('crossfeed'));
    prevenirPisteSuivanteUneFois(false, true, () => avis.push('crosstalk'));
    expect(avis).toEqual(['egaliseur']);
  });

  it('un réglage qui atteint le son réarme l’avis', () => {
    const avis: string[] = [];
    prevenirPisteSuivanteUneFois(false, true, () => avis.push('1'));
    prevenirPisteSuivanteUneFois(true, true, () => avis.push('jamais'));
    prevenirPisteSuivanteUneFois(false, true, () => avis.push('2'));
    expect(avis).toEqual(['1', '2']);
  });

  it('hors lecture, ou portée inconnue : rien à annoncer', () => {
    const avis: string[] = [];
    prevenirPisteSuivanteUneFois(false, false, () => avis.push('pause'));
    prevenirPisteSuivanteUneFois(undefined, true, () => avis.push('inconnue'));
    expect(avis).toEqual([]);
    // Et l'avis reste disponible pour le premier vrai cas.
    prevenirPisteSuivanteUneFois(false, true, () => avis.push('vrai'));
    expect(avis).toEqual(['vrai']);
  });

  it('changer de zone réarme l’avis (une autre zone, une autre chaîne)', () => {
    const avis: string[] = [];
    prevenirPisteSuivanteUneFois(false, true, () => avis.push('salon'), 1);
    prevenirPisteSuivanteUneFois(false, true, () => avis.push('salon bis'), 1);
    prevenirPisteSuivanteUneFois(false, true, () => avis.push('bureau'), 2);
    expect(avis).toEqual(['salon', 'bureau']);
  });
});
