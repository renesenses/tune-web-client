// @vitest-environment jsdom
//
// « État du serveur : aucun moyen de mettre en pause un traitement de fond »
// — renesenses/tune-web-client#1352, serveur renesenses/tune-server-rust#4574.
//
// Sur le .18 de Bertrand : plage dynamique à 57 % de 47 118 pistes, ReplayGain
// à 7 % de 2 483. Ces passes décodent des fichiers entiers pendant des heures,
// sur le disque que le lecteur utilise au même moment. L'écran « État du
// serveur » les REGARDAIT tourner sans offrir le moindre geste.
//
// 🔴 CE TÉMOIN MONTE L'ÉCRAN ET CLIQUE.
//
// Chercher `pauseBackgroundTask` dans le source resterait vert devant un
// bouton mort — c'est exactement ce que #865 a appris ici. On monte
// `TuneHealthV2`, on clique le bouton de la carte, et on lit la requête
// RÉELLEMENT partie : sa méthode et son chemin.
//
// Les contre-épreuves comptent autant :
//   * un serveur qui ne sait pas suspendre (< 0.9.159, pas de `pausable`)
//     n'affiche AUCUN bouton — plutôt qu'un bouton qui rendrait 404 ;
//   * une carte au repos n'en porte pas non plus ;
//   * la carte du scan n'en porte JAMAIS : le scan garde son « Arrêter ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import TuneHealthV2 from '../../components/v2/TuneHealthV2.svelte';
import lFr from '../locales/fr';

type Requete = { methode: string; chemin: string };
let requetes: Requete[] = [];

/** Les collections que l'écran lit au montage : la forme suffit. */
const VIDE = /\/(zones|devices|profiles|shortcuts|collections)(\?|\/|$)/;

/**
 * Un serveur où le ReplayGain TRAVAILLE et où la plage dynamique est au repos.
 *
 * `pausable` est le bloc ajouté par le serveur #4574 ; `paused` bascule selon
 * ce que le témoin a déjà envoyé, pour que le bouton devienne « Reprendre »
 * comme il le ferait en vrai.
 */
let rgEnPause = false;
let connaitLaPause = true;

function corpsPour(chemin: string): unknown {
  if (chemin.includes('/system/background-tasks')) {
    const base: Record<string, unknown> = { tasks: [] };
    if (connaitLaPause) {
      base.pausable = [
        { id: 'replaygain', state: rgEnPause ? 'en_pause' : 'en_cours', paused: rgEnPause },
        { id: 'fingerprints', state: 'au_repos', paused: false },
        { id: 'dynamic_range', state: 'au_repos', paused: false },
        { id: 'acoustic', state: 'au_repos', paused: false },
        { id: 'enrichment', state: 'au_repos', paused: false },
        { id: 'artist_images', state: 'au_repos', paused: false },
      ];
      base.all_paused = false;
      base.scan_pausable = false;
    }
    return base;
  }
  // La carte ReplayGain : une passe OUVERTE, donc `running` à l'écran.
  if (chemin.includes('/system/replaygain/progress')) {
    return {
      active: true, processed: 174, total: 2483, remaining: 2309,
      deferred: 0, waiting_reason: null, updated_at: 1, reported: true, enabled: true,
    };
  }
  if (chemin.includes('/system/config')) {
    return { replaygain_mode: 'track', replaygain_analysis_enabled: true };
  }
  // Le scan ne tourne pas : sa carte est au repos, et de toute façon il n'est
  // pas suspendable.
  if (chemin.includes('/system/scan/status')) return { scanning: false };
  if (VIDE.test(chemin)) return [];
  return {};
}

function enveloppe(corps: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  requetes = [];
  rgEnPause = false;
  connaitLaPause = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any, init?: any) => {
      const brut = String(typeof url === 'string' ? url : (url?.url ?? ''));
      const chemin = brut.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
      const methode = String(init?.method ?? 'GET').toUpperCase();
      requetes.push({ methode, chemin });
      // Le serveur applique la pause : l'instantané suivant la porte, comme en
      // vrai — et les quatre routes rendent le MÊME corps que le GET.
      if (methode === 'POST' && chemin.endsWith('/replaygain/pause')) rgEnPause = true;
      if (methode === 'POST' && chemin.endsWith('/replaygain/resume')) rgEnPause = false;
      return enveloppe(corpsPour(chemin));
    }),
  );
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
  } as any);
});

afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const souffler = (ms = 60) => new Promise((r) => setTimeout(r, ms));

async function monterLEcran() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(TuneHealthV2, { target: hote });
  flushSync();
  await souffler(120);
  flushSync();
  return hote;
}

