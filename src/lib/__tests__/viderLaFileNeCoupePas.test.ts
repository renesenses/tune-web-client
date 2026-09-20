// @vitest-environment jsdom
/**
 * 🔴 RÈGLE PRODUIT — « Vider la file d'attente ne doit pas couper la lecture
 * en cours. » (Bertrand, 20/09/2026, encore constaté en v0.9.157/.158.)
 *
 * ## Ce qui se passait
 *
 * Le serveur a DEUX comportements sur la même route
 * (`tune-server/src/routes/playback.rs`, `queue_clear`, montée sur
 * `DELETE /{id}/queue` et `POST /{id}/queue/clear`) :
 *
 *  - par défaut → `orchestrator.stop` puis `stop_and_clear` : ça COUPE ;
 *  - avec `keep_current` (chaîne de requête ou corps JSON) → `queue_clear_suite`
 *    tronque après le curseur, sans aucun `stop` (livré en v0.9.155,
 *    tune-server-rust#4169).
 *
 * Le client web appelait le premier. `QueueV2` portait même les DEUX gestes
 * côte à côte — « Vider la file » (qui coupait) et « Vider la suite » (qui ne
 * coupait pas) — et `NowPlaying` n'avait que celui qui coupe. Quatre testeurs
 * l'ont remonté : Laurent (tune-server-rust#3669), Bilou (#4090), Cyrille
 * (#4163/#4169), GgB (#4321).
 *
 * ## Ce que ce témoin garde
 *
 * On MONTE le vrai écran, on clique le vrai bouton, et on lit la requête
 * RÉELLEMENT partie — pas un espion posé sur `api.clearQueue`. Une garde de
 * source aurait accepté un bouton débranché ; un espion sur la fonction
 * d'API aurait accepté un corps vide.
 *
 * ## Contre-épreuve, mesurée
 *
 *  1. remettre `api.clearQueue($currentZoneId!, false)` dans `QueueV2` ⇒
 *     « le corps porte keep_current » tombe (corps `undefined`) ;
 *  2. remettre le défaut `keepCurrent = false` dans `api.ts` ⇒ les DEUX
 *     écrans tombent ;
 *  3. remettre le second bouton ⇒ « un seul geste » tombe.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import * as api from '../api';
import { currentZoneId, zones } from '../stores/zones';
import { queueTracks, queuePosition } from '../stores/queue';
import type { Track, Zone } from '../types';
import QueueV2 from '../../components/v2/QueueV2.svelte';

/** Le coût n'est pas le test, c'est la transformation Svelte au premier
 *  montage — voir `sortieMonoZone.test.ts`, même plafond, même raison. */
const DELAI_MONTAGE = 60_000;

const ZONE = 21;

function piste(id: number): Track {
  return { id, title: `Piste ${id}`, artist_name: 'X', duration_ms: 1000 } as Track;
}
const FILE = { tracks: [piste(1), piste(2), piste(3)], position: 1 };

type Appel = { url: string; init: RequestInit };
let appels: Appel[];

/** Un faux serveur, pas un faux module : la requête traverse `api.ts` en
 *  entier (en-têtes compris) avant d'arriver ici. */
