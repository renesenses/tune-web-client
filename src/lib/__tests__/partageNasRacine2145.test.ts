// @vitest-environment jsdom
//
// Fil 2145 (Daniel Levy, « Disparition bibliothèque sur unité NAS ») : un
// partage monté à chaque démarrage, jamais lu, parce que la racine n'était
// déclarée qu'à une étape séparée de l'assistant ; et aucune action sur la
// ligne d'un partage pour rattraper le coup, ni pour retirer un doublon.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { mount, unmount, flushSync } from 'svelte';
import SmbWizard from '../../components/partages/SmbWizard.svelte';
import DialogContainer from '../../components/partages/DialogContainer.svelte';
import { dialogs } from '../stores/dialogs';
import { forgetSmbShare } from '../api';
import { get } from 'svelte/store';
import { oublierUnPartage, proposerAjout, racineDeclaree } from '../smbMountState';
import type { SmbMount } from '../api';

function partage(p: Partial<SmbMount> = {}): SmbMount {
  return {
    id: 1,
    server: '192.168.10.69',
    share: 'Music',
    mount_path: '/mnt/192.168.10.69_Music',
    username: null,
    active: true,
    mounted: true,
    mount_state: 'mounted',
    last_mount_error: null,
    smb_version: 'negocie',
    ...p,
  } as SmbMount;
}

describe('« Ajouter à la bibliothèque » sur la ligne d’un partage', () => {
  it('le cas de Daniel : monté, aucun dossier déclaré → proposé', () => {
    expect(racineDeclaree(partage(), [])).toBe(false);
    expect(proposerAjout(partage(), [])).toBe(true);
  });

  it('déjà déclaré, au point, en dessous ou au-dessus → pas proposé', () => {
    expect(proposerAjout(partage(), ['/mnt/192.168.10.69_Music/'])).toBe(false);
    expect(proposerAjout(partage(), ['/mnt/192.168.10.69_Music/Jazz'])).toBe(false);
    expect(proposerAjout(partage(), ['/mnt'])).toBe(false);
  });

  it('un préfixe de nom n’est pas un dossier parent', () => {
    expect(proposerAjout(partage(), ['/mnt/192.168.10.69_Music2'])).toBe(true);
  });

  it('un partage non monté, ou sans chemin, n’est pas proposé', () => {
    expect(proposerAjout(partage({ mounted: false }), [])).toBe(false);
    expect(proposerAjout(partage({ mount_path: null }), [])).toBe(false);
  });
});

