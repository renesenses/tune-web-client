// @vitest-environment jsdom
//
// renesenses/tune-server-rust#5217 — « Bit-perfect strict » refuse aussi une
// réduction de PROFONDEUR : radio FLAC 24 bits vers une sortie réseau 16 bits.
// Le serveur pousse ce refus par WebSocket (`zone.playback_error`) avec un
// code distinct et une phrase en FRANÇAIS quelle que soit la langue. Le client
// doit construire la phrase dans la langue de l'interface, comme pour #3973.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { locale } from '../i18n';
import { notifications } from '../stores/notifications';
import { signalerErreurServeur } from '../echecLecture';

/** La charge utile exacte de `RefusProfondeur::charge_utile` côté serveur. */
const evenement = (over: Record<string, unknown> = {}) => ({
  zone_id: 7,
  code: 'bitperfect_depth_strict_refused',
  requested_bits: 24,
  device_bits: 16,
  fatal: true,
  error:
    'Bit-perfect strict : lecture refusée — ce chemin de lecture réduit la source de 24 bits à 16 bits. ' +
    'Désactivez « Bit-perfect strict » dans les réglages de la zone pour jouer avec conversion.',
  ...over,
});

function derniereNotification(): string {
  const l = get(notifications);
  return l[l.length - 1]?.message ?? '';
}

beforeEach(() => {
  for (const n of get(notifications)) notifications.dismiss(n.id);
  locale.set('fr');
});

afterEach(() => {
  locale.set('fr');
});

describe('#5217 — refus de profondeur par WebSocket', () => {
  it('en anglais, la phrase est anglaise et porte les deux profondeurs', () => {
    locale.set('en');
    signalerErreurServeur(evenement());
    const m = derniereNotification();
    expect(m).toContain('24 bits');
    expect(m).toContain('16 bits');
    expect(m).not.toContain('lecture refusée');
    expect(m).toContain('playback refused');
  });

  it('en français, la phrase suit la table du client', () => {
    signalerErreurServeur(evenement());
    expect(derniereNotification()).toBe(
      'Bit-perfect strict : lecture refusée — ce chemin de lecture réduit la source de 24 bits à 16 bits. ' +
        'Désactivez « Bit-perfect strict » dans les réglages de la zone pour jouer avec conversion.',
    );
  });

  it('profondeurs absentes : repli sur le texte du serveur', () => {
    signalerErreurServeur(evenement({ requested_bits: undefined, error: 'Texte du serveur' }));
    expect(derniereNotification()).toBe('Texte du serveur');
  });
});
