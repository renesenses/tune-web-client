import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { jaugeReplayGain } from '../santeReplayGain';

/**
 * tune-server-rust#5597 — la jauge ReplayGain repartait à 0 % à chaque
 * démarrage du serveur : `processed` / `total` sont ceux de la CAMPAGNE, qui
 * se rouvre à zéro sur ce qui reste. Un testeur l'a lu comme « 4 heures et
 * 13 485 analyses perdues », alors que les mesures étaient en base.
 *
 * Le serveur rend désormais aussi le couple de la BIBLIOTHÈQUE
 * (`library_analyzed` / `library_eligible`). Quand il est là, la jauge le
 * montre, et la campagne passe en second.
 */
describe('#5597 — la jauge ReplayGain parle de la bibliothèque', () => {
  it('🔴 après un redémarrage, la jauge garde les pistes déjà analysées', () => {
    // Relevé de Tades juste après un redémarrage : campagne à 0 sur 443 062,
    // mais 85 290 pistes déjà analysées en base sur 528 352.
    const j = jaugeReplayGain(true, {
      active: true, processed: 0, total: 443062, enabled: true, reported: true,
      library_analyzed: 85290, library_eligible: 528352,
    });
    expect(j.bibliotheque).toBe(true);
    expect(j.fait).toBe(85290);
    expect(j.total).toBe(528352);
    expect(j.sansJauge).toBe(false);
    expect(j.etat).toBe('running');
    expect(j.faitCampagne, 'une campagne qui n\'a rien traité ne se dit pas').toBeUndefined();
  });

  it('la campagne en cours vient en second', () => {
    const j = jaugeReplayGain(true, {
      active: true, processed: 13485, total: 456378, enabled: true, reported: true,
      library_analyzed: 98775, library_eligible: 528352,
    });
    expect(j.fait).toBe(98775);
    expect(j.faitCampagne).toBe(13485);
  });

  it('une bibliothèque faite garde sa barre, sans « le serveur n\'expose pas l\'avancement »', () => {
    const j = jaugeReplayGain(true, {
      active: false, processed: 0, total: 0, enabled: true, reported: true,
      library_analyzed: 5000, library_eligible: 5000,
    });
    expect(j.etat).toBe('done');
    expect(j.sansJauge).toBe(false);
    expect(j.fait).toBe(5000);
    expect(j.total).toBe(5000);
  });

  it('serveur plus ancien ou couple illisible : comportement d\'avant, compteur de campagne', () => {
    for (const extra of [{}, { library_analyzed: null, library_eligible: null },
      { library_analyzed: 10, library_eligible: 0 }, { library_analyzed: 'x', library_eligible: 5 }]) {
      const j = jaugeReplayGain(true, {
        active: true, processed: 12, total: 300, enabled: true, reported: true, ...(extra as object),
      });
      expect(j.bibliotheque, JSON.stringify(extra)).toBe(false);
      expect(j.fait).toBe(12);
      expect(j.total).toBe(300);
    }
  });

  it('analyse coupée ou réponse illisible : pas de jauge, même avec le couple', () => {
    expect(jaugeReplayGain(true, {
      active: false, processed: 0, total: 0, enabled: false,
      library_analyzed: 10, library_eligible: 20,
    }).sansJauge).toBe(true);
    expect(jaugeReplayGain(true, {
      library_analyzed: 10, library_eligible: 20,
    }).sansJauge).toBe(true);
  });

  it('le numérateur de la bibliothèque ne dépasse pas son dénominateur', () => {
    const j = jaugeReplayGain(true, {
      active: true, processed: 1, total: 10, enabled: true,
      library_analyzed: 700, library_eligible: 500,
    });
    expect(j.fait).toBe(500);
  });

  it('la carte affiche le compteur de campagne en second', () => {
    const source = fs.readFileSync(
      fileURLToPath(new URL('../../components/v2/TuneHealthV2.svelte', import.meta.url)),
      'utf8',
    );
    expect(source).toContain('v2.health.rgCampaign');
    expect(source).toContain('jauge.faitCampagne');
  });
});
