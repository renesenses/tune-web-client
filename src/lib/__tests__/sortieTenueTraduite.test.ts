/**
 * rc14 — le refus « sortie tenue par une autre zone »
 * (`zone_output_unavailable`, motif `output_held_by_other_zone`) se lit dans
 * la langue de l'interface.
 *
 * Le serveur composait sa phrase en français, en dur : le 409 et
 * `zone.playback_error` la montraient telle quelle (code de la famille
 * `zone_output_unavailable`, réputé « déjà traduit »). Le serveur rend
 * maintenant `params` (zone, appareil, zone qui tient la sortie, forme) ; le
 * client traduit le motif lui-même, de sorte que les deux canaux disent la
 * même phrase.
 *
 * Contre-épreuve : retirer de `traductionDuCode` (messageServeur.ts) la
 * branche du motif fait rougir les trois premiers cas : la phrase française
 * de l'événement revient à l'écran.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { locale, t } from '../i18n';
import { lireMessageServeur } from '../messageServeur';

const FRANCAIS = "La sortie de la zone « Salon » a disparu. Une sortie « NanoPlayer » est bien présente, mais la zone « Bureau » l'utilise déjà.";
const params = (variant: string) => ({ zone: 'Salon', device: 'NanoPlayer', holder: 'Bureau', variant });

function evenement(variant: string) {
  return {
    code: 'zone_output_unavailable',
    reason: 'output_held_by_other_zone',
    error: FRANCAIS,
    message: FRANCAIS,
    params: params(variant),
  };
}

beforeEach(() => { locale.set('en'); });
afterEach(() => { locale.set('fr'); });

describe('sortie tenue par une autre zone : traduite par le client', () => {
  it('zone.playback_error : la phrase de la langue de l\'interface, avec les noms', () => {
    const { message } = lireMessageServeur(evenement('other'));
    expect(message).not.toContain('déjà');
    expect(message).toContain('“Bureau”');
    expect(message).toContain('“Salon”');
    expect(message).toContain('“NanoPlayer”');
    expect(message).not.toMatch(/\{\w+\}/);
  });

  it('chaque forme a sa phrase', () => {
    const supprimee = lireMessageServeur(evenement('deleted')).message;
    expect(supprimee).toBe(
      (get(t)('erreursServeur.output_held_by_other_zone_deleted' as any) as string)
        .replace('{zone}', 'Salon').replace('{zone}', 'Salon')
        .replace('{device}', 'NanoPlayer').replace('{holder}', 'Bureau'),
    );
    expect(supprimee).not.toContain('Start playback from');
    expect(lireMessageServeur(evenement('same_name')).message).toContain('another zone also named');
  });

  it('le 409 et l\'événement disent la même phrase (un seul bandeau)', () => {
    const http = lireMessageServeur(
      {
        error: 'zone_output_unavailable',
        reason: 'output_held_by_other_zone',
        holder_zone_id: 7,
        message: 'The output of the zone “Salon” has disappeared…',
        message_key: 'api.zones.outputHeldByOtherZone',
        params: params('other'),
      },
      '',
      409,
    );
    expect(http.message).toBe(lireMessageServeur(evenement('other')).message);
  });

  it('sans params (serveur plus ancien), jamais de {zone} à l\'écran', () => {
    const { params: _p, ...sansParams } = evenement('other');
    expect(lireMessageServeur(sansParams).message).toBe(FRANCAIS);
  });

  it('un autre motif sans clé du client garde la règle d\'avant', () => {
    const corps = { code: 'zone_output_unavailable', reason: 'asio_scan_blocked_after_crash', message: 'ASIO phrase' };
    expect(lireMessageServeur(corps).message).toBe('ASIO phrase');
  });
});
