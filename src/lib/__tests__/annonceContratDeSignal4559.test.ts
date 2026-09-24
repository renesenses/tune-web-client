// @vitest-environment jsdom
//
// #4559 — « Chemin du signal, sortie locale Windows : le panneau annonce
// WASAPI (shared — Windows mixer) et des étapes orange alors que le journal
// montre l'exclusif ouvert avec bit_perfect=true » (Jean Valjean, fil 1857).
//
// ## Le correctif serveur était juste, et il tombait dans le vide
//
// PR #4568 (`tune-server-rust`, livrée en v0.9.159) fait ANNONCER au sondeur
// le contrat de signal dès qu'il change : `poller/tick.rs` émet
// `contrat_de_signal_publie_annonce` puis `zone.updated` avec pour seule
// charge utile `{"zone_id": N}`. Elle s'appuyait explicitement sur « la
// branche de repli des évènements `zone.*` d'`App.svelte` », qui fait relire
// les zones — « rien à changer côté web ».
//
// Or `src/App.svelte` a été SUPPRIMÉ le 19/09/2026 (#1257, phase 5 de la
// bascule v2→v1), quatre jours avant. La seule coquille vivante est
// `ShellV2` → `v2Live.ts`, dont le gestionnaire n'avait aucune branche
// `zone.*` de repli : sa seule branche `zone.updated` exige `data.zones`, un
// TABLEAU de zones entières que seul `websocket.ts` fabrique quand il
// retombe sur le sondage HTTP. L'annonce nue du serveur traversait tout le
// gestionnaire sans rien déclencher.
//
// D'où le symptôme exactement tel qu'il est décrit : le panneau reste faux
// jusqu'à ce qu'un `playback.*` — un geste sur la zone, ou un évènement sur
// une AUTRE zone — passe par la branche générique qui, elle, recharge
// `/zones`. « La sortie locale démarre avec le défaut et dès qu'il y a un
// changement sur la sortie Marantz, Bit-Perfect sur la sortie locale redevient
// vert » (réponse 6570 du 20/09).
//
// ## Ce que ce témoin mesure
//
// Pas la présence d'un appel dans le source : la trame RÉELLE du serveur est
// poussée dans le vrai gestionnaire, et on regarde ce qui part sur le réseau
// et ce qui arrive dans le magasin `zones` — d'où l'écran tire son libellé.
//
// ## Ce qu'il ne tient PAS
//
// Le rendu du panneau sur une machine Windows. Il établit que l'annonce du
// serveur provoque bien la relecture et que le magasin reçoit le contrat
// corrigé ; la confirmation de Jean Valjean reste à recueillir.
//
// Refs renesenses/tune-server-rust#4559
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get, writable } from 'svelte/store';
import { demarrerTransportV2 } from '../v2Live';
import { currentZoneId, zones } from '../stores/zones';

/** Les URL parties sur le réseau, dans l'ordre. */
let urls: string[] = [];

/**
 * Le contrat que `GET /zones` rend à l'instant. Il bascule quand le bras
 * exclusif WASAPI s'ouvre — côté serveur, c'est `output_signal_path` que le
 * sondeur vient de poser, et c'est aussi ce qui déclenche l'annonce.
 */
const contratServeur = writable<Record<string, unknown>>({
  transport: 'WASAPI (shared — Windows mixer)',
  bit_perfect: false,
});

const zoneCourante = () => ({
  id: 3,
  name: 'Haut-parleurs',
  state: 'playing',
  volume: 100,
  position_ms: 1000,
  output_type: 'local',
  current_track: { id: 77, title: 'Une piste', duration_ms: 205_753 },
  signal_path: get(contratServeur),
});

function reponse(url: string): unknown {
  if (/\/zones\/\d+\/queue/.test(url)) return { tracks: [], position: 0, length: 0 };
  if (/\/zones\/\d+(\?|$)/.test(url)) return zoneCourante();
  if (/\/zones(\?|$)/.test(url)) return [zoneCourante()];
  return {};
}

// Le vrai WebSocket ouvrirait une connexion : on garde la main sur le flux
// d'évènements, c'est tout l'objet de la mesure.
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

beforeEach(() => {
  urls = [];
  contratServeur.set({
    transport: 'WASAPI (shared — Windows mixer)',
    bit_perfect: false,
  });
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const u = String(url);
    urls.push(`${init?.method ?? 'GET'} ${u}`);
    return Promise.resolve(
      new Response(JSON.stringify(reponse(u)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const relectures = () => urls.filter((u) => /GET \S*\/zones(\?|$)/.test(u)).length;
const respirer = () => new Promise((r) => setTimeout(r, 0));

async function demarrer() {
  zones.set([zoneCourante() as never]);
  currentZoneId.set(3);
  const arreter = demarrerTransportV2();
  await respirer();
  return arreter;
}

/** La trame que le serveur émet VRAIMENT — `tune-core/src/poller/tick.rs`. */
const ANNONCE_DU_SERVEUR = { type: 'zone.updated', data: { zone_id: 3 } };

describe('#4559 — l’annonce du contrat de signal atteint l’écran', () => {
  it('une annonce nue `{zone_id}` fait relire les zones', async () => {
    const arreter = await demarrer();
    const avant = relectures();

    pousser(ANNONCE_DU_SERVEUR);
    await respirer();

    const apres = relectures() - avant;
    arreter();
    expect(
      apres,
      'l’annonce du sondeur traverse le gestionnaire sans rien déclencher : ' +
        'le panneau « Chemin du signal » reste sur sa valeur périmée jusqu’au ' +
        'prochain geste (#4559).',
    ).toBe(1);
  });

  it('le magasin reçoit le contrat corrigé, sans aucun geste', async () => {
    const arreter = await demarrer();

    // Le bras exclusif s’ouvre : le sondeur publie le contrat et l’annonce.
    contratServeur.set({ transport: 'WASAPI (exclusive)', bit_perfect: true });
    pousser(ANNONCE_DU_SERVEUR);
    await respirer();

    const zone = get(zones).find((z: any) => z?.id === 3) as any;
    arreter();
    expect(zone, 'la zone a disparu du magasin').toBeTruthy();
    expect(
      zone.signal_path?.transport,
      'le panneau annoncerait encore « shared » alors que le serveur a publié ' +
        'l’exclusif — c’est la capture de Jean Valjean.',
    ).toBe('WASAPI (exclusive)');
    expect(zone.signal_path?.bit_perfect).toBe(true);
  });

  it('la forme `{zones: [...]}` du repli HTTP reste traitée sans relecture', async () => {
    // `websocket.ts` fabrique cette forme quand il sonde `/zones` lui-même :
    // les zones sont DANS la trame, la relire serait la demander deux fois.
    const arreter = await demarrer();
    const avant = relectures();

    pousser({
      type: 'zone.updated',
      data: { zones: [{ ...zoneCourante(), signal_path: { transport: 'ASIO (exclusive)', bit_perfect: true } }] },
    });
    await respirer();

    const apres = relectures() - avant;
    const zone = get(zones).find((z: any) => z?.id === 3) as any;
    arreter();
    expect(apres, 'la trame portait déjà les zones : aucune relecture ne se justifie').toBe(0);
    expect(zone.signal_path?.transport).toBe('ASIO (exclusive)');
  });
});
