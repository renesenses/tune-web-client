import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MOTIF_INCONNU,
  PANNE_SERVEUR,
  REFUS_PREMIUM,
  REFUS_SERVEUR,
  SERVEUR_INJOIGNABLE,
  SESSION_EXPIREE,
  motifDEchec,
  phraseEchec,
} from '../motifEchecEq';
import * as locales from './lesOnzeLangues';

/**
 * L'égaliseur ne doit plus avaler une seule erreur — #513.
 *
 * `EqualizerView.svelte` portait cinq `catch` muets. L'utilisateur bougeait un
 * curseur, rien ne se passait, et rien ne lui disait pourquoi : un refus
 * d'offre y était indiscernable d'une panne réseau, elle-même indiscernable
 * d'une erreur serveur. C'est ce silence qui a rendu le signalement de
 * BARATOUX (fil 1383) impossible à trancher — on n'a jamais su si son réglage
 * était refusé ou simplement inerte.
 *
 * Ce fichier garde deux choses :
 *
 *  1. le CLASSEMENT des motifs, avec sa contre-épreuve — un classeur qui
 *     dirait « offre » à tout ferait passer les tests du refus premium et
 *     enverrait acheter un abonnement à quelqu'un dont le serveur est éteint ;
 *  2. le fait que l'écran s'en serve VRAIMENT, et qu'aucun `catch` n'y soit
 *     redevenu muet.
 *
 * Reste en environnement `node` : fonctions pures et lecture de texte.
 */

/** L'`Error` NUE que `fetchJSON` lève sur un 402 : ni `status`, ni `code`. */
const REFUS_402_NU = new Error('premium_required');

/** L'`ApiError` que `apiError()` construit : `status` + `code` + message. */
function apiError(status: number, message: string, code?: string): Error {
  return Object.assign(new Error(message), code ? { status, code } : { status });
}

describe('motifDEchec — nommer ce qui a échoué', () => {
  it('reconnaît les DEUX formes du refus d’offre', () => {
    expect(motifDEchec(REFUS_402_NU).motif).toBe(REFUS_PREMIUM);
    expect(motifDEchec(apiError(402, 'Parametric EQ requires Tune Premium')).motif).toBe(
      REFUS_PREMIUM,
    );
    expect(
      motifDEchec(Object.assign(new Error('nope'), { code: 'premium_required' })).motif,
    ).toBe(REFUS_PREMIUM);
  });

  it('distingue la session expirée', () => {
    expect(motifDEchec(new Error('Session expired')).motif).toBe(SESSION_EXPIREE);
    expect(motifDEchec(apiError(401, 'unauthorized')).motif).toBe(SESSION_EXPIREE);
  });

  it('distingue la panne du serveur de son refus', () => {
    expect(motifDEchec(apiError(500, 'boom')).motif).toBe(PANNE_SERVEUR);
    expect(motifDEchec(apiError(503, 'unavailable')).motif).toBe(PANNE_SERVEUR);
    expect(motifDEchec(apiError(400, 'bad bands')).motif).toBe(REFUS_SERVEUR);
    expect(motifDEchec(apiError(404, 'no such zone', 'zone_not_found')).motif).toBe(
      REFUS_SERVEUR,
    );
  });

  /**
   * Une panne réseau n'a NI statut NI code : `fetchJSON` relève l'erreur de
   * `fetch` telle quelle. C'est cette absence qui la nomme.
   */
  it('nomme le serveur injoignable', () => {
    expect(motifDEchec(new TypeError('Failed to fetch')).motif).toBe(SERVEUR_INJOIGNABLE);
    expect(motifDEchec(new Error('NetworkError when attempting to fetch')).motif).toBe(
      SERVEUR_INJOIGNABLE,
    );
  });

  /**
   * La contre-épreuve du classeur. S'il disait « offre » à tout, les tests
   * ci-dessus passeraient sans rien prouver, et une vraie panne serait
   * présentée comme une invitation à payer.
   */
  it('ne prend pas une panne pour une limite d’offre, ni l’inverse', () => {
    expect(motifDEchec(apiError(500, 'boom')).motif).not.toBe(REFUS_PREMIUM);
    expect(motifDEchec(new TypeError('Failed to fetch')).motif).not.toBe(REFUS_PREMIUM);
    expect(motifDEchec(REFUS_402_NU).motif).not.toBe(SERVEUR_INJOIGNABLE);
    // Et il ne rend jamais le même motif pour tout : au moins cinq distincts.
    const motifs = new Set(
      [
        REFUS_402_NU,
        new Error('Session expired'),
        apiError(500, 'boom'),
        apiError(400, 'bad'),
        new TypeError('Failed to fetch'),
      ].map((e) => motifDEchec(e).motif),
    );
    expect(motifs.size).toBe(5);
  });

  /**
   * Le motif fourre-tout est la sortie du témoin : si le serveur nomme demain
   * un refus que cette interface ne connaît pas, on prévient — on ne masque
   * pas. C'est la règle posée par `refusModuleSortie.ts` (#2392).
   */
  it('rend un motif — jamais rien — sur une entrée inattendue', () => {
    expect(motifDEchec(undefined).motif).toBe(MOTIF_INCONNU);
    expect(motifDEchec(null).motif).toBe(MOTIF_INCONNU);
    expect(motifDEchec('premium_required').motif).toBe(MOTIF_INCONNU);
    expect(motifDEchec({ status: 402 }).motif).toBe(MOTIF_INCONNU);
    for (const e of [undefined, null, 'x', 42, {}]) {
      expect(motifDEchec(e).cleI18n, 'un motif sans phrase à montrer').toBeTruthy();
    }
  });

  it('remonte ce que le serveur a écrit, et rien qu’utile', () => {
    const e = motifDEchec(apiError(400, 'unknown preset: vocal', 'bad_request'));
    expect(e.messageServeur).toBe('unknown preset: vocal');
    expect(e.codeServeur).toBe('bad_request');
    expect(e.status).toBe(400);
    // Ces messages-là ne redisent que la phrase traduite déjà affichée, ou
    // sont des traces techniques : on ne les colle pas à l'écran.
    expect(motifDEchec(REFUS_402_NU).messageServeur).toBeNull();
    expect(motifDEchec(new Error('Session expired')).messageServeur).toBeNull();
    expect(motifDEchec(new TypeError('Failed to fetch')).messageServeur).toBeNull();
  });
});

