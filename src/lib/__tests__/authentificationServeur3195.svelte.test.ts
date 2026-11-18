// @vitest-environment jsdom
//
// web#3195 — Réglages › Système › Authentification du serveur, et le refus
// `auth_required` des actions machine qui affichait le code brut.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

const mocks = vi.hoisted(() => ({
  getEtatAuthServeur: vi.fn(),
  demanderCodeActivation: vi.fn(),
  activerAuthServeur: vi.fn(),
  desactiverAuthServeur: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => {
  const { confirm: _c, ...api } = mocks;
  return { ...(await importOriginal<object>()), ...api };
});
vi.mock('../stores/dialogs', () => ({ dialogs: { confirm: mocks.confirm } }));

import AuthentificationServeurV2 from '../../components/v2/AuthentificationServeurV2.svelte';
import { locale, t } from '../i18n';
import { lireMessageServeur } from '../messageServeur';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const attendre = () => new Promise((r) => setTimeout(r, 0));
const respirer = async () => { for (let i = 0; i < 8; i++) await attendre(); flushSync(); };

let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

async function monter(etat: any) {
  mocks.getEtatAuthServeur.mockResolvedValue(etat);
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(AuthentificationServeurV2, { target: hote });
  await respirer();
}

const q = <T extends Element = HTMLElement>(sel: string) => hote.querySelector<T>(sel as any);
function saisir(sel: string, v: string) {
  const i = q<HTMLInputElement>(sel)!;
  i.value = v;
  i.dispatchEvent(new Event('input', { bubbles: true }));
}
async function cliquer(sel: string) { q<HTMLElement>(sel)!.click(); await respirer(); }

const OUVERT_RESEAU = { auth_enabled: false, admin_with_password: false, this_machine: false, recovery_file: 'desactiver-authentification', data_dir: '/opt/tune/data' };

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  locale.set('fr');
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  document.body.innerHTML = '';
});

