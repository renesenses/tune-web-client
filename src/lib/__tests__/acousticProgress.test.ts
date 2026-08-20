import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import {
  acousticStatus,
  acousticProgress,
  acousticPausedReason,
  acousticModelError,
  RAISONS_DE_PAUSE,
} from '../stores/acoustic';

/** Un état minimal et sain : la passe tourne, rien ne la gêne. Les cas
 *  ci-dessous n'en changent qu'un champ à la fois. */
const BASE = {
  available: true,
  enabled: true,
  analysed_tracks: 10,
  processed_tracks: 10,
  eligible_tracks: 100,
} as any;

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

/**
 * #1939 / audit des champs orphelins — le serveur savait, l'écran se taisait.
 *
 * `paused_reason` est calculé depuis le 18/08 (#1866/#1915) et `model_fetch`
 * depuis le 15/08 (#1765). Aucun client ne les lisait : ni le web, ni Flutter,
 * ni iOS, ni macOS, ni iPadOS. Les deux corrections serveur avaient été
 * écrites pour tuer un symptôme précis — « une passe en pause et une passe
 * cassée donnent le même écran » — et le symptôme est resté intact.
 */
describe('acoustique : dire pourquoi la passe ne travaille pas', () => {
  it('une raison connue donne une clé i18n', () => {
    for (const r of RAISONS_DE_PAUSE) {
      acousticStatus.set({ ...BASE, paused_reason: r });
      expect(get(acousticPausedReason)).toEqual({ raison: r, cle: `acoustic.paused.${r}` });
    }
  });

  it('une raison INCONNUE ne jette pas un identifiant technique à l’écran', () => {
    // Le serveur peut en ajouter une sans nous prévenir : elle doit tomber sur
    // le libellé générique, pas sur une clé i18n absente — qui s'afficherait
    // telle quelle, « acoustic.paused.disk_full », et vaudrait moins que rien.
    acousticStatus.set({ ...BASE, paused_reason: 'disk_full' });
    expect(get(acousticPausedReason)).toEqual({ raison: 'disk_full', cle: null });
  });

  it('rien à dire quand rien n’empêche la passe de tourner', () => {
    for (const v of [null, undefined, '']) {
      acousticStatus.set({ ...BASE, paused_reason: v as any });
      expect(get(acousticPausedReason)).toBeNull();
    }
  });

  it('un serveur antérieur n’envoie pas le champ : on n’affirme rien', () => {
    acousticStatus.set({ ...BASE });
    expect(get(acousticPausedReason)).toBeNull();
    expect(get(acousticModelError)).toBeNull();
  });

  it('un téléchargement EN COURS n’est pas un échec', () => {
    // Une tentative en vol après un premier échec est un espoir, pas une panne.
    // L'annoncer ferait paniquer quelqu'un dont le téléchargement va aboutir.
    acousticStatus.set({
      ...BASE,
      model_fetch: { in_progress: true, attempts: 2, last_error: 'connection reset' },
    });
    expect(get(acousticModelError)).toBeNull();
  });

  it('un téléchargement échoué porte sa cause et son nombre de tentatives', () => {
    acousticStatus.set({
      ...BASE,
      model_fetch: { in_progress: false, attempts: 3, last_error: 'connection reset' },
    });
    expect(get(acousticModelError)).toEqual({ message: 'connection reset', tentatives: 3 });
  });

  it('pas d’erreur nommée = pas d’échec annoncé', () => {
    acousticStatus.set({ ...BASE, model_fetch: { in_progress: false, attempts: 0, last_error: null } });
    expect(get(acousticModelError)).toBeNull();
  });
});
