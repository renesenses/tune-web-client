// tune-server-rust#8282 — le serveur publie la sous-phase d'une tâche de fond
// sous un code stable (`detail_code`) et ses paramètres (`detail_params`), à
// côté du texte français historique (`detail`). Le client traduit le code ; un
// serveur antérieur (sans code) garde la table de web#2760.
import { describe, expect, it } from 'vitest';
import en from '../locales/en';
import fr from '../locales/fr';
import { libelleBanniereEnrichissement, libelleProgression, type TacheDeFond } from '../tachesDeFond';

const anglais = (cle: string) => (en as Record<string, string>)[cle] ?? cle;
const francais = (cle: string) => (fr as Record<string, string>)[cle] ?? cle;

describe('tune-server-rust#8282 — sous-phase traduite par son code', () => {
  it('le code suffit : une phrase nouvelle du serveur ne casse plus la traduction', () => {
    // Le texte a changé côté serveur ; le code, non.
    const p = { detail: 'Crédits MusicBrainz', detail_code: 'credits' };
    expect(libelleProgression(p, anglais)).toBe('Credits');
  });

  it("l'attente de la plage dynamique se traduit", () => {
    const p = { detail: 'en attente : lecture en cours', detail_code: 'waitingPlayback' };
    expect(libelleProgression(p, anglais)).toBe('waiting: playback in progress');
    expect(libelleProgression(p, francais)).toBe('en attente : lecture en cours');
  });

  it('un service nommé arrive en paramètre et reste tel quel', () => {
    const p = { detail: 'LRCLIB', detail_code: 'source', detail_params: { name: 'LRCLIB' } };
    expect(libelleProgression(p, anglais)).toBe('LRCLIB');
  });

  it('code inconnu ou serveur antérieur : repli sur le texte (web#2760)', () => {
    expect(libelleProgression({ detail: 'Crédits', detail_code: 'nouveauCode' }, anglais)).toBe('Credits');
    expect(libelleProgression({ detail: 'Métadonnées' }, anglais)).toBe('Metadata');
    expect(libelleProgression({ detail: 'Crédits', detail_code: 'credits' })).toBe('Crédits');
    expect(libelleProgression(null, anglais)).toBe('');
  });

  it('le bandeau de la barre latérale lit le code', () => {
    const tache: TacheDeFond = {
      id: 'dynamic_range', label: 'Mesure de la plage dynamique…', kind: 'analysis',
      progress: { processed: 3, total: 10, detail: 'en attente : machine trop chaude', detail_code: 'waitingHeat' },
    };
    expect(libelleBanniereEnrichissement([tache], 'x', anglais)).toContain('waiting: machine too hot 3/10');
  });
});