describe('phraseEchec — la phrase montrée', () => {
  const traduire = (cle: string) => `[${cle}]`;

  it('accole le message du serveur APRÈS la phrase traduite', () => {
    // `premium_guard.rs` compose ses messages en anglais : les montrer à la
    // place de la phrase traduite, c'est le défaut réparé par #2419.
    const phrase = phraseEchec(traduire, motifDEchec(apiError(400, 'bad bands')));
    expect(phrase).toBe('[eq.applyFailed] : bad bands');
  });

  it('se contente de la phrase quand le serveur n’a rien écrit', () => {
    expect(phraseEchec(traduire, motifDEchec(new TypeError('Failed to fetch')))).toBe(
      '[eq.errorNetwork]',
    );
  });

  it('retombe sur le code quand il n’y a pas de message', () => {
    const e = motifDEchec(Object.assign(new Error(''), { status: 409, code: 'conflit' }));
    expect(phraseEchec(traduire, e)).toBe('[eq.applyFailed] : conflit');
  });
});

describe('les onze langues portent les nouvelles phrases', () => {
  const LANGUES: Record<string, Record<string, string>> = {
    fr: locales.fr,
    en: locales.en,
    de: locales.de,
    es: locales.es,
    it: locales.it,
    zh: locales.zh,
    ja: locales.ja,
    ko: locales.ko,
    ro: locales.ro,
    sv: locales.sv,
    hu: locales.hu,
  } as Record<string, Record<string, string>>;

  const NOUVELLES = [
    'eq.errorNetwork',
    'eq.errorSession',
    'eq.errorServerFault',
    'eq.presetsLoadFailed',
  ];

  for (const [code, dict] of Object.entries(LANGUES)) {
    it(`${code} traduit les quatre nouvelles clés`, () => {
      for (const cle of NOUVELLES) {
        expect(dict[cle], `clé absente en ${code} : ${cle}`).toBeTruthy();
      }
    });
  }

  /**
   * Une traduction qui n'est que la copie du français n'est pas une
   * traduction. On ne juge pas la qualité, seulement qu'un effort a eu lieu.
   */
  it('aucune langue ne recopie le français', () => {
    for (const [code, dict] of Object.entries(LANGUES)) {
      if (code === 'fr') continue;
      for (const cle of NOUVELLES) {
        expect(dict[cle], `${code} recopie le français pour ${cle}`).not.toBe(
          locales.fr[cle as keyof typeof locales.fr],
        );
      }
    }
  });
});

