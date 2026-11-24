// @vitest-environment jsdom
//
// rc14 — constat de Bertrand en recette rc13.2 (le .18, depuis son Mac,
// authentification coupée) : dans le menu de l'avatar, « Se déconnecter »
// se laissait cliquer, puis le refus du serveur s'affichait DEUX fois (toast
// de `fetchJSON` + toast de l'écran par `notifierErreur`), en un long texte
// technique (docker logs, journalctl, SSH) qui ne disait pas que c'était la
// déliaison du compte qui était refusée.
//
// L'entrée appelle `POST /cloud/sso/disconnect`, qui DÉLIE le serveur du
// compte : elle s'appelle désormais « Délier le compte mozaiklabs.fr », elle
// est grisée avec sa note quand la déliaison sera refusée d'ici, et un refus
// qui passerait malgré tout s'affiche UNE fois, en une phrase courte.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AvatarMenu from '../../components/v2/AvatarMenu.svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { dialogs } from '../stores/dialogs';
import { notifications } from '../stores/notifications';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { notifierErreur } from '../notifierErreur';
import { cleNoteDeliaison, refusDeliaisonIci } from '../deliaisonCompte';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 30_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const fr = dictionnaire('fr');
const REFUS_HORS_MACHINE = {
  error: 'auth_required',
  reason: 'not_local',
  message: 'This action requires authentication to be enabled, or a call from this machine (localhost).',
};

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let parties: { url: string; method: string }[] = [];
/** Ce que rend `GET /auth/activation` ; `null` : 404 (serveur ancien). */
let activation: unknown = null;
/** Ce que rend `POST /cloud/sso/disconnect`. */
let deliaison: { status: number; corps: unknown } = { status: 200, corps: { connected: false } };
/** Ce que rend `GET /system/config` (`appliance` : Tune OS). */
let config: unknown = {};

const souffler = async (n = 8) => {
  for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
};

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: '',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: async () => JSON.stringify(corps),
    json: async () => corps,
    clone() { return this; },
  } as unknown as Response;
}

