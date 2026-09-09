// @vitest-environment jsdom
//
// « L'interface v2 n'affiche AUCUN échec de lecture »
// — renesenses/tune-server-rust#3732 et #3737.
//
// ## Ce que ces témoins gardent
//
// Le 09/09/2026, un testeur Windows signale « lecture impossible des albums ».
// Il a fallu descendre dans 200 lignes de son journal serveur pour trouver la
// cause : son DAC n'était plus énuméré par WASAPI. Le serveur le savait, et
// poussait déjà à toutes les télécommandes un message qui NOMMAIT l'appareil
// demandé ET les endpoints disponibles, avec `fatal: true`. Aucun écran ne
// l'affichait.
//
// TROIS canaux étaient bouchés, indépendamment l'un de l'autre :
//
//  1. l'erreur HTTP de `POST /play`, avalée par `.catch(() => {})` — 19 sites ;
//  2. l'événement `zone.playback_error`, écouté NULLE PART en v2 ;
//  3. `ToastContainer`, le seul composant qui rend `$notifications`, monté par
//     `App.svelte` seul — donc jamais sous `?v2`. Sans celui-là, corriger les
//     deux premiers n'aurait rien changé à l'écran.
//
// ## 🔴 CES TÉMOINS MONTENT L'ÉCRAN ET LISENT LE DOM
//
// Vérifier qu'une fonction a été appelée ne prouve pas que l'utilisateur voit
// quelque chose — c'est exactement l'erreur que le canal 3 rendait possible :
// `notifications.error()` était appelé 119 fois dans les écrans v2, et
// l'écran restait vide. Ici on monte la VRAIE coquille, on clique le VRAI
// bouton Lire, on pousse un VRAI événement dans le WebSocket, et on lit le
// TEXTE RENDU dans le document.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView } from '../stores/navigation';
import { notifications } from '../stores/notifications';
import { playPendingUntil } from '../stores/zones';

/** Le message que le serveur a réellement écrit chez le testeur, mot pour mot. */
const MESSAGE_SERVEUR =
  'Endpoint WASAPI demandé introuvable : « audio-gd USB audio ». ' +
  'Disponibles : Haut-parleurs [{0.0.0.00000000}.{e0ea21cf-56cc-445f-8454-880d431d7cb0}]';

const ZONE = {
  id: 1,
  name: 'audio-gd USB audio',
  output_type: 'local',
  output_device_id: 'local:audio-gd USB audio',
  state: 'stopped',
  online: false,
  volume: 50,
};

const ALBUM = { id: 42, title: 'Adele 25', artist_name: 'Adele', year: 2015 };

/** Réponses HTTP à donner ; une entrée par motif d'URL. */
let refusDePlay: { status: number; corps: unknown } | null = null;
let urls: string[] = [];

/**
 * Les écrans de la coquille lisent une douzaine de routes au montage. On ne
 * bouchonne que ce qui compte ; le reste doit simplement avoir la BONNE FORME
 * — une route de collection qui rendrait `{}` ferait exploser un `.find()`
 * quelque part et masquerait le vrai résultat.
 */
const COLLECTIONS =
  /\/(profiles|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|tracks|top-artists|recent|genres)(\?|\/|$)/;

