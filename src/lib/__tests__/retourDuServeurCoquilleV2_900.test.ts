// @vitest-environment jsdom
//
// 🔴 `renesenses/tune-web-client#900` — LA COQUILLE QUI MANQUAIT.
//
// Lulu, forum, 04/09/2026 :
//
//   « À chaque mise à jour, le fichier reste bloqué sur la page "Tune
//     Redémarre", et nécessite alors la fermeture de toutes les pages, et une
//     réouverture de Tune. »
//
// ## Pourquoi ce fichier existe À CÔTÉ de `retourDuServeur900.test.ts`
//
// `eac1988` a durci la coquille ACTUELLE (`SettingsView`) et sorti l'attente
// dans `lib/retourDuServeur`, module pur, tenu par `retourDuServeur900.test.ts`.
// Ce garde-là est bon — et il ne dit RIEN de la coquille qui tourne chez
// l'utilisateur aujourd'hui.
//
// `main.ts:16` monte `ShellV2` OU `App.svelte`, jamais les deux. Sous `ShellV2`,
// la mise à jour s'installe depuis `v2/SettingsV2.svelte`, et cet écran-là
// rechargeait encore sur `setTimeout(…, 1500)` sans rien vérifier, avec une
// sortie de boucle MUETTE. Le module partagé était vert, et le défaut de Lulu
// intact dans la coquille qu'on montre.
//
// 🔴 CE TÉMOIN NE REGARDE PAS `lib/retourDuServeur`. Il MONTE `SettingsV2`,
// ouvre l'onglet Système, CLIQUE sur « Mettre à jour » et lit ce que l'écran
// fait pendant que le serveur ne revient pas. Un témoin écrit contre le module
// partagé serait vert des DEUX côtés sans rien prouver de celui-ci.
//
// ## Ce que chaque cas tomberait à prouver, et ce qui le ferait rougir
//
//  1. « on ne recharge pas dans le vide » — rouge si l'écran réarme un
//     rechargement sur minuterie (le code d'avant : `setTimeout(reload, 1500)`),
//     ou si la sonde est remplacée par quelque chose qui réussit toujours ;
//  2. « le renoncement PARLE » — rouge si `renoncer` redevient un vide ;
//  3. « la sortie de boucle PARLE » — rouge si la ligne qui parle est retirée
//     et que l'écran retombe sur le bouton sans un mot.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

const installUpdate = vi.fn();
const getUpdateStatus = vi.fn();
const getHealth = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    // `/system/update/check` est ce qui fait APPARAÎTRE le bouton : tout le bloc
    // vit sous `updateInfo?.update_available`. Le serveur répond `current` /
    // `latest` — voir `lib/miseAJour`, qui normalise.
    apiFetch: vi.fn(async (chemin: string) =>
      chemin === '/system/update/check'
        ? { current: '0.9.146', latest: '0.9.147', update_available: true }
        : ({} as any),
    ),
    installUpdate: (...a: unknown[]) => installUpdate(...a),
    getUpdateStatus: () => getUpdateStatus(),
    getHealth: () => getHealth(),
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

/** Ce que l'écran affiche aujourd'hui, phrases comprises. */
const texte = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let recharger: ReturnType<typeof vi.fn>;
let locationOrigine: PropertyDescriptor | undefined;

/**
 * `window.location.reload()` navigue vraiment dans jsdom. On remplace l'objet
 * — il est `configurable` ici, mesuré — par un témoin, et on le remet après.
 */
function poserLocationTemoin() {
  locationOrigine = Object.getOwnPropertyDescriptor(window, 'location');
  recharger = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href: 'http://tune.test/', origin: 'http://tune.test', reload: recharger },
  });
}

async function tourner(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  flushSync();
}