describe('#3195 — interrupteur « Activer l’authentification du serveur »', () => {
  it('serveur d’avant #3195 : l’écran le dit, sans interrupteur', async () => {
    await monter({ auth_enabled: false, has_jwt_secret: false, has_api_key: false });
    expect(q('[data-auth-indisponible]')).not.toBeNull();
    expect(q('[data-auth-interrupteur]')).toBeNull();
  });

  it('🔴 depuis le réseau, sans admin : création + code + confirmation, puis appel complet', async () => {
    mocks.demanderCodeActivation.mockResolvedValue({ file: '/opt/tune/data/code-activation-authentification.txt', expires_in: 600 });
    mocks.activerAuthServeur.mockResolvedValue({ auth_enabled: true, token: 'jwt' });
    await monter(OUVERT_RESEAU);
    expect(q('[data-auth-etat]')!.getAttribute('data-auth-etat')).toBe('inactive');
    // La voie de secours est toujours affichée, avec le dossier.
    expect(q('[data-auth-secours]')!.textContent).toContain('desactiver-authentification');
    expect(q('[data-auth-dossier]')!.textContent).toContain('/opt/tune/data');

    await cliquer('[data-auth-interrupteur]');
    expect(q('[data-auth-formulaire]')).not.toBeNull();
    expect(q('[data-auth-mdp2]'), 'pas d’admin avec mot de passe : on le crée').not.toBeNull();
    expect(q('[data-auth-code]'), 'hors de la machine : le code est exigé').not.toBeNull();
    // Rien ne part tant que la confirmation n’est pas cochée.
    expect(q<HTMLButtonElement>('[data-auth-activer]')!.disabled).toBe(true);

    await cliquer('[data-auth-demander-code]');
    expect(q('[data-auth-fichier-code]')!.textContent).toContain('code-activation-authentification.txt');

    saisir('[data-auth-nom]', 'alice');
    saisir('[data-auth-mdp]', 'motdepasse-1');
    saisir('[data-auth-mdp2]', 'motdepasse-1');
    saisir('[data-auth-saisie-code]', 'ABCD EFGH JKMN');
    await cliquer('[data-auth-confirmer]');
    mocks.getEtatAuthServeur.mockResolvedValue({ ...OUVERT_RESEAU, auth_enabled: true, admin_with_password: true, data_dir: null });
    q<HTMLFormElement>('[data-auth-formulaire]')!.requestSubmit();
    await respirer();

    expect(mocks.activerAuthServeur).toHaveBeenCalledTimes(1);
    expect(mocks.activerAuthServeur.mock.calls[0][0]).toEqual({
      username: 'alice', password: 'motdepasse-1', confirm: true, create_admin: true, activation_code: 'ABCD EFGH JKMN',
    });
    expect(q('[data-auth-etat]')!.getAttribute('data-auth-etat')).toBe('active');
  });

  it('mots de passe différents ou trop courts : rien n’est envoyé', async () => {
    await monter({ ...OUVERT_RESEAU, this_machine: true });
    await cliquer('[data-auth-interrupteur]');
    expect(q('[data-auth-code]'), 'sur la machine : pas de code').toBeNull();
    saisir('[data-auth-mdp]', 'motdepasse-1');
    saisir('[data-auth-mdp2]', 'motdepasse-2');
    await cliquer('[data-auth-confirmer]');
    q<HTMLFormElement>('[data-auth-formulaire]')!.requestSubmit();
    await respirer();
    expect(mocks.activerAuthServeur).not.toHaveBeenCalled();
    expect(q('[data-auth-erreur]')!.textContent).toBe(get(t)('authServeur.motsDePasseDifferents' as any));
  });

  it('admin existant : identification, et l’erreur du serveur s’affiche traduite', async () => {
    const err = Object.assign(new Error(get(t)('erreursServeur.invalid_admin_credentials' as any)), { code: 'invalid_admin_credentials' });
    mocks.activerAuthServeur.mockRejectedValue(err);
    await monter({ ...OUVERT_RESEAU, admin_with_password: true, this_machine: true });
    await cliquer('[data-auth-interrupteur]');
    expect(q('[data-auth-mdp2]'), 'admin existant : pas de création par défaut').toBeNull();
    saisir('[data-auth-nom]', 'alice');
    saisir('[data-auth-mdp]', 'faux');
    await cliquer('[data-auth-confirmer]');
    q<HTMLFormElement>('[data-auth-formulaire]')!.requestSubmit();
    await respirer();
    expect(mocks.activerAuthServeur.mock.calls[0][0]).toMatchObject({ create_admin: false, activation_code: undefined });
    expect(q('[data-auth-erreur]')!.textContent).toBe('Nom ou mot de passe d\'administrateur incorrect.');
  });

  it('🔴 désactiver : confirmation danger exigée ; refusée, rien n’est envoyé', async () => {
    await monter({ ...OUVERT_RESEAU, auth_enabled: true, admin_with_password: true });
    mocks.confirm.mockResolvedValue(false);
    await cliquer('[data-auth-interrupteur]');
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(mocks.desactiverAuthServeur).not.toHaveBeenCalled();
    mocks.confirm.mockResolvedValue(true);
    mocks.desactiverAuthServeur.mockResolvedValue({ auth_enabled: false });
    await cliquer('[data-auth-interrupteur]');
    expect(mocks.desactiverAuthServeur).toHaveBeenCalledTimes(1);
  });
});

describe('#3195 — le refus des actions machine ne montre plus le code brut', () => {
  it('🔴 `auth_required` se lit en phrase traduite qui nomme le réglage', () => {
    locale.set('fr');
    const corps = { error: 'auth_required', reason: 'not_local', message: 'This action requires authentication…' };
    const lu = lireMessageServeur(corps, '', 403);
    expect(lu.message).not.toBe('auth_required');
    expect(lu.message).toContain('Authentification du serveur');
    expect(lu.detail).toContain('auth_required');
    locale.set('en');
    expect(lireMessageServeur(corps, '', 403).message).toContain('Server authentication');
  });

  it('🔴 applianceFetch (via applianceShutdown) jette la phrase, avec code et corps', async () => {
    locale.set('fr');
    const { applianceShutdown } = await vi.importActual<typeof import('../api')>('../api');
    const corps = { error: 'auth_required', reason: 'not_local', message: 'This action requires…' };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(corps), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const e: any = await applianceShutdown().catch((x) => x);
      expect(e.message).not.toBe('auth_required');
      expect(e.message).toContain('Authentification du serveur');
      expect(e.code).toBe('auth_required');
      expect(e.status).toBe(403);
      expect(e.corps?.reason).toBe('not_local');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('#3195 — 16 langues', () => {
  it('chaque clé ajoutée existe dans les 16 dictionnaires', () => {
    expect(ONZE_LANGUES.length).toBe(16);
    const fr = dictionnaire('fr');
    const cles = Object.keys(fr).filter((k) => k.startsWith('authServeur.') || ['erreursServeur.auth_required', 'erreursServeur.invalid_admin_credentials', 'erreursServeur.activation_code_invalid'].includes(k));
    expect(cles.length).toBeGreaterThan(25);
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      const manquantes = cles.filter((k) => !d[k]);
      expect(manquantes, l).toEqual([]);
    }
  });
});
