/**
 * tune-server-rust#4805 lot 2 — les passes de lot BPM et Discogs, d'après
 * MetaRust de Xavier Joly : la lecture de l'état, la ligne affichée, la
 * réponse du lancement. Fonctions pures : aucun réseau.
 */
import { describe, expect, it } from 'vitest';
import fr from '../locales/fr';
import en from '../locales/en';
import {
  enCours,
  issueDuLancementPasse,
  ligneDEtat,
  lireEtatPasse,
  pourcentage,
} from '../passesMetarust';

const tFr = (k: string) => (fr as Record<string, string>)[k] ?? k;
const tEn = (k: string) => (en as Record<string, string>)[k] ?? k;

describe('état d\'une passe', () => {
  it('comble un état incomplet (serveur plus ancien) sans planter', () => {
    const e = lireEtatPasse({}, 'bpm');
    expect(e.status).toBe('idle');
    expect(e.total).toBe(0);
    expect(ligneDEtat(e, tFr)).toBe('');
    expect(lireEtatPasse({ status: 'bizarre' }, 'bpm').status).toBe('idle');
  });

  it('dit l\'avancement et le bilan BPM pendant la passe', () => {
    const e = lireEtatPasse(
      {
        status: 'running', total: 40, traites: 10, en_pause: false,
        compte: { pistes_wikidata: 3, pistes_signal: 90, pistes_sans_resultat: 2 },
      },
      'bpm',
    );
    expect(enCours(e)).toBe(true);
    expect(pourcentage(e)).toBe(25);
    expect(ligneDEtat(e, tFr)).toBe('10 album(s) sur 40 · 3 BPM Wikidata, 90 estimé(s), 2 sans résultat');
    expect(ligneDEtat(e, tEn)).toBe('10 of 40 album(s) · 3 BPM from Wikidata, 90 estimated, 2 without result');
  });

  it('dit « En pause » quand l\'enrichissement est suspendu', () => {
    const e = lireEtatPasse({ status: 'running', total: 4, traites: 1, en_pause: true, compte: {} }, 'discogs');
    expect(ligneDEtat(e, tFr).startsWith('En pause.')).toBe(true);
  });

  it('nomme la raison d\'un arrêt Discogs', () => {
    const e = lireEtatPasse(
      { status: 'stopped', raison: 'discogs_jeton_refuse', total: 9, traites: 1, compte: { pannes: 1 } },
      'discogs',
    );
    expect(ligneDEtat(e, tFr)).toContain('Discogs refuse le jeton');
    const injoignable = lireEtatPasse({ status: 'stopped', raison: 'discogs_injoignable', total: 30, traites: 12, compte: {} }, 'discogs');
    expect(ligneDEtat(injoignable, tFr)).toContain('Discogs ne répond plus');
  });

  it('dit qu\'une passe coupée par un redémarrage se continue', () => {
    const e = lireEtatPasse({ status: 'interrupted', total: 9, traites: 4, compte: {} }, 'bpm');
    expect(enCours(e)).toBe(false);
    expect(ligneDEtat(e, tFr)).toContain('« Continuer »');
  });

  it('une passe à zéro album dit qu\'il n\'y a rien à faire', () => {
    const e = lireEtatPasse({ status: 'done', total: 0, traites: 0, compte: {} }, 'bpm');
    expect(pourcentage(e)).toBe(100);
    expect(ligneDEtat(e, tFr)).toBe('Rien à faire : tout est déjà traité.');
  });
});

describe('lancement', () => {
  it('lit le 202 et les albums que Discogs ne peut pas servir', () => {
    expect(
      issueDuLancementPasse(
        { status: 'started', total: 12, duree_estimee_s: 28, annonce: { albums_sans_code: 3800 } },
        tFr,
      ),
    ).toEqual({ genre: 'lance', total: 12, sansCode: 3800, dureeS: 28 });
  });

  it('dit le motif d\'un refus au lieu d\'un bandeau générique', () => {
    expect(issueDuLancementPasse({ code: 'discogs_token_absent' }, tFr)).toEqual({
      genre: 'refuse',
      phrase: tFr('v2.discogs.noToken'),
    });
    expect(issueDuLancementPasse({ code: 'enrichissement_en_pause' }, tFr)).toEqual({
      genre: 'refuse',
      phrase: tFr('v2.passes.refusedPaused'),
    });
    expect(issueDuLancementPasse({ code: 'passe_deja_en_cours' }, tFr).genre).toBe('refuse');
  });
});