async function monterEcran(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  // Les effets de montage interrogent le serveur : on les laisse se poser.
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

function boutonMaj(el: HTMLElement): HTMLButtonElement {
  const b = [...el.querySelectorAll('button')].find(
    (x) => (x.textContent ?? '').trim() === fr['settings.updateButton'],
  );
  expect(
    b,
    'le bouton « Mettre à jour » n’est pas à l’écran : le témoin ne peut rien prouver.',
  ).toBeDefined();
  return b as HTMLButtonElement;
}

/**
 * Conduit l'écran jusqu'à l'instant EXACT du défaut : l'installation est
 * acceptée, le serveur est tombé, il est revenu sur une version neuve, et
 * l'écran vient d'afficher « Mise à jour installée — rechargement… ».
 *
 * C'est à partir d'ici que l'ancien code armait son `setTimeout(…, 1500)`.
 */
async function conduireJusquAuRedemarrage(el: HTMLElement) {
  boutonMaj(el).click();
  await tourner(0);
  // Boucle de surveillance : un tour toutes les 3 s.
  await tourner(3000); // 1er /update/status : injoignable → « vu hors service »
  await tourner(3000); // 2e : la version a bougé → on est dans la branche
  expect(
    texte(el),
    'l’écran n’a pas atteint « Mise à jour installée » : le témoin mesurerait autre chose.',
  ).toContain(fr['settings.updateDoneReloading']);
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  poserLocationTemoin();
  vi.useFakeTimers();
  installUpdate.mockReset();
  installUpdate.mockResolvedValue({ ok: true });
  getUpdateStatus.mockReset();
  getHealth.mockReset();
  // L'écran interroge déjà `/system/health` à son montage : sans réponse, il
  // affiche simplement l'état inconnu. Ce n'est pas la sonde qu'on mesure.
  getHealth.mockRejectedValue(new Error('serveur à terre'));
  preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
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

describe('#900 — la coquille v2 n’attend plus le retour du serveur à l’aveugle', () => {
  it('🔴 serveur encore à terre à 1 500 ms : l’écran NE recharge PAS', async () => {
    // Le serveur retombe puis revient sur la version neuve.
    getUpdateStatus
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValue({ current_version: '0.9.147', update_in_progress: false });

    const el = await monterEcran();
    ouvrirSysteme(el);
    await conduireJusquAuRedemarrage(el);

    // Le serveur se ré-exécute une seconde fois — c'est ce que fait la mise à
    // jour automatique — et ne répond toujours pas.
    const sondesAvant = getHealth.mock.calls.length;
    await tourner(1600);

    expect(
      recharger,
      'l’écran a rechargé alors que le serveur ne répond pas : c’est la page morte de Lulu.',
    ).not.toHaveBeenCalled();
    expect(
      getHealth.mock.calls.length,
      'aucune sonde de santé n’est partie : l’écran attend sans rien vérifier, ' +
        'il rechargera donc tout aussi à l’aveugle, juste plus tard.',
    ).toBeGreaterThan(sondesAvant);

    // Le serveur revient. Le rechargement doit suivre, et une seule fois.
    getHealth.mockResolvedValue({ status: 'ok' });
    await tourner(1400);
    expect(
      recharger,
      'le serveur est revenu et l’écran ne recharge pas : l’utilisateur reste ' +
        'sur « Tune redémarre » pour toujours.',
    ).toHaveBeenCalledTimes(1);
  });

  it('🔴 le serveur ne revient jamais : l’écran le DIT, et ne recharge pas', async () => {
    getUpdateStatus
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValue({ current_version: '0.9.147', update_in_progress: false });

    const el = await monterEcran();
    ouvrirSysteme(el);
    await conduireJusquAuRedemarrage(el);

    // `BUDGET_RETOUR_MS` vaut 90 s ; on va au-delà, serveur muet du début à la fin.
    await tourner(95_000);

    expect(
      recharger,
      'on recharge quand même sur un serveur absent : écran mort.',
    ).not.toHaveBeenCalled();
    expect(
      texte(el),
      'l’écran renonce EN SILENCE : il retombe sur « rechargement… » ou sur rien, ' +
        'et l’utilisateur ne sait ni ce qui s’est passé, ni quoi faire.',
    ).toContain(fr['settings.updateReloadGaveUp']);
  });

  it('🔴 la mise à jour ne se conclut pas : la sortie de boucle n’est plus MUETTE', async () => {
    // Le serveur répond toujours, la version ne bouge jamais, il ne tombe
    // jamais : aucune des deux détections ne se déclenche et le budget de trois
    // minutes s'épuise. C'est le chemin où l'écran ne disait RIEN.
    getUpdateStatus.mockResolvedValue({
      current_version: '0.9.146',
      update_in_progress: true,
    });

    const el = await monterEcran();
    ouvrirSysteme(el);
    boutonMaj(el).click();
    await tourner(0);
    await tourner(185_000); // budget = 180 000 ms

    expect(
      texte(el),
      'budget épuisé et l’écran se tait : le bouton redevient cliquable sans un mot ' +
        'sur ce qui vient de se passer.',
    ).toContain(fr['settings.updateStatusUnknown']);
    expect(
      recharger,
      'rien ne dit que la mise à jour a eu lieu, et l’écran recharge quand même.',
    ).not.toHaveBeenCalled();
  });
});
