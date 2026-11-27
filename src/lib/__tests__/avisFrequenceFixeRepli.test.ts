// tune-server-rust#9610 (rc14.1) — une zone à fréquence fixe que le serveur
// ne sait pas préparer à temps (DMP-A8 du .18 à 768 kHz) joue quand même, par
// un repli : flux progressif ou cadence native. Le serveur le dit UNE fois
// par zone, par `zone.notice` :
// `{ zone_id, code: 'fixed_rate_too_slow_fallback', requested_rate, fallback,
// message, fatal: false }`.
//
// Le témoin vérifie que l'avis se dit dans chacune des 20 langues de
// l'interface, et non par le `message` anglais du serveur. Contre-épreuve :
// retirer la clé d'une langue fait rougir ce banc sur cette langue.
import { describe, expect, it } from 'vitest';
import { locale } from '../i18n';
import { texteAvisServeur } from '../avisServeur';
import { ONZE_LANGUES } from './onzeDictionnaires';

const AVIS = {
  zone_id: 10,
  code: 'fixed_rate_too_slow_fallback',
  requested_rate: 768000,
  fallback: 'progressive_stream',
  message: 'This server cannot prepare 768000 Hz in time: streaming it progressively instead',
  fatal: false,
};

describe('#9610 — « Fréquence fixe trop lourde pour ce serveur »', () => {
  it('se dit dans chacune des 20 langues, jamais par le message du serveur', () => {
    const vus = new Set<string>();
    for (const l of ONZE_LANGUES) {
      locale.set(l);
      const texte = texteAvisServeur(AVIS);
      expect(texte, l).toBeTruthy();
      expect(texte, l).not.toContain('avisServeur.');
      expect(texte, l).not.toBe(AVIS.message);
      vus.add(texte!);
    }
    expect(ONZE_LANGUES.length).toBe(20);
    expect(vus.size, 'une traduction par langue').toBe(20);
  });

  it('en français', () => {
    locale.set('fr');
    expect(texteAvisServeur(AVIS)).toBe(
      'Fréquence fixe trop lourde pour ce serveur : la lecture continue par un repli',
    );
  });
});
