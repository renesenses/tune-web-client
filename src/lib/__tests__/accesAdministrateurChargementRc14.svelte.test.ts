// @vitest-environment jsdom
//
// rc14 (#3421, relecture) — tant que l'état de l'authentification n'est pas
// lu, l'étape « Accès administrateur » ne se passe pas : « Suivant » est
// grisé, et « Passer la configuration » attend la lecture avant de décider.
// Avant, l'état `undefined` valait « indisponible », et « Suivant » sautait
// la création du mot de passe sur une installation neuve.
//
// Assistant MONTÉ, `fetch` simulé ; la réponse de `/auth/activation` est
// retenue jusqu'à ce que le test la libère.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

import OnboardingWizard from '../../components/partages/OnboardingWizard.svelte';
import { locale } from '../i18n';
import { dictionnaire } from './onzeDictionnaires';

const fr = dictionnaire('fr');

const PREMIERE_CONFIGURATION = {
  auth_enabled: false,
  from_this_machine: false,
  code_required: false,
  first_setup: true,
  first_setup_expires_in: 30 * 60,
  admin_username: 'default',
  accounts: [],
  min_password_length: 8,
  max_password_length: 256,
};

let liberer: (() => void) | null = null;
let urls: string[] = [];

function json(corps: unknown): Response {
  return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  urls = [];
  localStorage.clear();
  locale.set('fr');
  const retenue = new Promise<void>((r) => { liberer = r; });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url.split('?')[0].endsWith('/auth/activation')) {
      await retenue;
      return json(PREMIERE_CONFIGURATION);
    }
    if (url.split('?')[0].endsWith('/streaming/services')) return json({});
    if (url.split('?')[0].endsWith('/library/browse')) return json({ roots: [] });
    return json({});
  }));
});

afterEach(() => {
  liberer?.();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

async function attendre(cond: () => boolean, essais = 80) {
  for (let i = 0; i < essais && !cond(); i++) {
    await new Promise((r) => setTimeout(r, 5));
    flushSync();
  }
}
function bouton(cible: HTMLElement, texte: string): HTMLButtonElement {
  const b = [...cible.querySelectorAll('button')].find((x) => x.textContent?.trim() === texte);
  if (!b) throw new Error(`bouton « ${texte} » introuvable`);
  return b as HTMLButtonElement;
}
async function monter() {
  const cible = document.createElement('div');
  document.body.appendChild(cible);
  const onComplete = vi.fn();
  const c = mount(OnboardingWizard, { target: cible, props: { onComplete } });
  await attendre(() => urls.some((u) => u.includes('/auth/activation')));
  return { c, cible, onComplete };
}

describe('rc14 — étape administrateur : rien ne la saute avant la lecture de l’état', () => {
  it('🔴 « Suivant » est grisé tant que l’état n’est pas lu, puis l’écran de création s’affiche', async () => {
    const { c, cible } = await monter();
    bouton(cible, fr['onboarding.getStarted']).click();
    flushSync();
    expect(cible.querySelector('[data-etape-administrateur]')).not.toBeNull();
    expect(cible.querySelector('[data-administrateur-chargement]')?.textContent).toBe(fr['authActivation.loading']);
    const suivant = cible.querySelector('[data-administrateur-suivant-attente]') as HTMLButtonElement;
    expect(suivant.disabled).toBe(true);
    suivant.click();
    flushSync();
    expect(cible.querySelector('[data-etape-administrateur]'), 'toujours à l’étape administrateur').not.toBeNull();

    liberer!();
    await attendre(() => !cible.querySelector('[data-administrateur-chargement]'));
    expect(cible.querySelector('[data-administrateur-suivant-attente]')).toBeNull();
    // Première configuration : la création est obligatoire, aucun « Suivant ».
    expect([...cible.querySelectorAll('.step-actions .btn-primary')].map((b) => b.textContent?.trim()))
      .not.toContain(fr['onboarding.next']);
    unmount(c);
  });

  it('🔴 « Passer la configuration » avant la lecture : attend l’état, puis mène à la création', async () => {
    const { c, cible, onComplete } = await monter();
    bouton(cible, fr['onboarding.skipAll']).click();
    await attendre(() => false, 5);
    expect(onComplete, 'rien n’est terminé avant la lecture').not.toHaveBeenCalled();
    liberer!();
    await attendre(() => !!cible.querySelector('[data-etape-administrateur]') && !cible.querySelector('[data-administrateur-chargement]'));
    expect(cible.querySelector('[data-etape-administrateur]')).not.toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
    unmount(c);
  });
});