/** La carte d'un identifiant, telle qu'elle est rendue. */
function carte(id: string): HTMLElement | null {
  const cartes = Array.from(hote!.querySelectorAll('article.card')) as HTMLElement[];
  const titres: Record<string, string> = {
    rg: 'ReplayGain',
    scan: lFr['v2.health.cardScan'],
    dr: lFr['v2.health.cardDr'],
  };
  const attendu = titres[id];
  return cartes.find((c) => c.querySelector('h2')?.textContent?.trim() === attendu) ?? null;
}

function boutonDe(c: HTMLElement | null): HTMLButtonElement | null {
  return (c?.querySelector('.cactions button') as HTMLButtonElement) ?? null;
}

const POSTS = () => requetes.filter((r) => r.methode === 'POST').map((r) => r.chemin);
/** Le préfixe de l'API dépend du déploiement : on juge la FIN du chemin. */
const aPoste = (suffixe: string) => POSTS().some((c) => c.endsWith(suffixe));

describe('#1352 — suspendre un traitement de fond depuis « État du serveur »', () => {
  it('🔴 le bouton Pause d’une carte active ENVOIE bien la requête, et devient Reprendre', async () => {
    await monterLEcran();

    const rg = carte('rg');
    expect(rg, 'la carte ReplayGain doit être rendue').toBeTruthy();

    const bouton = boutonDe(rg);
    expect(
      bouton,
      'la carte d’un traitement ACTIF ne porte aucun bouton — c’est #1352 : ' +
        'l’écran regarde tourner une passe de plusieurs heures sans offrir le moindre geste',
    ).toBeTruthy();
    expect(bouton!.textContent?.trim()).toBe(lFr['v2.health.pause']);

    bouton!.click();
    await souffler(120);
    flushSync();

    expect(
      aPoste('/system/background-tasks/replaygain/pause'),
      `aucun POST de pause n’est parti : le bouton est décoratif. POST vus : ${JSON.stringify(POSTS())}`,
    ).toBe(true);

    // Le badge dit « En pause », et le bouton propose la reprise.
    const rg2 = carte('rg');
    expect(rg2?.querySelector('.badge')?.textContent?.trim()).toBe(lFr['v2.health.stPaused']);
    expect(boutonDe(rg2)?.textContent?.trim()).toBe(lFr['v2.health.resume']);

    // Et la reprise repart, elle aussi, vers la bonne route.
    boutonDe(rg2)!.click();
    await souffler(120);
    flushSync();
    expect(aPoste('/system/background-tasks/replaygain/resume'), JSON.stringify(POSTS())).toBe(true);
  });

  it('l’interrupteur général suspend TOUT en un geste', async () => {
    await monterLEcran();

    const general = Array.from(hote!.querySelectorAll('header button')).find(
      (b) => b.textContent?.trim() === lFr['v2.health.pauseAll'],
    ) as HTMLButtonElement | undefined;
    expect(
      general,
      'l’interrupteur général manque en tête d’écran : c’est le geste d’un soir ' +
        'd’écoute, il ne se cherche pas carte par carte',
    ).toBeTruthy();

    general!.click();
    await souffler(120);
    flushSync();
    expect(aPoste('/system/background-tasks/pause-all'), JSON.stringify(POSTS())).toBe(true);
  });

  // ── Les contre-épreuves ──────────────────────────────────────────────────

  it('🔴 CONTRE-ÉPREUVE — un serveur qui ne sait pas suspendre n’affiche AUCUN bouton', async () => {
    connaitLaPause = false;
    await monterLEcran();

    expect(
      hote!.querySelectorAll('.cactions button').length,
      'un serveur antérieur à 0.9.159 ne connaît pas ces routes : un bouton ' +
        'affiché ici rendrait 404 sous le doigt du testeur',
    ).toBe(0);
    expect(
      Array.from(hote!.querySelectorAll('header button')).some(
        (b) => b.textContent?.trim() === lFr['v2.health.pauseAll'],
      ),
      'l’interrupteur général ne doit pas non plus apparaître',
    ).toBe(false);
  });

  it('CONTRE-ÉPREUVE — la carte du SCAN ne porte jamais de bouton Pause', async () => {
    await monterLEcran();

    expect(
      boutonDe(carte('scan')),
      'le scan n’est pas suspendable (`scan_pausable: false`) : il garde son ' +
        '« Arrêter », et une pause y gèlerait l’analyse acoustique par ricochet',
    ).toBeNull();
  });

  it('CONTRE-ÉPREUVE — une carte au repos et non suspendue ne porte pas de bouton', async () => {
    await monterLEcran();

    // La plage dynamique : `au_repos`, `paused: false`. Un bouton ici ne ferait
    // rien, et l'écran ne montre que ce qu'il sait.
    expect(boutonDe(carte('dr'))).toBeNull();
  });
});
