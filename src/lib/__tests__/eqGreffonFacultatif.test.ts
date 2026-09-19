// @vitest-environment jsdom
//
// L'égaliseur devient un greffon FACULTATIF (v0.9.156) : il s'installe depuis
// le catalogue, il n'est plus activé d'office. `GET /plugins/equalizer` rend
// trois champs de plus à la racine : `installed`, `install_proposed`,
// `existing_configuration`.
//
// 🔴 CES TÉMOINS MONTENT LE VRAI ÉCRAN. On moque `../api` avec la charge utile
// du contrat, on regarde ce qui se peint, on clique, et on regarde dans quel
// ORDRE `installPlugin` puis `enablePlugin` ont été appelés. Un vieux serveur
// (champs absents) doit donner l'écran d'avant : `undefined` n'est jamais
// « non installé ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { dictionnaire } from './onzeDictionnaires';

const ordre: string[] = [];
const mocks = vi.hoisted(() => ({
  getPluginDetail: vi.fn(),
  getEqExpertSettings: vi.fn(),
  getEq: vi.fn(),
  setEq: vi.fn(),
  setEqExpertSettings: vi.fn(),
  installPlugin: vi.fn(),
  enablePlugin: vi.fn(),
  setDsp: vi.fn(),
}));

vi.mock('../api', () => mocks);

import EqualizerV2 from '../../components/v2/EqualizerV2.svelte';
import { currentZoneId } from '../stores/zones';
import { notifications } from '../stores/notifications';
import { get } from 'svelte/store';

const LOCALES = ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'hu'];
const CLES = [
  'v2.eq.pluginNotInstalled', 'v2.eq.pluginProposed', 'v2.eq.pluginInstall', 'v2.eq.pluginInstalling',
  'v2.eq.pluginInstalled', 'v2.eq.pluginInstallError', 'v2.eq.pluginRestart',
];

/** Une fiche de greffon telle que `GET /plugins/equalizer` la rend, champs du contrat en plus. */
function fiche(extra: Record<string, unknown> = {}) {
  return {
    name: 'equalizer', display_name: 'Égaliseur',
    description: 'Égaliseur : profil, graphique, paramétrique, presets et AutoEq',
    version: '1.0.0', category: 'audio', compatible: true, update_available: false, status: 'available',
    ...extra,
  };
}

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisserCharger() { for (let i = 0; i < 4; i++) await respirer(); flushSync(); }

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(EqualizerV2, { target: hote });
  flushSync();
  await laisserCharger();
  return hote;
}

const bouton = (el: HTMLElement) => el.querySelector('button.plugin-install') as HTMLButtonElement | null;
const banniere = (el: HTMLElement) => el.querySelector('.plugin-banner');
const curseurs = (el: HTMLElement) => el.querySelectorAll('.board input.v');

beforeEach(() => {
  ordre.length = 0;
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getEqExpertSettings.mockResolvedValue({ expert_bands: 10 });
  mocks.getEq.mockResolvedValue({ enabled: true, bands: [] });
  mocks.setEq.mockResolvedValue({ applied_live: true });
  mocks.installPlugin.mockImplementation(async () => { ordre.push('install'); return { success: true, message: '', restart_required: false }; });
  mocks.enablePlugin.mockImplementation(async () => { ordre.push('enable'); return { name: 'equalizer', enabled: true, restart_required: false }; });
  currentZoneId.set(1);
});

afterEach(() => {
  if (monte) unmount(monte as any);
  monte = null;
  hote?.remove();
  hote = null;
});

