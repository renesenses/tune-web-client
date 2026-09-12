// @vitest-environment jsdom
//
// 🔴 « Ajoute un bouton idem version actuelle dans Réglages / Système »
//     (Bertrand, 12/09/2026) — TROISIÈME fois.
//
// Le nouvel écran de réglages avait rattrapé « ✓ À jour » et « revérifier »
// (#945 et avant), mais le BLOC de mise à jour lui-même n'avait toujours qu'UNE
// branche là où la coquille actuelle en a quatre, et l'onglet Système n'offrait
// AUCUN geste de service — ni redémarrer, ni arrêter — alors que les deux
// routes existent et que `api.restartServer()` / `api.stopServer()` les
// appelaient déjà depuis l'autre coquille. « Écrit mais pas branché ».
//
// ## 🔴 Ce que ce témoin refuse de faire
//
// Poser lui-même l'état qu'il vérifie. Un test qui écrirait `updDone = true`
// ou qui déciderait à la place de l'écran du résultat de la confirmation
// serait vert des deux côtés sans rien prouver. Ici :
//
//  · l'état « installée » est atteint en CLIQUANT sur « Mettre à jour » et en
//    laissant la boucle de surveillance de l'écran conclure elle-même ;
//  · `installable: false` vient de la RÉPONSE du serveur, l'écran en tire ce
//    qu'il veut ;
//  · la confirmation est observée dans le bus `dialogs` — le témoin ne fait que
//    RÉPONDRE, comme le ferait `DialogContainer` sous le doigt d'un humain.
//
// ## Ce que ce témoin NE verrait PAS, et pourquoi c'est assumé
//
//  · Que le serveur exécute vraiment `/system/restart` : l'API est bouchonnée.
//    Ce qui est tenu ici, c'est que l'ÉCRAN appelle le bon geste, au bon
//    moment, et pas avant d'avoir demandé.
//  · Le rendu (CSS, position du bouton) : `check-classes-css` tient la
//    présence des sélecteurs, pas ce test.
//  · Le cas `dmg_ready`, tenu ailleurs — il est ici couvert par ricochet
//    (le bouton d'installation ne doit plus être offert), sans plus.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

const installUpdate = vi.fn();
const getUpdateStatus = vi.fn();
const getHealth = vi.fn();
const restartServer = vi.fn();
const stopServer = vi.fn();
/** Ce que `/system/update/check` rend — chaque cas le remplace. */
let reponseCheck: Record<string, unknown> = {};

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    apiFetch: vi.fn(async (chemin: string) =>
      chemin === '/system/update/check' ? reponseCheck : ({} as any),
    ),
    installUpdate: (...a: unknown[]) => installUpdate(...a),
    getUpdateStatus: () => getUpdateStatus(),
    getHealth: () => getHealth(),
    restartServer: () => restartServer(),
    stopServer: () => stopServer(),
    getStats: vi.fn(async () => ({})),
    getConfig: vi.fn(async () => ({ music_dirs: [] })),
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    listServiceTokens: vi.fn(async () => []),
  };
});

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { dialogs } from '../stores/dialogs';
import { get } from 'svelte/store';
import lFr from '../locales/fr';
const fr = lFr as unknown as Record<string, string>;

const texte = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let locationOrigine: PropertyDescriptor | undefined;

function poserLocationTemoin() {
  locationOrigine = Object.getOwnPropertyDescriptor(window, 'location');
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href: 'http://tune.test/', origin: 'http://tune.test', reload: vi.fn() },
  });
}

async function tourner(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  flushSync();
}

