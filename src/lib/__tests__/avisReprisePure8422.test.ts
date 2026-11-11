// @vitest-environment jsdom
//
// tune-server-rust#8422 (décision de Bertrand du 11/11) — une bascule PURE
// sur un fichier dont l'égaliseur ou le crossfeed est déjà cuit doit refaire le
// flux. Le serveur reprend à la position en cours et l'annonce UNE fois par
// `zone.notice` : `{ zone_id, code: 'pure_resumed_at_position', position_ms,
// position, message, fatal: false }`.
//
// Le témoin pousse la trame RÉELLE du serveur dans le vrai gestionnaire
// (`v2Live.ts`) et lit le bandeau posé : un AVIS, dans la langue de
// l'interface, avec la position. Contre-épreuve : retirer la branche
// `zone.notice` de `v2Live.ts` fait rougir le premier cas (aucun bandeau).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { demarrerTransportV2 } from '../v2Live';
import { currentZoneId, zones } from '../stores/zones';
import { notifications } from '../stores/notifications';
import { locale } from '../i18n';
import { texteAvisServeur } from '../avisServeur';

let pousser: (e: unknown) => void = () => {};
vi.mock('../websocket', () => ({
  tuneWS: {
    connect: () => {},
    setCurrentZoneId: () => {},
    get isPolling() {
      return false;
    },
    onEvent: (h: (e: unknown) => void) => {
      pousser = h;
      return () => {};
    },
  },
}));

const zone = { id: 11, name: 'Marantz ND8006', state: 'playing', volume: 40, output_type: 'dlna' };

beforeEach(() => {
  for (const n of get(notifications)) notifications.dismiss(n.id);
  vi.stubGlobal('fetch', (url: string) =>
    Promise.resolve(
      new Response(JSON.stringify(/\/zones(\?|$)/.test(String(url)) ? [zone] : zone), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  locale.set('fr');
});

const respirer = () => new Promise((r) => setTimeout(r, 0));

/** La trame que `tune-core/src/orchestrator/dsp.rs` émet. */
const AVIS = {
  type: 'zone.notice',
  data: {
    zone_id: 11,
    code: 'pure_resumed_at_position',
    position_ms: 151_400,
    position: '2:31',
    message: 'PURE switch: resumed at 2:31',
    fatal: false,
  },
};

describe('#8422 — « Bascule PURE : reprise à 2:31 »', () => {
  it('l’avis du serveur pose UN bandeau d’information, pas une erreur', async () => {
    locale.set('fr');
    zones.set([zone as never]);
    currentZoneId.set(11);
    const arreter = demarrerTransportV2();
    await respirer();

    pousser(AVIS);
    await respirer();
    arreter();

    const bandeaux = get(notifications);
    expect(bandeaux.length, 'aucun bandeau : l’avis du serveur traverse le gestionnaire').toBe(1);
    expect(bandeaux[0].level).toBe('info');
    expect(bandeaux[0].message).toBe('Bascule PURE : reprise à 2:31');
  });

  it('se dit dans chacune des 15 langues, position comprise', () => {
    const vus = new Set<string>();
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu', 'vi', 'el', 'nb', 'pl'] as const) {
      locale.set(l);
      const texte = texteAvisServeur(AVIS.data);
      expect(texte, l).toContain('2:31');
      expect(texte, l).not.toContain('avisServeur.');
      vus.add(texte!);
    }
    expect(vus.size).toBe(15);
  });

  it('un code inconnu retombe sur le message du serveur ; rien de lisible, rien à l’écran', () => {
    expect(texteAvisServeur({ code: 'inconnu_8422', message: 'Avis brut' })).toBe('Avis brut');
    expect(texteAvisServeur({})).toBeNull();
  });

  it('au-delà d’une heure, la position mise en forme par le serveur', () => {
    locale.set('en');
    expect(
      texteAvisServeur({ code: 'pure_resumed_at_position', position_ms: 3_725_000, position: '1:02:05' }),
    ).toContain('1:02:05');
  });
});
