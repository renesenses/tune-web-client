// @vitest-environment jsdom
//
// Homebrew — « la mise à jour via l'interface ne marche pas » (Yves Corbat,
// macOS, installation Homebrew).
//
// Ce que le serveur faisait déjà, et bien : depuis la v0.9.114 (#2448) il
// REFUSE de remplacer le binaire d'un Cellar Homebrew, parce qu'il laisserait
// derrière lui l'interface web que Homebrew y a posée — c'est ainsi que ce même
// testeur s'est retrouvé avec un serveur 0.9.110 piloté par une interface
// 0.9.71, trente-neuf versions d'écart, sans un mot.
//
// Ce que le CLIENT en faisait : rien. Le refus voyageait dans un 200, les deux
// interfaces ne testaient que `res.ok === false` et `res.status === 'docker'`,
// donc aucune branche ne se déclenchait et l'écran entrait dans 180 s d'attente
// d'un redémarrage qui n'arriverait jamais : bouton « Installation… » figé
// trois minutes, puis retour muet. `reason`, `command`,
// `installation_version_mismatch` étaient JETÉS.
//
// 🔴 CES TÉMOINS MONTENT L'ÉCRAN ET LISENT LE DOM. Vérifier qu'une fonction a
// été appelée ne prouverait pas que l'utilisateur voit la commande à taper.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { locale, t } from '../i18n';
import { get } from 'svelte/store';
import fr from '../locales/fr';
import en from '../locales/en';
import { settingsInitialTab } from '../stores/navigation';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { preferences } from '../stores/preferences';
import { dictionnaire } from './onzeDictionnaires';

/** La commande que le serveur donne. C'est L'information utile. */
const COMMANDE = 'brew update && brew upgrade tune-server';

/** Le refus, mot pour mot ce que rend `homebrew_update_refusal`
 *  (`tune-server/src/routes/system/update.rs`) en 409, sur une machine où Tune
 *  ne peut PAS conduire `brew` lui-même. */
const REFUS_HOMEBREW = {
  status: 'managed_installation',
  reason: 'homebrew_managed_installation',
  manager: 'homebrew',
  message: 'This Tune installation is managed by Homebrew. Update it with `brew update && brew upgrade tune-server`.',
  detail: 'This Tune installation is managed by Homebrew.',
  command: COMMANDE,
  installation_version: '0.9.71',
  current_version: '0.9.110',
  installation_version_mismatch: true,
  upgrade_in_place_blocked_reason: 'homebrew_brew_missing',
  upgrade_in_place_detail: 'No executable brew at /opt/homebrew/bin/brew.',
};

/** Une installation autonome : le chemin nominal, qui télécharge. */
const INSTALL_NORMALE = { status: 'downloading', version: '0.9.144' };

/** Ce que `GET /system/update/check` rend quand une version existe. */
const MAJ_DISPONIBLE = {
  current_version: '0.9.110',
  current: '0.9.110',
  latest_version: '0.9.144',
  latest: '0.9.144',
  update_available: true,
};

let reponseInstall: unknown = REFUS_HOMEBREW;
let httpInstall = 409;

function corps(url: string): unknown {
  if (url.includes('/system/update/check')) return MAJ_DISPONIBLE;
  if (url.includes('/system/update/status')) {
    return { phase: null, current_version: '0.9.110', homebrew_upgrade: null };
  }
  if (url.includes('/system/version')) return { version: '0.9.110' };
  if (url.includes('/system/health')) return { status: 'ok', current_version: '0.9.110' };
  if (url.includes('/zones')) return [];
  if (url.includes('/devices')) return [];
  return {};
}

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));

async function souffler(n = 6) {
  for (let i = 0; i < n; i++) {
    await respirer();
    flushSync();
  }
}

const texte = () => (hote?.textContent ?? '').replace(/\s+/g, ' ').trim();

beforeEach(() => {
  reponseInstall = REFUS_HOMEBREW;
  httpInstall = 409;
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('IntersectionObserver', ResizeObserverInerte);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const estInstall = url.includes('/system/update/install');
      const charge = estInstall ? reponseInstall : corps(url);
      const code = estInstall ? httpInstall : 200;
      void init;
      return {
        ok: code >= 200 && code < 300,
        status: code,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        text: async () => JSON.stringify(charge),
        json: async () => charge,
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

/** Le bouton de mise à jour de l'écran monté, quelle que soit l'interface. */
function boutonMaj(): HTMLButtonElement {
  const boutons = Array.from(hote!.querySelectorAll('button')) as HTMLButtonElement[];
  const libelles = [get(t)('settings.updateButton'), get(t)('settings.install')];
  const b = boutons.find((x) => libelles.includes((x.textContent ?? '').trim()));
  expect(
    b,
    `bouton de mise à jour introuvable. Boutons présents : ${boutons
      .map((x) => JSON.stringify((x.textContent ?? '').trim()))
      .join(', ')}`,
  ).toBeTruthy();
  return b!;
}


describe('les onze langues portent les sept clés', () => {
  it('aucune langue ne retombe sur la clé', async () => {
    const langues = ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu'];
    const cles = [
      'settings.homebrewManaged',
      'settings.homebrewMismatch',
      'settings.homebrewCannotSelfUpdate',
      'settings.homebrewUpdating',
      'settings.homebrewUpgrading',
      'settings.homebrewRestarting',
      'settings.homebrewFailed',
    ];
    for (const l of langues) {
      const dico = dictionnaire(l);
      for (const c of cles) {
        expect(dico[c], `${l} : clé ${c} absente`).toBeTruthy();
        expect(dico[c], `${l} : clé ${c} vide`).not.toBe('');
      }
    }
    // Les deux clés à paramètre doivent GARDER leurs marqueurs, sinon la
    // substitution ne remplace rien et la phrase perd son information.
    for (const l of langues) {
      const dico = dictionnaire(l);
      expect(dico['settings.homebrewMismatch'], `${l} : {binaire} perdu`).toContain('{binaire}');
      expect(dico['settings.homebrewMismatch'], `${l} : {cellar} perdu`).toContain('{cellar}');
      expect(dico['settings.homebrewCannotSelfUpdate'], `${l} : {detail} perdu`).toContain(
        '{detail}',
      );
      expect(dico['settings.homebrewFailed'], `${l} : {etape} perdu`).toContain('{etape}');
    }
  });
});