async function monterEcran(niveau: 'beginner' | 'intermediate' | 'expert'): Promise<HTMLDivElement> {
  preferences.update((p) => ({ ...p, settingsLevel: niveau }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await tourner(0);
  await tourner(0);
  return hote;
}

/** L'écran ne rend que l'onglet actif : on l'ouvre comme un humain. */
function ouvrirSysteme(el: HTMLElement) {
  const onglet = [...el.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabSystem'],
  );
  expect(onglet, 'onglet Système introuvable à l’écran').toBeDefined();
  (onglet as HTMLButtonElement).click();
  flushSync();
}

function chercherBouton(el: HTMLElement, libelle: string): HTMLButtonElement | undefined {
  return [...el.querySelectorAll('button')].find(
    (x) => (x.textContent ?? '').trim() === libelle,
  ) as HTMLButtonElement | undefined;
}

function bouton(el: HTMLElement, libelle: string, pourquoi: string): HTMLButtonElement {
  const b = chercherBouton(el, libelle);
  expect(b, pourquoi).toBeDefined();
  return b as HTMLButtonElement;
}

/** La confirmation EN ATTENTE, telle que l'écran l'a demandée. */
function confirmationEnAttente() {
  return get(dialogs)[0];
}

/** Répondre à la confirmation comme le ferait `DialogContainer`. */
async function repondre(ok: boolean) {
  const d = confirmationEnAttente();
  expect(d, 'aucune confirmation n’est en attente : il n’y a rien à répondre.').toBeDefined();
  dialogs.settle(d.id, ok);
  await tourner(0);
}

/**
 * Conduit l'écran jusqu'à l'instant EXACT où l'installation vient d'aboutir :
 * clic sur « Mettre à jour », serveur qui tombe, serveur qui revient sur une
 * version neuve. C'est l'ÉCRAN qui décide qu'il a fini, pas le témoin.
 */
async function installerJusquAuBout(el: HTMLElement) {
  bouton(
    el,
    fr['settings.updateButton'],
    'le bouton « Mettre à jour » n’est pas à l’écran : le témoin ne peut rien prouver.',
  ).click();
  await tourner(0);
  await tourner(3000); // 1er /update/status : injoignable → « vu hors service »
  await tourner(3000); // 2e : la version a bougé → l'écran conclut
  expect(
    texte(el),
    'l’écran n’a pas atteint l’état « installée » : le témoin mesurerait autre chose.',
  ).toContain(fr['settings.updateDoneReloading']);
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  poserLocationTemoin();
  vi.useFakeTimers();
  for (const f of [installUpdate, getUpdateStatus, getHealth, restartServer, stopServer]) f.mockReset();
  installUpdate.mockResolvedValue({ ok: true });
  restartServer.mockResolvedValue({ ok: true });
  stopServer.mockRejectedValue(new Error('Failed to fetch')); // le serveur meurt
  // Le serveur ne revient pas de lui-même : sans ça l'écran rechargerait et on
  // ne verrait jamais ce qu'il PROPOSE après l'installation.
  getHealth.mockRejectedValue(new Error('serveur à terre'));
  reponseCheck = { current: '0.9.146', latest: '0.9.147', update_available: true, installable: true };
});

afterEach(() => {
  for (const r of get(dialogs)) dialogs.settle(r.id, false);
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (locationOrigine) Object.defineProperty(window, 'location', locationOrigine);
});

describe('après l’installation, l’écran offre « Redémarrer le serveur »', () => {
  it('🔴 le bouton est là, et il DEMANDE avant de redémarrer', async () => {
    getUpdateStatus
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValue({ current_version: '0.9.147', update_in_progress: false });
    const el = await monterEcran('beginner');
    ouvrirSysteme(el);
    await installerJusquAuBout(el);

    expect(
      texte(el),
      'l’écran ne dit pas que la mise à jour est INSTALLÉE : la coquille actuelle, elle, le dit.',
    ).toContain(fr['settings.installed']);

    const b = bouton(
      el,
      fr['settings.restartServer'],
      'la mise à jour est installée et l’écran n’offre PAS « Redémarrer le serveur » : ' +
        'si le serveur ne se relève pas seul, l’utilisateur n’a plus aucun geste. ' +
        'C’est exactement ce que Bertrand redemande pour la troisième fois.',
    );

    b.click();
    await tourner(0);
    expect(
      restartServer,
      'le serveur a été redémarré SANS confirmation : le geste part au premier clic.',
    ).not.toHaveBeenCalled();

    await repondre(true);
    expect(
      restartServer,
      'confirmation acceptée et aucun redémarrage demandé : le bouton ne fait rien.',
    ).toHaveBeenCalledTimes(1);
    expect(
      texte(el),
      'le bouton n’affiche pas son état d’attente : l’utilisateur reclique dans le vide.',
    ).toContain(fr['settings.restarting']);
  });
});

describe('installation depuis les sources : l’écran le DIT et ne promet rien', () => {
  beforeEach(() => {
    reponseCheck = {
      current: '0.9.146',
      latest: '0.9.147',
      update_available: true,
      installable: false,
      install_hint: 'git pull && cargo build --release',
    };
  });

  it('🔴 l’écran annonce l’installation depuis les sources', async () => {
    const el = await monterEcran('beginner');
    ouvrirSysteme(el);
    expect(
      texte(el),
      'le serveur dit qu’il ne peut PAS s’installer lui-même et l’écran n’en dit rien.',
    ).toContain(fr['settings.sourceInstallNote']);
  });

  it('🔴 et il n’offre PAS le bouton d’installation', async () => {
    const el = await monterEcran('beginner');
    ouvrirSysteme(el);
    expect(
      chercherBouton(el, fr['settings.updateButton']),
      'l’écran offre « Mettre à jour » sur un serveur qui ne peut pas s’installer : ' +
        'il promet un geste que le serveur refusera.',
    ).toBeUndefined();
  });

  it('🔴 le conseil du serveur (`install_hint`) est affiché', async () => {
    const el = await monterEcran('beginner');
    ouvrirSysteme(el);
    expect(
      texte(el),
      'le serveur dit QUOI FAIRE et l’écran jette la phrase : l’utilisateur est à quai.',
    ).toContain('git pull && cargo build --release');
  });
});

describe('Réglages → Système : les deux gestes de service, en permanence', () => {
  it('🔴 « Arrêter le serveur » ne fait RIEN tant que la confirmation n’est pas acceptée', async () => {
    const el = await monterEcran('intermediate');
    ouvrirSysteme(el);
    const b = bouton(
      el,
      fr['settings.stopServer'],
      'aucun bouton « Arrêter le serveur » dans l’onglet Système du nouvel écran.',
    );

    b.click();
    await tourner(0);
    expect(
      stopServer,
      '⛔ le serveur est ARRÊTÉ au premier clic, sans confirmation. Le geste est ' +
        'irréversible côté utilisateur : il faut un accès physique à la machine.',
    ).not.toHaveBeenCalled();

    const demande = confirmationEnAttente();
    expect(demande, 'aucune confirmation demandée : le clic arrête ou ne fait rien.').toBeDefined();
    expect(
      demande.message,
      'la confirmation n’avertit pas de ce qui va se passer.',
    ).toBe(fr['settings.stopServerConfirm']);
    expect(
      demande.danger,
      'la confirmation n’est pas marquée « danger » : elle se valide comme une autre.',
    ).toBe(true);

    // L'utilisateur renonce.
    await repondre(false);
    expect(
      stopServer,
      '⛔ confirmation REFUSÉE et le serveur est arrêté quand même.',
    ).not.toHaveBeenCalled();
    expect(
      texte(el),
      'l’écran est parti en « Arrêt… » alors que l’utilisateur a renoncé.',
    ).not.toContain(fr['settings.stoppingServer']);
  });

  it('🔴 confirmation acceptée : l’arrêt part, et l’écran ne repropose pas le geste', async () => {
    const el = await monterEcran('intermediate');
    ouvrirSysteme(el);
    bouton(el, fr['settings.stopServer'], 'bouton d’arrêt absent').click();
    await tourner(0);
    await repondre(true);
    expect(
      stopServer,
      'confirmation acceptée et aucun arrêt demandé : le bouton ne fait rien.',
    ).toHaveBeenCalledTimes(1);
    expect(
      texte(el),
      'le bouton reproposerait « Arrêter le serveur » sur un serveur mort.',
    ).toContain(fr['settings.stoppingServer']);
  });

  it('🔴 « Redémarrer le serveur » est offert hors de toute mise à jour', async () => {
    // Serveur à jour : aucun bloc de mise à jour, donc le geste ne peut venir
    // que de l'onglet Système lui-même.
    reponseCheck = { current: '0.9.147', latest: '0.9.147', update_available: false };
    const el = await monterEcran('intermediate');
    ouvrirSysteme(el);
    const b = bouton(
      el,
      fr['settings.restartServer'],
      'le serveur est à jour et le nouvel écran n’offre AUCUN moyen de le redémarrer : ' +
        'le geste n’existait que dans la coquille actuelle.',
    );
    b.click();
    await tourner(0);
    expect(
      restartServer,
      'redémarrage lancé sans confirmation.',
    ).not.toHaveBeenCalled();
    await repondre(true);
    expect(
      restartServer,
      'confirmation acceptée et aucun redémarrage demandé.',
    ).toHaveBeenCalledTimes(1);
  });
});