describe('« Oublier ce partage »', () => {
  it('sans racine dépendante : un seul appel, sans confirmation', async () => {
    const oublier = vi.fn(async () => ({ oublie: true, demonte: true, racines: [] }));
    const confirmer = vi.fn(async () => ({ coche: true }));
    expect(await oublierUnPartage(4, oublier, confirmer)).toMatchObject({ oublie: true });
    expect(oublier.mock.calls).toEqual([[4, false]]);
    expect(confirmer).not.toHaveBeenCalled();
  });

  // Décision de Bertrand (05/10) : la confirmation liste les dossiers et
  // propose de les retirer, case cochée par défaut, avec la purge habituelle.
  it('case cochée : on rappelle en retirant les dossiers, avec le nombre de pistes montré', async () => {
    const reponses = [
      { error: 'racines_dependantes', racines: ['/mnt/192.168.10.69_Music'], pistes: 1234 },
      { oublie: true, demonte: true, racines_retirees: ['/mnt/192.168.10.69_Music'], pistes_retirees: 1234 },
    ];
    const oublier = vi.fn(async () => reponses.shift()!);
    const confirmer = vi.fn(async () => ({ coche: true }));
    const r = await oublierUnPartage(4, oublier, confirmer);
    expect(confirmer).toHaveBeenCalledWith(['/mnt/192.168.10.69_Music'], 1234);
    expect(oublier.mock.calls).toEqual([[4, false], [4, true, { pistes: 1234 }]]);
    expect(r?.pistes_retirees).toBe(1234);
  });

  it('case décochée : on oublie le partage, les dossiers restent déclarés', async () => {
    const reponses = [
      { error: 'racines_dependantes', racines: ['/x'], pistes: 3 },
      { oublie: true, demonte: true, racines: ['/x'], racines_retirees: [] },
    ];
    const oublier = vi.fn(async () => reponses.shift()!);
    await oublierUnPartage(4, oublier, async () => ({ coche: false }));
    expect(oublier.mock.calls).toEqual([[4, false], [4, true, undefined]]);
  });

  it('l’utilisateur annule : aucun second appel', async () => {
    const oublier = vi.fn(async () => ({ error: 'racines_dependantes', racines: ['/x'], pistes: 0 }));
    expect(await oublierUnPartage(4, oublier, async () => null)).toBeNull();
    expect(oublier).toHaveBeenCalledTimes(1);
  });

  it('un démontage refusé remonte le message du serveur', async () => {
    const oublier = vi.fn(async () => ({ error: 'demontage_impossible', message: 'Impossible de démonter' }));
    await expect(oublierUnPartage(4, oublier, async () => ({ coche: true }))).rejects.toThrow('Impossible de démonter');
  });

  it('l’appel serveur porte les options de retrait', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(String(url));
      return { ok: true, status: 200, statusText: 'OK', headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ oublie: true }), text: async () => '{"oublie":true}' } as unknown as Response;
    }));
    await forgetSmbShare(4);
    await forgetSmbShare(4, true);
    await forgetSmbShare(4, true, { pistes: 12 });
    expect(urls.map((u) => u.replace(/^.*\/network/, ''))).toEqual([
      '/smb/mounts/4',
      '/smb/mounts/4?confirmer=true',
      '/smb/mounts/4?confirmer=true&retirer_racines=true&confirmer_purge=12',
    ]);
  });
});

describe('la confirmation porte une case cochée par défaut', () => {
  it('validée : rend l’état de la case ; annulée : null', async () => {
    const coche = dialogs.confirmAvecCase('msg', 'Retirer aussi', { danger: true });
    const req = get(dialogs)[0];
    expect(req.case).toEqual({ label: 'Retirer aussi', coche: true });
    dialogs.settle(req.id, { coche: true });
    expect(await coche).toEqual({ coche: true });
    const annule = dialogs.confirmAvecCase('msg', 'Retirer aussi');
    dialogs.settle(get(dialogs)[0].id, null);
    expect(await annule).toBeNull();
  });

  it('le conteneur affiche la case, cochée, et rend son état', async () => {
    const cible = document.createElement('div');
    document.body.appendChild(cible);
    const c = mount(DialogContainer, { target: cible });
    const reponse = dialogs.confirmAvecCase('Ce partage porte 1 dossier', 'Retirer aussi ces dossiers');
    flushSync();
    const caseAjout = cible.querySelector('.dialog-case input') as HTMLInputElement;
    expect(caseAjout, 'la case manque dans la confirmation').not.toBeNull();
    expect(caseAjout.checked).toBe(true);
    caseAjout.click();
    flushSync();
    (cible.querySelector('.dialog-btn.primary') as HTMLButtonElement).click();
    expect(await reponse).toEqual({ coche: false });
    unmount(c);
    cible.remove();
  });
});

describe('les deux actions sont branchées sur la ligne du partage', () => {
  const V2 = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
  const debut = V2.indexOf('{#each smbMounts as m');
  const bloc = V2.slice(debut, V2.indexOf('{/each}', debut));

  it('« Ajouter à la bibliothèque » si la racine n’est pas déclarée', () => {
    expect(bloc).toContain('{#if proposerAjout(m, musicDirs)}');
    expect(bloc).toContain('onclick={() => ajouterPartage(m)}');
  });

  it('« Oublier ce partage » passe par la route qui DÉMONTE', () => {
    expect(bloc).toContain('onclick={() => oublierPartage(m)}');
    expect(V2).toContain('api.forgetSmbShare(id, confirmer, retirer)');
    expect(V2).toContain('dialogs.confirmAvecCase(');
    // L'ancienne suppression efface la ligne sans démonter : jamais exposée.
    expect(V2).not.toContain('unmountSmbShare(');
  });
});

