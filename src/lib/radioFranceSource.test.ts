import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { etatSourceRadioFrance } from './radioFranceSource';

/**
 * Podcasts : Radio France ne se sonde plus par l'échec —
 * `renesenses/tune-server-rust#1026`.
 *
 * Relevé par l'automate d'exploration : à chaque ouverture de « Podcasts »,
 * `GET /api/v1/podcasts/radiofrance/shows?station=FRANCEINTER` répondait
 * `400 {"code":"bad_request","error":"radiofrance_api_key not configured"}`.
 *
 * Le serveur avait raison. Le client, lui, se servait de ce refus comme d'une
 * réponse : `loadRfShows()` appelait la route et rangeait l'échec dans
 * `rfHasApiKey = false`. Une erreur serveur par ouverture d'écran, sur toute
 * machine sans clé — aucun client n'offrant de champ pour la saisir, c'est le
 * cas général.
 */

describe('etatSourceRadioFrance', () => {
  it("ne sonde plus la route quand le serveur déclare l'absence de clé", () => {
    const etat = etatSourceRadioFrance({ radiofrance_api_key_set: false });
    expect(etat.interrogerLesEmissions).toBe(false);
    expect(etat.cleDeclaree).toBe(false);
  });

  it('interroge les émissions quand la clé est déclarée posée', () => {
    const etat = etatSourceRadioFrance({ radiofrance_api_key_set: true });
    expect(etat.cleDeclaree).toBe(true);
    expect(etat.interrogerLesEmissions).toBe(true);
  });

  it("retombe sur l'ancienne détection face à un serveur antérieur au drapeau", () => {
    // Sans ce repli, une section Radio France resterait muette chez qui a posé
    // une clé sur un serveur qui ne sait pas encore l'annoncer.
    const etat = etatSourceRadioFrance({ server_version: '0.9.100' });
    expect(etat.interrogerLesEmissions).toBe(true);
    expect(etat.cleDeclaree).toBe(false);
  });

  it('ne prend pas une chaîne « false » pour un oui', () => {
    // `/system/config` re-type les réglages : une valeur brute mal relue ne
    // doit pas rouvrir la section.
    expect(etatSourceRadioFrance({ radiofrance_api_key_set: 'false' }).cleDeclaree).toBe(false);
  });

  it('survit à une configuration absente ou illisible', () => {
    expect(etatSourceRadioFrance(null).interrogerLesEmissions).toBe(true);
    expect(etatSourceRadioFrance(undefined).cleDeclaree).toBe(false);
  });
});

