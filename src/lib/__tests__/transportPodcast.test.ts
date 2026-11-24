// @vitest-environment jsdom
/**
 * rc15 — fil 3009 : bornes des réglages podcast, et contre-épreuve « la
 * musique n'est jamais concernée ».
 */
import { describe, it, expect } from 'vitest';
import {
  VITESSES, bornerSecondes, bornerVitesse, gesteDesBoutons, vitesseAAppliquer, estEpisodeDePodcast,
} from '../transportPodcast';

describe('bornes des réglages', () => {
  it('les secondes sont entières, de 1 à 99, sinon le défaut', () => {
    expect(bornerSecondes(15, 30)).toBe(15);
    expect(bornerSecondes('45', 30)).toBe(45);
    expect(bornerSecondes(0, 30)).toBe(1);
    expect(bornerSecondes(150, 30)).toBe(99);
    expect(bornerSecondes(12.6, 30)).toBe(13);
    expect(bornerSecondes('abc', 30)).toBe(30);
    expect(bornerSecondes(undefined, 15)).toBe(15);
  });

  it('la vitesse va de 0,4 à 1,6 par pas de 0,1', () => {
    expect(VITESSES).toEqual([0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6]);
    expect(bornerVitesse(1.25)).toBe(1.3);
    expect(bornerVitesse('0.1')).toBe(0.4);
    expect(bornerVitesse(3)).toBe(1.6);
    expect(bornerVitesse(null)).toBe(1);
    expect(bornerVitesse(-2)).toBe(1);
  });
});

describe('seul un épisode de podcast change les boutons et la vitesse', () => {
  const prefs = { podcastReculerS: 10, podcastAvancerS: 45, podcastVitesse: 1.5 };

  it('épisode : Reculer / Avancer et vitesse du profil', () => {
    expect(estEpisodeDePodcast({ source: 'podcast' })).toBe(true);
    expect(gesteDesBoutons({ source: 'podcast' }, prefs)).toEqual({
      reculerMs: -10_000, avancerMs: 45_000, reculerS: 10, avancerS: 45,
    });
    expect(gesteDesBoutons({ source: 'podcast' }, {})).toMatchObject({ reculerS: 15, avancerS: 30 });
    expect(vitesseAAppliquer({ source: 'podcast' }, prefs)).toBe(1.5);
  });

  it('contre-épreuve : musique, radio, rien en cours — Précédent / Suivant et vitesse 1', () => {
    for (const piste of [{ source: 'local' }, { source: 'qobuz' }, { source: 'radio' }, null, undefined]) {
      expect(gesteDesBoutons(piste, prefs)).toBeNull();
      expect(vitesseAAppliquer(piste, prefs)).toBe(1);
    }
  });
});