function reponsePour(url: string, options?: RequestInit): Response {
  const post = String(options?.method ?? 'GET').toUpperCase() === 'POST';
  if (post && /\/zones\/\d+\/play/.test(url) && refusDePlay) {
    const corps = refusDePlay.corps;
    return {
      ok: false,
      status: refusDePlay.status,
      statusText: 'Bad Request',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }
  let corps: unknown = {};
  // 🔴 La FILE d'abord, et sa forme complète. `upNextCount` (queue.ts) fait
  // `$tracks.length` sans garde : une file rendue sans `tracks` lève dans un
  // `derived`, ce qui TUE la racine Svelte — plus aucun rendu ensuite, et tous
  // les témoins de ce fichier deviennent rouges pour une raison qui n'est pas
  // la leur. Deux heures perdues dessus le 09/09/2026.
  if (/\/queue/.test(url)) corps = { tracks: [], position: 0, length: 0 };
  else if (/\/zones(\?|$)/.test(url)) corps = [ZONE];
  else if (/\/zones\/\d+/.test(url)) corps = ZONE;
  else if (/\/library\/albums\b/.test(url)) corps = [ALBUM];
  else if (COLLECTIONS.test(url)) corps = [];
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

/** Les WebSocket créées par la coquille — pour pousser des événements dedans. */
let sockets: any[] = [];

class FausseSocket {
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 1;
  constructor() {
    sockets.push(this);
  }
  send() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}

/** Pousse un événement serveur dans TOUTES les sockets ouvertes par la coquille. */
function pousserEvenement(event: unknown): void {
  const data = JSON.stringify(event);
  for (const s of sockets) s.onmessage?.({ data });
  flushSync();
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poserLaCoquille(): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ShellV2, { target: hote });
  flushSync();
  return hote;
}

const respirer = (ms = 60) => new Promise((r) => setTimeout(r, ms));

/** Le texte des bandeaux d'ERREUR effectivement rendus dans le document. */
function bandeauxErreur(): string[] {
  return Array.from(document.querySelectorAll('.toast.toast-error')).map(
    (e) => (e.querySelector('.toast-msg') as HTMLElement | null)?.textContent?.trim() ?? '',
  );
}

/** Le texte de TOUS les bandeaux, quel que soit leur niveau. */
function tousLesBandeaux(): string[] {
  return Array.from(document.querySelectorAll('.toast')).map(
    (e) => (e.querySelector('.toast-msg') as HTMLElement | null)?.textContent?.trim() ?? '',
  );
}

beforeEach(() => {
  urls = [];
  sockets = [];
  refusDePlay = null;
  playPendingUntil.clear();
  for (const n of get(notifications)) notifications.dismiss(n.id);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      urls.push(String(url));
      return reponsePour(String(url), options);
    }),
  );
  vi.stubGlobal('WebSocket', FausseSocket as unknown as typeof WebSocket);
  activeView.set('library');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  for (const n of get(notifications)) notifications.dismiss(n.id);
  playPendingUntil.clear();
  vi.unstubAllGlobals();
});

