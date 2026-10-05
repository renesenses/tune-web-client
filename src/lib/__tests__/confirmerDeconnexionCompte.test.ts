// @vitest-environment jsdom
//
// Se déconnecter du compte mozaiklabs DÉLIE ce serveur du compte : côté
// serveur (`POST /cloud/sso/disconnect`), la copie de bibliothèque en ligne et
// les partages Tune Circle sont effacés, le premium du compte tombe. Les deux
// boutons « Se déconnecter » — menu de l'avatar et Réglages › Système › Cloud
// — partaient au premier clic, sans rien demander.
//
// Ces témoins MONTENT les deux écrans, cliquent, et lisent ce qui part : rien
// tant que la confirmation n'est pas donnée, la déconnexion ensuite.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AvatarMenu from '../../components/v2/AvatarMenu.svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { dialogs } from '../stores/dialogs';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 30_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let parties: { url: string; method: string }[] = [];

const souffler = async (n = 8) => {
  for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
};

beforeEach(() => {
  locale.set('fr');
  parties = [];
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    parties.push({ url, method });
    let charge: unknown = {};
    if (url.includes('/cloud/sso/status')) {
      charge = { configured: true, connected: true, user: { display_name: 'Testeur', email: 't@example.org' } };
    } else if (url.includes('/cloud/sso/disconnect')) charge = { connected: false };
    else if (url.includes('/zones') || url.includes('/devices') || url.includes('/profiles')) charge = [];
    return {
      ok: true, status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge),
      json: async () => charge,
    } as unknown as Response;
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  v2SettingsTarget.set(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const deconnexions = () => parties.filter((p) => p.url.includes('/cloud/sso/disconnect'));

async function boutonAvatar(): Promise<HTMLButtonElement> {
  monte = mount(AvatarMenu, { target: hote! });
  await souffler();
  hote!.querySelector<HTMLButtonElement>('button.avatar')!.click();
  await souffler();
  const libelle = dictionnaire('fr')['settings.signOut'];
  const b = [...hote!.querySelectorAll<HTMLButtonElement>('button.item')].find((x) => x.textContent?.includes(libelle));
  expect(b, 'le bouton « Se déconnecter » du menu de l’avatar').toBeTruthy();
  return b!;
}

async function boutonReglages(): Promise<HTMLButtonElement> {
  v2SettingsTarget.set({ tab: 'system', section: 'cloud' });
  monte = mount(SettingsV2, { target: hote!, props: {} });
  await souffler(12);
  const b = hote!.querySelector<HTMLButtonElement>('[data-sso="compte"] button.lnk');
  expect(b, 'le bouton « Se déconnecter » de Réglages › Cloud').toBeTruthy();
  expect(b!.textContent).toContain(dictionnaire('fr')['settings.signOut']);
  return b!;
}

describe('Se déconnecter du compte demande une confirmation', () => {
  for (const [nom, bouton] of [['menu de l’avatar', boutonAvatar], ['Réglages › Cloud', boutonReglages]] as const) {
    it(`🔴 ${nom} : refusée, rien ne part`, async () => {
      const question = vi.spyOn(dialogs, 'confirm').mockResolvedValue(false);
      (await bouton()).click();
      await souffler();
      expect(question).toHaveBeenCalledTimes(1);
      expect(question.mock.calls[0][0]).toBe(dictionnaire('fr')['settings.signOutConfirm']);
      expect(question.mock.calls[0][1]).toEqual({ danger: true });
      expect(deconnexions()).toEqual([]);
    });

    it(`${nom} : confirmée, la déconnexion part une fois`, async () => {
      vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
      (await bouton()).click();
      await souffler();
      expect(deconnexions()).toHaveLength(1);
      expect(deconnexions()[0].method).toBe('POST');
    });
  }
});

describe('la question dit ce qui sera déconnecté, dans les onze langues', () => {
  it.each(ONZE_LANGUES)('%s', (code) => {
    const texte = dictionnaire(code)['settings.signOutConfirm'];
    expect(texte, `${code} : libellé manquant`).toBeTruthy();
    expect(texte).toContain('mozaiklabs');
    expect(texte).toContain('Tune Circle');
    if (code !== 'en') expect(texte).not.toBe(dictionnaire('en')['settings.signOutConfirm']);
  });
});
