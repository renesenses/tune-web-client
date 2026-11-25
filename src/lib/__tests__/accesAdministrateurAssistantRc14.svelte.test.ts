// @vitest-environment jsdom
//
// rc14 — le mot de passe administrateur se crée dans l'assistant de première
// configuration, sans code à lire dans le journal du serveur, quand le serveur
// le permet (`first_setup` : installation neuve, réseau local, fenêtre courte,
// une seule fois). Hors de cette fenêtre, la voie du code reste.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  getAuthActivation: vi.fn(),
  getAuthMe: vi.fn(),
  activateAuth: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), ...mocks }));

import ActivationAuthV2 from '../../components/v2/ActivationAuthV2.svelte';
import { locale } from '../i18n';
import {
  activationPossible,
  cleDuRefusActivation,
  etapeAdministrateur,
  minutesRestantes,
} from '../activationAuth';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const attendre = () => new Promise((r) => setTimeout(r, 0));
const respirer = async () => { for (let i = 0; i < 8; i++) await attendre(); flushSync(); };

const PREMIERE_CONFIGURATION = {
  auth_enabled: false,
  from_this_machine: false,
  code_required: false,
  first_setup: true,
  first_setup_expires_in: 30 * 60 + 5,
  admin_username: 'default',
  accounts: [],
  min_password_length: 8,
  max_password_length: 256,
};
const HORS_FENETRE = { ...PREMIERE_CONFIGURATION, code_required: true, first_setup: false, first_setup_expires_in: null };

let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

async function monter(props: Record<string, unknown> = {}) {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(ActivationAuthV2, { target: hote, props });
  await respirer();
}

function saisir(sel: string, valeur: string) {
  const champ = hote.querySelector(sel) as HTMLInputElement;
  champ.value = valeur;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  locale.set('fr');
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  document.body.innerHTML = '';
});

describe('rc14 — accès administrateur dans l’assistant', () => {
  it('première configuration : pas de code, le délai restant est dit', async () => {
    mocks.getAuthActivation.mockResolvedValue(PREMIERE_CONFIGURATION);
    await monter({ assistant: true });
    expect(hote.querySelector('[data-activation-code]')).toBeNull();
    const msg = hote.querySelector('[data-activation-premiere-configuration]');
    expect(msg?.textContent).toContain('31 min');
    expect(hote.querySelector('[data-activation-cette-machine]')).toBeNull();
    expect(hote.querySelector('[data-activation-compte-admin]')?.textContent).toContain('default');
  });

  it('crée le mot de passe sans code et prévient l’assistant', async () => {
    mocks.getAuthActivation.mockResolvedValueOnce(PREMIERE_CONFIGURATION)
      .mockResolvedValue({ ...PREMIERE_CONFIGURATION, auth_enabled: true, first_setup: false });
    mocks.getAuthMe.mockResolvedValue({ role: 'admin' });
    mocks.activateAuth.mockResolvedValue({ auth_enabled: true, username: 'default' });
    const onActivee = vi.fn();
    await monter({ assistant: true, onActivee });
    saisir('#activation-auth-mdp', 'proprio-1234');
    saisir('#activation-auth-confirmation', 'proprio-1234');
    (hote.querySelector('[data-activation-activer]') as HTMLButtonElement).click();
    await respirer();
    expect(mocks.activateAuth).toHaveBeenCalledWith('proprio-1234', undefined, []);
    expect(onActivee).toHaveBeenCalledTimes(1);
    expect(onActivee).toHaveBeenCalledWith('default');
    // Dans l'assistant, jamais de bouton « Désactiver ».
    expect(hote.querySelector('[data-desactivation-desactiver]')).toBeNull();
  });

  it('hors fenêtre : la voie du code reste', async () => {
    mocks.getAuthActivation.mockResolvedValue(HORS_FENETRE);
    await monter({ assistant: true });
    expect(hote.querySelector('[data-activation-code]')).not.toBeNull();
    expect(hote.querySelector('[data-activation-premiere-configuration]')).toBeNull();
  });

  it('fenêtre fermée entre-temps : refus lisible, état relu', async () => {
    mocks.getAuthActivation.mockResolvedValueOnce(PREMIERE_CONFIGURATION).mockResolvedValue(HORS_FENETRE);
    mocks.activateAuth.mockResolvedValue({ error: 'first_setup_closed' });
    await monter({ assistant: true });
    saisir('#activation-auth-mdp', 'proprio-1234');
    saisir('#activation-auth-confirmation', 'proprio-1234');
    (hote.querySelector('[data-activation-activer]') as HTMLButtonElement).click();
    await respirer();
    expect(hote.querySelector('[data-activation-refus]')?.textContent).toBeTruthy();
    expect(hote.querySelector('[data-activation-code]')).not.toBeNull();
  });

  it('règles du formulaire et refus du serveur', () => {
    expect(activationPossible('1234567', '1234567', '', false)).toBe(false);
    expect(activationPossible('12345678', '12345678', '', false)).toBe(true);
    expect(activationPossible('12345678', '12345679', '', false)).toBe(false);
    const long = 'x'.repeat(257);
    expect(activationPossible(long, long, '', false)).toBe(false);
    expect(activationPossible('x'.repeat(256), 'x'.repeat(256), '', false)).toBe(true);
    expect(cleDuRefusActivation({ error: 'password_too_long' } as any)).toBe('authActivation.passwordTooLong');
    expect(cleDuRefusActivation({ error: 'first_setup_closed' } as any)).toBe('authActivation.firstSetupClosed');
  });

  it('ce que montre l’étape de l’assistant', () => {
    expect(etapeAdministrateur(null)).toBe('indisponible');
    expect(etapeAdministrateur({ auth_enabled: true })).toBe('active');
    expect(etapeAdministrateur({ auth_enabled: false, code_required: false })).toBe('creer');
    expect(etapeAdministrateur({ auth_enabled: false, code_required: true })).toBe('code');
    expect(minutesRestantes(61)).toBe(2);
    expect(minutesRestantes(0)).toBe(0);
    expect(minutesRestantes(null)).toBe(0);
  });

  it('l’étape vient juste après l’accueil, et « passer » ne saute pas la création', () => {
    const source = readFileSync('src/components/partages/OnboardingWizard.svelte', 'utf8');
    const admin = source.indexOf('data-etape-administrateur');
    const biblio = source.indexOf("$t('onboarding.libraryTitle')");
    expect(admin).toBeGreaterThan(-1);
    expect(admin).toBeLessThan(biblio);
    expect(source).toMatch(/onclick=\{passerLaConfiguration\}/);
    expect(source).toMatch(/const totalSteps = 5;/);
  });

  it('les vingt langues ont leurs textes, avec {min}', () => {
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      for (const cle of [
        'authActivation.firstSetup', 'authActivation.passwordTooLong', 'authActivation.firstSetupClosed',
        'onboarding.adminTitle', 'onboarding.adminDesc', 'onboarding.adminDone', 'onboarding.adminAlready',
        'onboarding.adminLater', 'onboarding.adminLaterHint',
      ]) {
        expect(d[cle], `${l} ${cle}`).toBeTruthy();
      }
      expect(d['authActivation.firstSetup'], l).toContain('{min}');
    }
  });
});