beforeEach(() => {
  locale.set('fr');
  parties = [];
  activation = null;
  deliaison = { status: 200, corps: { connected: false } };
  config = {};
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    parties.push({ url, method });
    if (url.includes('/cloud/sso/status')) {
      return reponse(200, { configured: true, connected: true, user: { display_name: 'Bertrand', email: 'b@example.org' } });
    }
    if (url.includes('/auth/activation')) return activation === null ? reponse(404, { error: 'not_found' }) : reponse(200, activation);
    if (url.includes('/cloud/sso/disconnect')) return reponse(deliaison.status, deliaison.corps);
    if (url.includes('/system/config')) return reponse(200, config);
    return reponse(200, []);
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

const deliaisons = () => parties.filter((p) => p.url.includes('/cloud/sso/disconnect'));

async function entree(): Promise<HTMLButtonElement> {
  monte = mount(AvatarMenu, { target: hote! });
  await souffler();
  hote!.querySelector<HTMLButtonElement>('button.avatar')!.click();
  await souffler();
  const b = [...hote!.querySelectorAll<HTMLButtonElement>('button.item')]
    .find((x) => x.textContent?.includes(fr['settings.unlinkAccount']));
  expect(b, 'l’entrée « Délier le compte mozaiklabs.fr » du menu de l’avatar').toBeTruthy();
  return b!;
}

describe('menu de l’avatar : l’entrée dit ce qu’elle fait', () => {
  it('🔴 elle s’appelle « Délier le compte mozaiklabs.fr », plus « Se déconnecter »', () => {
    expect(fr['settings.unlinkAccount']).toBe('Délier le compte mozaiklabs.fr');
    // « Se déconnecter » reste le geste des services (Qobuz, TIDAL…) : seul le
    // compte mozaiklabs.fr change de libellé.
    expect(fr['settings.signOut']).toBe('Se déconnecter');
  });

  it('elle délie le serveur : un seul POST /cloud/sso/disconnect après confirmation', async () => {
    activation = { auth_enabled: false, from_this_machine: true, code_required: false };
    vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
    const b = await entree();
    expect(b.disabled).toBe(false);
    b.click();
    await souffler();
    expect(deliaisons()).toEqual([expect.objectContaining({ method: 'POST' })]);
  });
});

describe('menu de l’avatar : grisée quand la déliaison sera refusée d’ici', () => {
  it('🔴 authentification coupée, autre appareil : grisée, avec la note, et rien ne part', async () => {
    activation = { auth_enabled: false, from_this_machine: false, code_required: true };
    const question = vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
    const b = await entree();
    expect(b.disabled, 'l’entrée se laisse cliquer puis refuser').toBe(true);
    const note = hote!.querySelector('[data-testid="note-deliaison-compte"]');
    expect(note?.textContent).toBe(fr['settings.unlinkAccountNote']);
    expect(b.getAttribute('aria-describedby')).toBe('note-deliaison-compte');
    b.click();
    await souffler();
    expect(question).not.toHaveBeenCalled();
    expect(deliaisons()).toEqual([]);
  });

  it('authentification active (compte standard : il délie son profil) : active', async () => {
    activation = { auth_enabled: true, from_this_machine: false, code_required: false };
    const b = await entree();
    expect(b.disabled).toBe(false);
    expect(hote!.querySelector('[data-testid="note-deliaison-compte"]')).toBeNull();
  });

  it('état illisible (serveur ancien, 404) : active, le serveur jugera', async () => {
    const b = await entree();
    expect(b.disabled).toBe(false);
  });

  it('🔴 appliance qui relaie le port 80 : grisée, la note ne propose QUE l’administrateur', async () => {
    activation = { auth_enabled: false, from_this_machine: false, code_required: true };
    config = { appliance: true };
    const b = await entree();
    expect(b.disabled).toBe(true);
    const note = hote!.querySelector('[data-testid="note-deliaison-compte"]')?.textContent ?? '';
    expect(note).toBe(fr['settings.unlinkAccountNoteAdmin']);
    expect(note).not.toContain('machine');
  });

  it('la règle, seule', () => {
    expect(refusDeliaisonIci({ auth_enabled: false, from_this_machine: false })).toBe('hors_machine');
    expect(refusDeliaisonIci({ auth_enabled: false, from_this_machine: false }, true)).toBe('admin_seulement');
    expect(refusDeliaisonIci({ auth_enabled: false, from_this_machine: true }, true)).toBeNull();
    expect(refusDeliaisonIci({ auth_enabled: true, from_this_machine: false })).toBeNull();
    expect(refusDeliaisonIci(null)).toBeNull();
    expect(cleNoteDeliaison('hors_machine')).toBe('settings.unlinkAccountNote');
    expect(cleNoteDeliaison('admin_seulement')).toBe('settings.unlinkAccountNoteAdmin');
  });
});

describe('Réglages › Cloud : « Délier » suit la même règle que le menu', () => {
  async function boutonReglages(): Promise<HTMLButtonElement> {
    v2SettingsTarget.set({ tab: 'system', section: 'cloud' });
    monte = mount(SettingsV2, { target: hote!, props: {} });
    await souffler(12);
    const b = hote!.querySelector<HTMLButtonElement>('[data-sso="compte"] button.lnk');
    expect(b?.textContent).toContain(fr['settings.unlinkAccount']);
    return b!;
  }

  it('🔴 authentification coupée, autre appareil : grisé, avec la même note, rien ne part', async () => {
    activation = { auth_enabled: false, from_this_machine: false, code_required: true };
    const question = vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
    const b = await boutonReglages();
    expect(b.disabled, 'le bouton se laisse cliquer puis refuser').toBe(true);
    expect(hote!.querySelector('[data-testid="note-deliaison-reglages"]')?.textContent).toBe(fr['settings.unlinkAccountNote']);
    b.click();
    await souffler();
    expect(question).not.toHaveBeenCalled();
    expect(deliaisons()).toEqual([]);
  });

  it('🔴 appliance qui relaie le port 80 : la note ne propose que l’administrateur', async () => {
    activation = { auth_enabled: false, from_this_machine: false, code_required: true };
    config = { appliance: true };
    const b = await boutonReglages();
    expect(b.disabled).toBe(true);
    expect(hote!.querySelector('[data-testid="note-deliaison-reglages"]')?.textContent).toBe(fr['settings.unlinkAccountNoteAdmin']);
  });

  it('sur la machine du serveur : actif, sans note', async () => {
    activation = { auth_enabled: false, from_this_machine: true, code_required: false };
    const b = await boutonReglages();
    expect(b.disabled).toBe(false);
    expect(hote!.querySelector('[data-testid="note-deliaison-reglages"]')).toBeNull();
  });
});

describe('un refus qui passe malgré tout : UN toast, court', () => {
  it('🔴 403 « hors de cette machine » : un seul toast, la phrase de la déliaison', async () => {
    deliaison = { status: 403, corps: REFUS_HORS_MACHINE };
    vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
    const erreurs = vi.spyOn(notifications, 'error');
    (await entree()).click();
    await souffler();
    expect(deliaisons()).toHaveLength(1);
    expect(erreurs, 'deux toasts identiques empilés').toHaveBeenCalledTimes(1);
    const texte = String(erreurs.mock.calls[0][0]);
    expect(texte).toBe(fr['settings.unlinkAccountRefused']);
    expect(texte).not.toMatch(/docker|journalctl|SSH|tune-server\.log/i);
    expect(erreurs.mock.calls[0][3]?.label, 'le bouton du bandeau de fetchJSON').toBe(fr['machineAction.openAuthSettings']);
  });

  it('🔴 403 « port80_relay » (Tune OS) : un toast, qui ne propose que l’administrateur, avec le bouton', async () => {
    deliaison = { status: 403, corps: { ...REFUS_HORS_MACHINE, reason: 'port80_relay' } };
    vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
    const erreurs = vi.spyOn(notifications, 'error');
    (await entree()).click();
    await souffler();
    expect(erreurs).toHaveBeenCalledTimes(1);
    expect(String(erreurs.mock.calls[0][0])).toBe(fr['settings.unlinkAccountRefusedAdmin']);
    expect(String(erreurs.mock.calls[0][0])).not.toContain('machine');
    expect(erreurs.mock.calls[0][3]?.label).toBe(fr['machineAction.openAuthSettings']);
  });

  it('🔴 un échec déjà annoncé par fetchJSON n’est pas réannoncé par l’écran', () => {
    const erreurs = vi.spyOn(notifications, 'error');
    const e = Object.assign(new Error('déjà dit'), { status: 403, dejaAnnonce: true });
    expect(notifierErreur(fr['common.error'], e, { motifSeul: true })).toBe(-1);
    expect(erreurs).not.toHaveBeenCalled();
    notifierErreur(fr['common.error'], Object.assign(new Error('pas encore dit'), { status: 409 }));
    expect(erreurs).toHaveBeenCalledTimes(1);
  });

  it('🔴 le 503 « le serveur démarre » reste dit par l’écran : son bandeau s’efface tout seul', () => {
    const erreurs = vi.spyOn(notifications, 'error');
    const e = Object.assign(new Error('Tune démarre…'), { status: 503, code: 'server_starting', dejaAnnonce: true });
    expect(notifierErreur(fr['common.error'], e)).not.toBe(-1);
    expect(erreurs).toHaveBeenCalledTimes(1);
  });
});

describe('les phrases de la déliaison, dans les vingt langues', () => {
  it.each(ONZE_LANGUES)('%s', (code) => {
    const d = dictionnaire(code);
    for (const cle of ['settings.unlinkAccount', 'settings.unlinkAccountNote', 'settings.unlinkAccountRefused',
      'settings.unlinkAccountNoteAdmin', 'settings.unlinkAccountRefusedAdmin', 'settings.signOutConfirm']) {
      expect(d[cle], `${code} : ${cle} manquant`).toBeTruthy();
      expect(d[cle]).not.toMatch(/docker|journalctl|SSH|tune-server\.log/i);
      if (code !== 'en') expect(d[cle], `${code} : ${cle} non traduit`).not.toBe(dictionnaire('en')[cle]);
    }
    expect(d['settings.unlinkAccount']).toContain('mozaiklabs.fr');
    // La question dit « délier ce serveur du compte mozaiklabs.fr », plus « se déconnecter ».
    expect(d['settings.signOutConfirm']).toContain('mozaiklabs.fr');
  });
});