// --- L'assistant déclare la racine dès que le montage réussit ---------------

const PARTAGES = [{ name: 'Music', type: 'Disk', host: '192.168.10.69', protocol: 'smb', path: '//192.168.10.69/Music' }];
let appels: { url: string; method: string; body?: string }[] = [];

function corpsPour(url: string, body?: string): unknown {
  if (url.includes('/network/scan-host')) return PARTAGES;
  if (url.includes('/network/smb/mount') && body?.includes('"dry_run":true')) return { ok: true, message: 'joignable' };
  if (url.includes('/network/smb/mount')) return { id: 7, mount_path: '/mnt/192.168.10.69_Music', deja_monte: true };
  if (url.includes('/system/music-dirs')) return { dirs: ['/mnt/192.168.10.69_Music'] };
  return {};
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisserFaire() {
  for (let i = 0; i < 6; i++) await respirer();
  flushSync();
}

beforeEach(() => {
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    appels.push({ url: String(url), method: (init?.method ?? 'GET').toUpperCase(), body: init?.body as string });
    const corps = corpsPour(String(url), init?.body as string);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps, text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

/** Jusqu'à l'étape 3 par l'adresse saisie, comme Daniel. */
async function allerAuMontage(): Promise<{ el: HTMLDivElement; ajouts: { n: number } }> {
  const ajouts = { n: 0 };
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SmbWizard, { target: hote, props: { onClose: () => {}, onMusicDirsChanged: () => { ajouts.n++; } } });
  flushSync();
  const champ = hote.querySelector('.manual-row .auth-input') as HTMLInputElement;
  champ.value = '\\\\192.168.10.69\\Music';
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  (hote.querySelector('.manual-row .scan-btn') as HTMLButtonElement).click();
  await laisserFaire();
  // Étape 1 → 2.
  (hote.querySelector('.wizard-footer .btn-primary') as HTMLButtonElement).click();
  await laisserFaire();
  // Étape 2 : le test de connexion conditionne le passage à l'étape 3.
  (hote.querySelector('.wizard-body .scan-btn') as HTMLButtonElement).click();
  await laisserFaire();
  (hote.querySelector('.wizard-footer .btn-primary') as HTMLButtonElement).click();
  await laisserFaire();
  appels = [];
  expect(hote.querySelector('.add-after-mount'), 'la case « Ajouter à la bibliothèque » manque').not.toBeNull();
  return { el: hote, ajouts };
}

const ajoutsDeRacine = () => appels.filter((a) => a.url.includes('/system/music-dirs') && a.method === 'POST');

describe('l’assistant SMB déclare la racine dans la foulée du montage', () => {
  it('case cochée par défaut : le montage réussi déclare la racine', async () => {
    const { el, ajouts } = await allerAuMontage();
    const caseAjout = el.querySelector('.add-after-mount input') as HTMLInputElement;
    expect(caseAjout.checked, 'la case doit être cochée par défaut').toBe(true);
    (el.querySelector('.wizard-body .scan-btn') as HTMLButtonElement).click();
    await laisserFaire();
    const r = ajoutsDeRacine();
    expect(r.length, `appels vus : ${appels.map((a) => `${a.method} ${a.url}`).join(' | ')}`).toBe(1);
    expect(JSON.parse(r[0].body!)).toEqual({ path: '/mnt/192.168.10.69_Music' });
    expect(ajouts.n).toBe(1);
    expect(el.textContent).toContain('/mnt/192.168.10.69_Music');
  });

  it('case décochée : le montage ne déclare rien', async () => {
    const { el } = await allerAuMontage();
    const caseAjout = el.querySelector('.add-after-mount input') as HTMLInputElement;
    caseAjout.click();
    flushSync();
    expect(caseAjout.checked).toBe(false);
    (el.querySelector('.wizard-body .scan-btn') as HTMLButtonElement).click();
    await laisserFaire();
    expect(appels.some((a) => a.url.includes('/network/smb/mount') && a.method === 'POST')).toBe(true);
    expect(ajoutsDeRacine().length).toBe(0);
  });
});