function serveur() {
  appels = [];
  const faux = vi.fn(async (url: string, init: RequestInit = {}) => {
    appels.push({ url, init });
    if (/\/queue\/clear$/.test(url)) return new Response(null, { status: 204 });
    if (/\/queue$/.test(url)) {
      return new Response(JSON.stringify(FILE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', faux);
  return appels;
}

/** La requête de vidage réellement partie, décodée. */
function vidage() {
  const a = appels.find((x) => /\/queue\/clear$/.test(x.url));
  if (!a) throw new Error('aucune requête de vidage n\'est partie');
  return { url: a.url, body: a.init.body ? JSON.parse(String(a.init.body)) : undefined };
}

let cible: HTMLElement;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  serveur();
  currentZoneId.set(ZONE);
  zones.set([{ id: ZONE, name: 'Bureau', state: 'playing' } as Zone]);
  queueTracks.set(FILE.tracks);
  queuePosition.set(FILE.position);
  cible = document.createElement('div');
  document.body.appendChild(cible);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  cible.remove();
  vi.unstubAllGlobals();
});

describe('la couche API — le drapeau est le DÉFAUT, pas une option', () => {
  it('sans argument, la requête porte keep_current: true', async () => {
    await api.clearQueue(ZONE);
    expect(vidage().body).toEqual({ keep_current: true });
  });

  it('`false` reste joignable, et garde la forme SANS corps des serveurs d\'avant la .155', async () => {
    await api.clearQueue(ZONE, false);
    expect(vidage().body).toBeUndefined();
  });
});

describe('QueueV2 — le vrai écran, le vrai clic', () => {
  /**
   * 🔴 L'ÉCRAN EST IMPORTÉ À LA COLLECTE, PAS DANS LE CAS — #1326 / #1333.
   *
   * Un `await import('….svelte')` posé DANS un cas fait payer la compilation du
   * composant par vite au chronomètre de ce cas. Sous charge (huit portes
   * simultanées sur Shrek), le chronomètre saute : vitest déclare le cas expiré,
   * `afterEach` retire l'hôte, le cas suivant s'ouvre — puis la continuation
   * abandonnée reprend et exécute son `mount(…, { target: cible! })`. `cible`
   * est une variable de MODULE : elle désigne alors l'hôte du cas SUIVANT. Deux
   * écrans dans la même boîte, et un faux rouge qui accuse le code de terrain.
   *
   * L'import statique déplace la compilation vers la COLLECTE, hors de tout
   * chronomètre, et rend `mount` SYNCHRONE ici : plus aucune continuation ne peut
   * se poser dans l'hôte du cas suivant. `QueueV2.svelte` n'a pas de
   * `<script module>` : l'importer avant les `vi.stubGlobal(…)` ne déclenche rien.
   * Gardé par `composantsALaCollecte1333.test.ts`.
   */
  async function ecran() {
    monte = mount(QueueV2, { target: cible, props: {} });
    flushSync();
    await vi.waitFor(() => expect(cible.querySelector('.v2-actions')).toBeTruthy());
    return cible;
  }

  /** Les boutons qui vident : le libellé vient du dictionnaire, jamais de la clé. */
  function boutonsDeVidage(racine: HTMLElement): HTMLButtonElement[] {
    return Array.from(racine.querySelectorAll<HTMLButtonElement>('.v2-actions button')).filter((b) =>
      /vider|file/i.test(b.textContent ?? ''),
    );
  }

  it('🔴 UN SEUL geste de vidage — le doublon « Vider la suite » a disparu', { timeout: DELAI_MONTAGE }, async () => {
    const racine = await ecran();
    const b = boutonsDeVidage(racine);
    expect(b).toHaveLength(1);
    expect(b[0].textContent?.trim()).toBe('Vider la file');
    // Et il DIT ce qu'il fait, dans la langue de l'utilisateur.
    expect(b[0].title).toBe('Retire ce qui suit sans arrêter la piste en cours.');
  });

  it('🔴 le cliquer envoie keep_current: true — la lecture n\'est pas coupée', { timeout: DELAI_MONTAGE }, async () => {
    const racine = await ecran();
    boutonsDeVidage(racine)[0].click();
    await vi.waitFor(() => expect(appels.some((a) => /\/queue\/clear$/.test(a.url))).toBe(true));

    const r = vidage();
    expect(r.url).toContain(`/zones/${ZONE}/queue/clear`);
    expect(r.body).toEqual({ keep_current: true });
  });

  it('aucune requête d\'arrêt ne part avec le vidage', { timeout: DELAI_MONTAGE }, async () => {
    const racine = await ecran();
    boutonsDeVidage(racine)[0].click();
    await vi.waitFor(() => expect(appels.some((a) => /\/queue\/clear$/.test(a.url))).toBe(true));
    expect(appels.filter((a) => /\/stop$/.test(a.url))).toHaveLength(0);
  });
});

describe('NowPlaying — le même geste, la même règle', () => {
  const src = readFileSync('src/components/partages/NowPlaying.svelte', 'utf8');
  const bloc = src.slice(
    src.indexOf('async function qsHandleClearQueue'),
    src.indexOf('let qsSavingQueue'),
  );

  it('le panneau de file appelle le geste sans forcer la coupure', () => {
    expect(bloc).toContain('await api.clearQueue(zone.id);');
    expect(bloc).not.toContain('clearQueue(zone.id, false)');
  });

  it('🔴 il ne repeint plus l\'écran en « arrêté »', () => {
    // C'était la moitié du défaut : même serveur corrigé, l'utilisateur voyait
    // une lecture arrêtée pendant qu'elle continuait.
    expect(bloc).not.toContain("state: 'stopped'");
    expect(bloc).not.toContain('current_track: null');
    expect(bloc).not.toContain('stopSeekTimer()');
    // Il relit la file au serveur plutôt que de la deviner vide.
    expect(bloc).toContain('await api.getQueue(zone.id)');
    expect(bloc).not.toContain('queueTracks.set([])');
  });
});

describe('l\'arrêt reste atteignable — il a son propre geste', () => {
  const barre = readFileSync('src/components/partages/TransportBar.svelte', 'utf8');

  it('la barre de transport porte un chemin d\'arrêt, et il est branché', () => {
    expect(barre).toContain('ondblclick={doubleClicLecture}');
    expect(barre).toMatch(/async function arreter\(\)[\s\S]{0,200}stopAndSync\(zone\.id\)/);
  });
});
