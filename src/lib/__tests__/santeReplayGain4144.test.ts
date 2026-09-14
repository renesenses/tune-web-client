import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { jaugeReplayGain, type AvancementReplayGain } from '../santeReplayGain';

/**
 * #4144 — la carte ReplayGain de l'écran Santé lit l'avancement de la passe.
 *
 * Deux propriétés, et la seconde est la condition dure :
 *
 * 1. quand le serveur répond, la carte montre traitées / total ;
 * 2. 🔴 **quand le serveur ne répond pas, la carte GARDE son message
 *    d'absence**. Un serveur en 0.9.149 ou plus ancien n'a pas la route : la
 *    promesse est rejetée, et l'écran doit continuer d'afficher proprement.
 *    Une jauge vide serait pire que l'aveu d'ignorance qu'on remplace — « 0
 *    piste analysée » sur une bibliothèque entièrement traitée est un
 *    affichage FAUX, et c'est précisément ce que la carte s'interdisait.
 */

const ABSENT: (AvancementReplayGain | null | undefined)[] = [
  null,
  undefined,
  // Le serveur a répondu, mais pas ce qu'on attend : un relais qui rend une
  // page d'erreur en JSON, une version intermédiaire, un champ renommé.
  {} as AvancementReplayGain,
  { active: true } as AvancementReplayGain,
  { processed: 12 } as AvancementReplayGain,
  { total: 300 } as AvancementReplayGain,
  { processed: Number.NaN, total: 300 } as AvancementReplayGain,
  { processed: 12, total: 'beaucoup' } as unknown as AvancementReplayGain,
];

describe('#4144 — jauge de la carte ReplayGain', () => {
  it('🔴 GARDE le message d\'absence quand le serveur ne répond pas', () => {
    for (const reponse of ABSENT) {
      const j = jaugeReplayGain(true, reponse);
      expect(
        j.sansJauge,
        `réponse ${JSON.stringify(reponse)} : la carte doit garder son message ` +
          `d'absence. Un serveur antérieur à v0.9.150 n'a pas la route ; ` +
          `afficher une jauge ici écrirait « 0 piste analysée » sur une ` +
          `bibliothèque qui peut être entièrement traitée.`,
      ).toBe(true);
      expect(j.fait, 'aucun numérateur ne doit sortir d\'une réponse illisible').toBeUndefined();
      expect(j.total, 'aucun dénominateur ne doit sortir d\'une réponse illisible').toBeUndefined();
    }
  });

  it('sans réponse, l\'état reste celui de la CONFIGURATION', () => {
    // C'est ce que la carte faisait déjà, et qu'on ne dégrade pas : le mode
    // armé se lit « au repos », le mode coupé se lit « désactivé ».
    expect(jaugeReplayGain(true, null).etat).toBe('idle');
    expect(jaugeReplayGain(false, null).etat).toBe('off');
  });

  it('affiche traitées / total pendant une passe', () => {
    const j = jaugeReplayGain(true, {
      active: true, processed: 4812, total: 50000, enabled: true, reported: true,
    });
    expect(j.sansJauge).toBe(false);
    expect(j.etat).toBe('running');
    expect(j.fait).toBe(4812);
    expect(j.total).toBe(50000);
  });

  it('une passe finie se dit finie', () => {
    const j = jaugeReplayGain(true, {
      active: false, processed: 50000, total: 50000, enabled: true, reported: true,
    });
    expect(j.etat).toBe('done');
    expect(j.sansJauge).toBe(false);
  });

  it('du travail en attente sans campagne ouverte reste « au repos », avec ses chiffres', () => {
    // Le serveur vient de démarrer : la passe dort 120 s avant son premier lot.
    // La carte a le dénominateur, elle n'a pas encore de campagne.
    const j = jaugeReplayGain(true, {
      active: false, processed: 0, total: 1200, enabled: true, reported: false,
    });
    expect(j.etat).toBe('idle');
    expect(j.fait).toBe(0);
    expect(j.total).toBe(1200);
    expect(j.sansJauge).toBe(false);
  });

  it('l\'analyse coupée côté serveur se dit « désactivé », pas une jauge immobile', () => {
    const j = jaugeReplayGain(true, {
      active: false, processed: 0, total: 0, enabled: false, reported: false,
    });
    expect(j.etat).toBe('off');
    expect(j.sansJauge).toBe(true);
  });

  it('rien à analyser : fini, et sans barre « 0 / 0 »', () => {
    const j = jaugeReplayGain(true, {
      active: false, processed: 0, total: 0, enabled: true, reported: true,
    });
    expect(j.etat).toBe('done');
    expect(j.sansJauge).toBe(true);
  });

  /** Le défaut qu'a connu la carte acoustique (#1479) : des témoins de pistes
   *  supprimées font dépasser le numérateur, la jauge annonce 103 %. */
  it('le numérateur ne dépasse jamais le dénominateur', () => {
    const j = jaugeReplayGain(true, {
      active: true, processed: 320, total: 200, enabled: true, reported: true,
    });
    expect(j.fait).toBe(200);
    expect(j.total).toBe(200);
  });
});

describe('#4144 — le branchement de la carte', () => {
  const SOURCE = fs.readFileSync(
    fileURLToPath(new URL('../../components/v2/TuneHealthV2.svelte', import.meta.url)),
    'utf8',
  );

  /**
   * 🔴 La garde de COMPATIBILITÉ, au niveau du branchement.
   *
   * La décision ci-dessus ne protège rien si l'appel à la route peut faire
   * tomber `collect()` : sur un serveur antérieur, un `await` nu lèverait une
   * 404 et la carte — comme toutes celles qui suivent — ne serait jamais
   * construite. C'est `Promise.allSettled` qui contient le rejet, exactement
   * comme pour les cinq autres chantiers de l'écran.
   */
  it('la route d\'avancement est appelée sous Promise.allSettled, jamais awaitée nue', () => {
    const appels = SOURCE.match(/api\.getReplayGainProgress\(\)/g) ?? [];
    expect(appels.length, 'la carte doit interroger la route une fois').toBe(1);
    expect(
      /Promise\.allSettled\(\[[^\]]*api\.getReplayGainProgress\(\)[^\]]*\]\)/.test(SOURCE),
      '🔴 #4144 : `api.getReplayGainProgress()` doit être appelée DANS un ' +
        '`Promise.allSettled`. Un `await` nu ferait lever une 404 sur tout ' +
        'serveur antérieur à v0.9.150, et l\'écran Santé perdrait la carte ' +
        'ReplayGain — et toutes celles construites après elle.',
    ).toBe(true);
    expect(
      /await\s+api\.getReplayGainProgress\(\)/.test(SOURCE),
      '🔴 #4144 : aucun `await api.getReplayGainProgress()` nu.',
    ).toBe(false);
  });

  /** Le message d'absence ne disparaît pas du composant : c'est lui qu'on
   *  affiche encore quand `sansJauge` est vrai. */
  it('le message d\'absence est toujours branché', () => {
    expect(SOURCE).toContain('v2.health.rgNoProgress');
    expect(SOURCE).toContain('jaugeReplayGain');
  });
});