describe('Égaliseur — greffon facultatif', () => {
  it('1. champs absents (vieux serveur) ⇒ écran d’avant, aucun bouton d’installation', async () => {
    mocks.getPluginDetail.mockResolvedValue(fiche());
    const el = await poser();
    expect(bouton(el)).toBeNull();
    expect(banniere(el)).toBeNull();
    expect(curseurs(el).length).toBe(10);
  });

  it('1bis. route refusée (vieux serveur, 404) ⇒ écran d’avant aussi', async () => {
    mocks.getPluginDetail.mockRejectedValue(new Error('404'));
    const el = await poser();
    expect(bouton(el)).toBeNull();
    expect(curseurs(el).length).toBe(10);
  });

  it('2. installed:false, install_proposed:false ⇒ bouton, pas de bannière, pas de curseurs', async () => {
    mocks.getPluginDetail.mockResolvedValue(fiche({ installed: false, install_proposed: false, existing_configuration: false }));
    const el = await poser();
    const b = bouton(el);
    expect(b, 'le bouton « Installer l’égaliseur » manque').not.toBeNull();
    expect(b!.textContent).toContain("Installer l'égaliseur");
    expect(el.textContent).toContain("Il n'est pas installé sur ce serveur");
    expect(banniere(el)).toBeNull();
    expect(curseurs(el).length).toBe(0);
    // Un seul bouton d'action : ni interrupteur ni « Remettre à plat ».
    expect(el.querySelector('.v2-actions')).toBeNull();
  });

  it('3. proposé + configuration existante ⇒ bannière + bouton ; le clic installe PUIS active, et recharge', async () => {
    mocks.getPluginDetail
      .mockResolvedValueOnce(fiche({ installed: false, install_proposed: true, existing_configuration: true }))
      .mockResolvedValue(fiche({ installed: true, install_proposed: false, existing_configuration: true }));
    const el = await poser();
    expect(banniere(el)).not.toBeNull();
    expect(banniere(el)!.textContent).toContain('Vos réglages sont conservés');
    const b = bouton(el);
    expect(b).not.toBeNull();

    b!.click();
    await laisserCharger();

    expect(mocks.installPlugin).toHaveBeenCalledWith('equalizer');
    expect(mocks.enablePlugin).toHaveBeenCalledWith('equalizer');
    expect(ordre, 'installer d’abord, activer ensuite').toEqual(['install', 'enable']);
    // Rechargé : la fiche a été relue, et l'écran d'avant est revenu.
    expect(mocks.getPluginDetail).toHaveBeenCalledTimes(2);
    expect(bouton(el)).toBeNull();
    expect(curseurs(el).length).toBe(10);
    // Aucun redémarrage annoncé quand le serveur n'en demande pas.
    expect(el.querySelector('.plugin-restart')).toBeNull();
  });

  it('4. installed:true ⇒ écran d’avant', async () => {
    mocks.getPluginDetail.mockResolvedValue(fiche({ installed: true, install_proposed: false, existing_configuration: true }));
    const el = await poser();
    expect(bouton(el)).toBeNull();
    expect(banniere(el)).toBeNull();
    expect(curseurs(el).length).toBe(10);
    expect(el.querySelector('.v2-actions')).not.toBeNull();
  });

  it('5. restart_required:true ⇒ le message de redémarrage s’affiche, et reste après rechargement', async () => {
    mocks.getPluginDetail
      .mockResolvedValueOnce(fiche({ installed: false, install_proposed: false, existing_configuration: false }))
      .mockResolvedValue(fiche({ installed: true, install_proposed: false, existing_configuration: false }));
    mocks.installPlugin.mockImplementation(async () => { ordre.push('install'); return { success: true, message: '', restart_required: true }; });
    const el = await poser();
    bouton(el)!.click();
    await laisserCharger();
    const r = el.querySelector('.plugin-restart');
    expect(r, 'le serveur a dit restart_required, l’écran doit le dire').not.toBeNull();
    expect(r!.textContent).toContain("Redémarrez Tune pour activer l'égaliseur");
  });

  it('6. l’échec de l’installation se dit, et le bouton redevient cliquable', async () => {
    mocks.getPluginDetail.mockResolvedValue(fiche({ installed: false, install_proposed: false, existing_configuration: false }));
    mocks.installPlugin.mockRejectedValue(new Error('boom'));
    const el = await poser();
    bouton(el)!.click();
    await laisserCharger();
    expect(mocks.enablePlugin).not.toHaveBeenCalled();
    expect(el.querySelector('.err')?.textContent).toContain("L'installation de l'égaliseur a échoué");
    expect(bouton(el)!.disabled).toBe(false);
    expect(get(notifications).some((n) => n.level === 'error')).toBe(true);
  });
});

describe('Égaliseur — les clés du greffon existent dans les onze langues', () => {
  it('sept clés, onze dictionnaires', async () => {
    for (const code of LOCALES) {
      const dico = dictionnaire(code);
      for (const cle of CLES) expect(dico[cle], `${code} / ${cle}`).toBeTruthy();
    }
  });
});
