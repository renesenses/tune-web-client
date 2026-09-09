// @vitest-environment jsdom
//
// Greffons — renesenses/tune-server-rust#3662 : la bannière « redémarrage
// nécessaire » s'affichait APRÈS CHAQUE bascule, sans jamais demander au
// serveur si c'en était un.
//
// Les deux bouts, relevés sur `batch/bugs-9` (3e896a0f) et sur
// `tune-web-client` @ c69b8654 :
//
//   • `POST /plugins/{name}/enable` et `/disable`
//     (`tune-server/src/routes/plugins.rs:538-556`) rendent
//     `{name, enabled, restart_required}`. `restart_required` n'est pas une
//     constante : il compare l'état DEMANDÉ à ce qui tourne réellement.
//     Réactiver un greffon déjà chargé, ou désactiver un greffon jamais
//     chargé, ne coupe rien.
//   • `api.ts` déclarait `Promise<{status: string}>` — un champ que le serveur
//     ne rend pas, et surtout un type qui rendait `restart_required`
//     ILLISIBLE pour un appelant typé. `PluginsView.handleToggle` posait donc
//     `showRestartBanner = true` sans condition.
//
// 🔴 CES TÉMOINS APPELLENT, ILS NE LISENT PAS. On monte la vraie vue, on stube
// `fetch` avec la charge utile LITTÉRALE du serveur, on clique sur la bascule,
// et on regarde si la bannière est dans le DOM.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PluginsView from '../../components/PluginsView.svelte';

/** Ce que `GET /plugins` rend pour un greffon installé et actif. */
const GREFFON_ACTIF = {
  name: 'bandcamp',
  display_name: 'Bandcamp',
  description: 'Bandcamp connector',
  version: '1.0.0',
  category: 'streaming',
  compatible: true,
  installed: true,
  enabled: true,
  update_available: false,
  status: 'active',
};

/** Ce que rend `disable_plugin` quand le greffon n'est PAS chargé dans le
 *  processus : rien ne s'arrête, donc rien à redémarrer. */
const BASCULE_SANS_REDEMARRAGE = {
  name: 'bandcamp',
  enabled: false,
  restart_required: false,
};

/** Et quand il l'est : couper la musique se justifie. */
const BASCULE_AVEC_REDEMARRAGE = {
  name: 'bandcamp',
  enabled: false,
  restart_required: true,
};

let reponseDeBascule: unknown = BASCULE_SANS_REDEMARRAGE;

function corpsPour(url: string): unknown {
  if (url.includes('/plugins/bandcamp/disable')) return reponseDeBascule;
  if (url.includes('/plugins/bandcamp/enable')) return reponseDeBascule;
  if (url.includes('/marketplace/plugins')) return { plugins: [], count: 0 };
  if (/\/plugins(\?|$)/.test(url)) return [GREFFON_ACTIF];
  return {};
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));

async function poserLaVue(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PluginsView, { target: hote, props: {} });
  flushSync();
  // `fetchPlugins()` part au montage : deux requêtes en parallèle.
  await respirer();
  await respirer();
  flushSync();
  return hote;
}

/** La bascule Activer/Désactiver du greffon. */
function bascule(el: HTMLElement): HTMLButtonElement {
  const b = el.querySelector('button.btn-toggle') as HTMLButtonElement;
  expect(b, 'la bascule Activer/Désactiver a disparu de la vue Greffons').not.toBeNull();
  return b;
}

const banniereAffichee = (el: HTMLElement) => el.querySelector('.restart-banner') !== null;

async function basculer(el: HTMLElement) {
  bascule(el).click();
  await respirer();
  await respirer();
  flushSync();
}

/** jsdom n'a pas `ResizeObserver` ; la vue en pose un pour mesurer son
 *  en-tête figé. Inerte : rien de ce qui est testé ici n'en dépend. */
class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  reponseDeBascule = BASCULE_SANS_REDEMARRAGE;
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        text: async () => JSON.stringify(corpsPour(url)),
        json: async () => corpsPour(url),
      } as unknown as Response;
    }),
  );
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('#3662 — la bannière de redémarrage suit le serveur', () => {
  it("ne s'affiche pas quand le serveur dit qu'aucun redémarrage n'est nécessaire", async () => {
    const el = await poserLaVue();
    expect(banniereAffichee(el), 'la bannière ne doit pas être là avant la bascule').toBe(false);

    await basculer(el);

    expect(
      banniereAffichee(el),
      "restart_required=false : annoncer un redémarrage envoie couper la musique pour rien",
    ).toBe(false);
  });

  // Contre-épreuve : le témoin doit aussi savoir dire OUI, sans quoi il
  // passerait au vert sur une vue qui n'affiche plus jamais la bannière.
  it("s'affiche quand le serveur dit qu'un redémarrage est nécessaire", async () => {
    reponseDeBascule = BASCULE_AVEC_REDEMARRAGE;
    const el = await poserLaVue();

    await basculer(el);

    expect(
      banniereAffichee(el),
      'restart_required=true : la bannière est la seule chose qui prévient le testeur',
    ).toBe(true);
  });
});