describe('#3732 — un échec de lecture ATTEINT l’écran de la coquille v2', () => {
  it('le conteneur de bandeaux est MONTÉ — sinon les 119 messages v2 partent dans le vide', () => {
    poserLaCoquille();
    // Canal 3. `notifications` est un magasin ; `ToastContainer` est le SEUL
    // composant du client qui le rend, et `App.svelte` était le seul à le
    // monter. On pousse un message et on regarde s'il s'écrit quelque part.
    notifications.error('témoin de montage');
    flushSync();
    expect(
      tousLesBandeaux(),
      'aucun bandeau rendu : `ToastContainer` n’est pas monté dans la coquille v2 — ' +
        'tout `notifications.error()` d’un écran v2 part dans le vide (#3732)',
    ).toContain('témoin de montage');
  });

  it('une erreur HTTP de POST /play s’écrit à l’écran, avec le motif du serveur', async () => {
    // Canal 1. Le serveur refuse la lecture : `400 {"error":"no tracks to play"}`
    // — le refus mesuré de `routes/playback.rs`, qui ne laisse AUCUNE trace,
    // ni au journal serveur ni à l'écran.
    refusDePlay = { status: 400, corps: { error: 'no tracks to play', detail: 'no tracks to play' } };
    const el = poserLaCoquille();
    await respirer();
    flushSync();

    const lire = el.querySelector('button.centre') as HTMLButtonElement | null;
    expect(lire, 'le bouton Lire de la pochette n’est pas rendu — témoin sans objet').not.toBeNull();
    lire!.click();
    await respirer();
    flushSync();

    const vus = bandeauxErreur();
    expect(
      vus.join(' | '),
      'le clic sur Lire a échoué et l’écran n’a rien dit : le `.catch(() => {})` est de retour (#3732)',
    ).toContain('no tracks to play');
  });

  it('un refus que la couche API traduit déjà ne pose QU’UN bandeau', async () => {
    // `fetchJSON` traduit lui-même `file_not_found` et `zone_no_output_device`
    // et pose son propre bandeau, parce que ses appelants historiques
    // n'attendaient pas leur promesse. Maintenant que les appels de lecture
    // posent le leur, le même échec en produirait DEUX, empilés. Le silence
    // remplacé par du bruit serait un autre défaut.
    refusDePlay = { status: 400, corps: { error: 'zone_no_output_device', detail: 'zone has no output' } };
    const el = poserLaCoquille();
    await respirer();
    flushSync();

    const lire = el.querySelector('button.centre') as HTMLButtonElement | null;
    expect(lire, 'le bouton Lire de la pochette n’est pas rendu — témoin sans objet').not.toBeNull();
    lire!.click();
    await respirer();
    flushSync();

    const vus = bandeauxErreur();
    expect(vus.length, `deux bandeaux pour un seul échec : ${vus.join(' | ')}`).toBe(1);
    // Et c'est le message TRADUIT qui reste, pas le terme brut du serveur.
    expect(vus[0]).not.toContain('zone_no_output_device');
    expect(vus[0].length, 'le bandeau restant est vide').toBeGreaterThan(10);
  });

  it('un `zone.playback_error` FATAL s’écrit à l’écran, en nommant l’appareil ET les disponibles', async () => {
    // Canal 2, et le cas de terrain exact. La charge utile est celle que le
    // serveur pousse réellement (`poller.rs`), y compris `fatal: true`.
    poserLaCoquille();
    await respirer();

    pousserEvenement({
      type: 'zone.playback_error',
      data: {
        zone_id: 1,
        message: MESSAGE_SERVEUR,
        fatal: true,
        device: 'local:audio-gd USB audio',
      },
    });

    const vus = bandeauxErreur().join(' | ');
    expect(
      vus,
      '`zone.playback_error` n’atteint pas l’écran de la coquille v2 (#3737)',
    ).toContain('audio-gd USB audio');
    // Le point 3 du ticket : l'écran doit dire ce que le serveur SAIT déjà.
    // Nommer l'appareil manquant sans nommer ceux qui sont là ne permet pas de
    // conclure « mon DAC est débranché » en trois secondes.
    expect(
      vus,
      'les endpoints DISPONIBLES sont perdus en route : le message du serveur est tronqué',
    ).toContain('Haut-parleurs');
  });

  it('un échec non fatal, PENDANT la fenêtre de grâce, ne pose AUCUN bandeau d’erreur', async () => {
    // Le revers exigé : remplacer le silence par du bruit serait un autre
    // défaut. Un pré-transcodage HI-RES lent (Tidal/Qobuz) fait émettre au
    // serveur une erreur passagère juste après le Lire, alors que la lecture
    // démarre ensuite (#1146). La v1 affiche « chargement… » ; la v2 doit
    // faire la même distinction, sinon chaque album HI-RES crie à l'erreur.
    const el = poserLaCoquille();
    await respirer();
    flushSync();

    // La fenêtre s'ouvre par le VRAI chemin : `playAndSync` appelle
    // `ouvrirAttente()`. Un clic qui réussit suffit — c'est le geste que le
    // pré-transcodage suit.
    const lire = el.querySelector('button.centre') as HTMLButtonElement | null;
    expect(lire, 'le bouton Lire de la pochette n’est pas rendu — témoin sans objet').not.toBeNull();
    lire!.click();
    await respirer();
    flushSync();
    expect(
      playPendingUntil.has(1),
      'la fenêtre de grâce ne s’est pas ouverte : ce témoin ne mesurerait rien',
    ).toBe(true);

    pousserEvenement({
      type: 'zone.playback_error',
      data: { zone_id: 1, message: 'DASH file already being decoded', fatal: false },
    });

    expect(
      bandeauxErreur().join(' | '),
      'un incident PASSAGER a produit un bandeau d’erreur : le silence a été remplacé par du bruit',
    ).not.toContain('already being decoded');
  });

  it('un échec FATAL pendant la fenêtre de grâce s’affiche QUAND MÊME', async () => {
    // Le cœur de la distinction, et le cas de terrain exact. Le serveur
    // rapporte un périphérique qui refuse de s'ouvrir en MOINS D'UNE SECONDE
    // après le Lire — donc en plein dans les trente secondes de la fenêtre.
    // Le taire y afficherait « chargement… » puis plus rien du tout, puisque
    // cette erreur-là n'est émise qu'une fois et que la zone s'arrête juste
    // après. C'est précisément le défaut nommé par #3108.
    const el = poserLaCoquille();
    // La fenêtre est ouverte de la façon dont `playAndSync` l'ouvre.
    playPendingUntil.set(1, Date.now() + 30000);
    expect(playPendingUntil.has(1), 'la fenêtre n’est pas ouverte : témoin sans objet').toBe(true);

    // ⚠️ Message VOLONTAIREMENT différent de celui du cas précédent : le
    // garde-répétition de `v2Live` tait un message identique reçu à moins de
    // trois secondes, et les cas de ce fichier s'enchaînent en millisecondes.
    // Réutiliser le même texte ferait passer ce témoin pour rouge alors que
    // c'est le garde-répétition qui aurait parlé.
    pousserEvenement({
      type: 'zone.playback_error',
      data: { zone_id: 1, message: `${MESSAGE_SERVEUR} (mode exclusif)`, fatal: true },
    });

    expect(
      bandeauxErreur().join(' | '),
      'un échec FATAL a été tu par la fenêtre de grâce : l’écran montrerait « chargement… » ' +
        'puis plus rien, alors que le périphérique ne guérira pas (#3108)',
    ).toContain('audio-gd USB audio');
    expect(el).toBeTruthy();
  });

  it('douze clics sur un DAC absent ne posent pas douze bandeaux identiques', async () => {
    // Remplacer le silence par un mur de bandeaux serait un autre défaut. Chez
    // le testeur du 09/09, douze clics ont produit douze `zone.playback_error`
    // rigoureusement identiques ; le conteneur n'en empile proprement que trois.
    poserLaCoquille();
    const charge = {
      type: 'zone.playback_error',
      data: { zone_id: 1, message: 'DAC absent, un seul bandeau attendu', fatal: true },
    };
    for (let i = 0; i < 5; i++) pousserEvenement(charge);
    expect(
      bandeauxErreur().filter((m) => m.includes('un seul bandeau attendu')).length,
      'le même échec s’est empilé : cinq bandeaux identiques se recouvrent à l’écran',
    ).toBe(1);
  });

  it('le même échec non fatal, HORS fenêtre de grâce, s’écrit bien à l’écran', async () => {
    // La contre-épreuve du cas précédent : sans elle, « ne rien afficher pour
    // un non-fatal » passerait pour un succès alors que ce serait le défaut
    // d'origine reproduit sous condition.
    poserLaCoquille();
    await respirer();
    playPendingUntil.clear();

    pousserEvenement({
      type: 'zone.playback_error',
      data: { zone_id: 1, message: 'pipeline error', fatal: false },
    });

    expect(
      bandeauxErreur().join(' | '),
      'hors fenêtre de grâce, un échec doit se voir — fatal ou non',
    ).toContain('pipeline error');
  });

  it('le bandeau se ferme au CLAVIER — un message qu’on ne peut fermer qu’à la souris n’est pas fermable', () => {
    poserLaCoquille();
    notifications.error('témoin clavier');
    flushSync();
    const fermer = document.querySelector('.toast.toast-error .toast-dismiss');
    expect(fermer, 'aucun bouton de fermeture rendu').not.toBeNull();
    // Un `<div onclick>` n'est atteint par aucune tabulation. Ici c'est un
    // `<button>` : il l'est par construction, et `click()` répond aussi à
    // Entrée et à Espace.
    expect(fermer!.tagName).toBe('BUTTON');
    (fermer as HTMLButtonElement).click();
    flushSync();
    expect(bandeauxErreur().join(' | ')).not.toContain('témoin clavier');
  });
});
