import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { acousticStatus, acousticProgress } from '../stores/acoustic';

function poser(s: Partial<Parameters<typeof acousticStatus.set>[0]> | null) {
  acousticStatus.set(s as any);
  return get(acousticProgress);
}

describe('acousticProgress', () => {
  /** #1479 — Bilou, « CLAP bloqué à 99 % ». La passe avait fini ; c'est la
   *  jauge qui prenait le mauvais numérateur. */
  it('une piste traitée sans empreinte ne bloque plus la jauge sous 100 %', () => {
    const p = poser({
      available: true, enabled: true,
      analysed_tracks: 25039,   // empreintes écrites
      processed_tracks: 25090,  // traitées : empreintes + échecs
      failed_tracks: 51,
      eligible_tracks: 25090,
    });
    expect(p?.percent).toBe(100);
    expect(p?.complete).toBe(true);
    expect(p?.remaining).toBe(0);
    expect(p?.failed).toBe(51);
  });

  it('sans le correctif, ces mêmes chiffres donnaient 99 %', () => {
    // Ce que faisait l'ancien calcul, gardé comme témoin de ce qu'on corrige.
    expect(Math.floor((25039 / 25090) * 100)).toBe(99);
  });

  it('une passe en cours reste en cours', () => {
    const p = poser({
      available: true, enabled: true,
      analysed_tracks: 40, processed_tracks: 50, failed_tracks: 10,
      eligible_tracks: 200,
    });
    expect(p?.percent).toBe(25);
    expect(p?.complete).toBe(false);
    expect(p?.remaining).toBe(150);
  });

  /** Un serveur antérieur n'envoie pas `processed_tracks` : on retombe sur
   *  `analysed_tracks` plutôt que sur zéro. */
  it('retombe sur analysed_tracks quand le serveur ne dit pas processed', () => {
    const p = poser({
      available: true, enabled: true,
      analysed_tracks: 120, eligible_tracks: 200,
    });
    expect(p?.percent).toBe(60);
    expect(p?.failed).toBe(0);
  });

  it('ne dit rien quand il n\'y a rien d\'analysable', () => {
    expect(poser({ available: true, enabled: true, analysed_tracks: 0, eligible_tracks: 0 })).toBeNull();
    expect(poser(null)).toBeNull();
  });

  /** Le compte traité ne peut pas dépasser le dénominateur : une base qui
   *  garde des témoins de pistes supprimées afficherait sinon 103 %. */
  it('ne dépasse jamais 100 %', () => {
    const p = poser({
      available: true, enabled: true,
      analysed_tracks: 300, processed_tracks: 320, eligible_tracks: 200,
    });
    expect(p?.percent).toBe(100);
    expect(p?.remaining).toBe(0);
  });
});
