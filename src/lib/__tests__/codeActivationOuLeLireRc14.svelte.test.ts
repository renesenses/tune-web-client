// @vitest-environment jsdom
//
// Recette rc14 du 24/11, point 7 — l'écran « Activer l'authentification »
// demandait un code à usage unique sans dire EXACTEMENT où le lire. Le
// serveur l'écrit sur une ligne marquée `TUNE-ACTIVATION-CODE` (console,
// journal du service, fichier tune-server.log) : l'écran donne les commandes
// qui la retrouvent, sous une forme générique (le nom du service et du
// conteneur ne sont pas connus du client), et les montre comme du code.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  getAuthActivation: vi.fn(),
  getAuthMe: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), ...mocks }));

import ActivationAuthV2 from '../../components/v2/ActivationAuthV2.svelte';
import { locale } from '../i18n';
import { segmentsAvecCode } from '../activationAuth';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const attendre = () => new Promise((r) => setTimeout(r, 0));
const respirer = async () => { for (let i = 0; i < 8; i++) await attendre(); flushSync(); };

const COUPEE_RESEAU = { auth_enabled: false, from_this_machine: false, code_required: true, admin_username: 'admin', accounts: [], min_password_length: 8 };
const COUPEE_MACHINE = { ...COUPEE_RESEAU, from_this_machine: true, code_required: false };

let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

async function monter() {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(ActivationAuthV2, { target: hote });
  await respirer();
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

describe('rc14 point 7 — où lire le code d’activation', () => {
  it('🔴 code requis : l’écran donne les commandes exactes, en code', async () => {
    mocks.getAuthActivation.mockResolvedValue(COUPEE_RESEAU);
    await monter();
    const bloc = hote.querySelector('[data-activation-code-ou]');
    expect(bloc).not.toBeNull();
    const commandes = Array.from(bloc!.querySelectorAll('code')).map((c) => c.textContent);
    expect(commandes).toContain('journalctl -u <service> | grep TUNE-ACTIVATION-CODE');
    expect(commandes).toContain('docker logs <conteneur> | grep TUNE-ACTIVATION-CODE');
    expect(bloc!.textContent).toContain('console');
    // Aucune ellipse ni accent grave littéral à l'écran.
    expect(bloc!.textContent).not.toMatch(/…|`/);
  });

  it('contre-épreuve : sur la machine du serveur, pas de code, pas de commandes', async () => {
    mocks.getAuthActivation.mockResolvedValue(COUPEE_MACHINE);
    await monter();
    expect(hote.querySelector('[data-activation-code-ou]')).toBeNull();
  });

  it('découpage du texte : les passages entre accents graves deviennent du code', () => {
    expect(segmentsAvecCode('a `x y` b `z`')).toEqual([
      { texte: 'a ', code: false }, { texte: 'x y', code: true }, { texte: ' b ', code: false }, { texte: 'z', code: true },
    ]);
    expect(segmentsAvecCode('sans code')).toEqual([{ texte: 'sans code', code: false }]);
  });

  it('les vingt langues donnent les deux commandes avec le marqueur, sans « … »', () => {
    for (const l of ONZE_LANGUES) {
      const s = dictionnaire(l)['authActivation.codeWhere'];
      expect(s, l).toBeTruthy();
      const codes = segmentsAvecCode(s).filter((x) => x.code).map((x) => x.texte);
      expect(codes.some((c) => /^journalctl -u <[^<>…]+> \| grep TUNE-ACTIVATION-CODE$/.test(c)), l).toBe(true);
      expect(codes.some((c) => /^docker logs <[^<>…]+> \| grep TUNE-ACTIVATION-CODE$/.test(c)), l).toBe(true);
      expect(s, l).not.toContain('…');
      // Nombre pair d'accents graves : aucun bloc de code ouvert.
      expect((s.match(/`/g) ?? []).length % 2, l).toBe(0);
    }
  });
});
