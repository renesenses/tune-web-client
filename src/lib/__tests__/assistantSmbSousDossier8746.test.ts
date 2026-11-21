// @vitest-environment jsdom
//
// Assistant SMB — renesenses/tune-server-rust#8746 (fil 2816) et #8069
// (fil 2699, Synology en Docker).
//
// #8746 : la source de bibliothèque était toujours la RACINE du partage ;
// l'analyse parcourait tout le NAS. Variante B (décision du 15/11) : une case
// « Choisir un sous-dossier après le montage », décochée par défaut, ouvre
// l'explorateur sur le point de montage ; le dossier choisi est déclaré et
// analysé. Sans elle, rien ne change.
//
// #8069 : le conseil « montez sur l'hôte, en rslave » que le serveur rend
// quand le montage est impossible dans un conteneur n'atteignait pas
// l'écran : sans `message_key`, le client affiche son message générique.
//
// On monte le vrai assistant, on stube `fetch`, on parcourt les étapes et on
// lit les requêtes envoyées.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SmbWizard from '../../components/partages/SmbWizard.svelte';
import { sousDossierDuPartage } from '../smbMountState';

const POINT = '/srv/tune/montages/nas_Music';
const SOUS_DOSSIER = `${POINT}/Musique`;

type Appel = { url: string; methode: string; corps: any };
let appels: Appel[] = [];
let echecDuMontage: { statut: number; corps: unknown } | null = null;

function repondre(statut: number, corps: unknown): Response {
  return {
    ok: statut >= 200 && statut < 300,
    status: statut,
    statusText: String(statut),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

function router(url: string, init?: RequestInit): Response {
  const corps = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
  appels.push({ url, methode: init?.method ?? 'GET', corps });
  if (url.includes('/network/scan-host')) return repondre(200, [{ name: 'Music' }]);
  if (url.includes('/network/smb/mount')) {
    if (corps?.dry_run) return repondre(200, { ok: true, message: 'ok' });
    if (echecDuMontage) return repondre(echecDuMontage.statut, echecDuMontage.corps);
    return repondre(200, { mount_path: POINT, id: 3 });
  }
  if (url.includes('/system/browse-dirs')) {
    if (url.includes(`path=${encodeURIComponent('/srv/tune/montages')}`) && !url.includes('nas_Music')) {
      return repondre(200, {
        current: '/srv/tune/montages',
        parent: '/srv/tune',
        dirs: [{ name: 'nas_Music', path: POINT, has_children: true }],
      });
    }
    return repondre(200, {
      current: POINT,
      parent: '/srv/tune/montages',
      dirs: [{ name: 'Musique', path: SOUS_DOSSIER, has_children: true }],
    });
  }
  if (url.includes('/system/music-dirs')) return repondre(200, { music_dirs: [corps?.path] });
  if (url.includes('/system/scan')) return repondre(200, { status: 'started', music_dirs: [] });
  return repondre(200, {});
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
  flushSync();
};

function cliquer(sel: string) {
  const el = hote!.querySelector(sel) as HTMLElement | null;
  expect(el, `élément absent : ${sel}`).not.toBeNull();
  el!.click();
  flushSync();
}

/** Jusqu'à l'étape 3 (montage), partage `Music` de `nas` sélectionné. */
async function jusquAuMontage() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SmbWizard, { target: hote, props: { onClose: () => {}, onMusicDirsChanged: () => {} } });
  flushSync();
  const champ = hote.querySelector('.manual-row input') as HTMLInputElement;
  champ.value = 'nas';
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  cliquer('.manual-row .scan-btn');
  await respirer();
  cliquer('.sub-shares .share-item');
  cliquer('.wizard-footer .btn-primary'); // étape 2
  cliquer('.wizard-body .scan-btn'); // test de connexion
  await respirer();
  cliquer('.wizard-footer .btn-primary'); // étape 3
}

const ajouts = () => appels.filter((a) => a.url.includes('/system/music-dirs') && a.methode === 'POST');
const analyses = () => appels.filter((a) => a.url.includes('/system/scan'));

beforeEach(() => {
  appels = [];
  echecDuMontage = null;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => router(String(url), init)));
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as unknown as typeof WebSocket);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  document.querySelectorAll('.folder-overlay').forEach((n) => n.remove());
  vi.unstubAllGlobals();
});

describe('#8746 — choisir un sous-dossier du partage', () => {
  it('case cochée : le sous-dossier choisi est déclaré et analysé, pas la racine', async () => {
    await jusquAuMontage();
    const caseSousDossier = hote!.querySelector('[data-choisir-sous-dossier]') as HTMLInputElement;
    expect(caseSousDossier.checked, 'décochée par défaut').toBe(false);
    caseSousDossier.click();
    flushSync();
    cliquer('.wizard-body .scan-btn'); // Monter
    await respirer();

    expect(ajouts(), 'rien ne doit être déclaré avant le choix').toHaveLength(0);
    const explorateur = document.querySelector('.folder-modal');
    expect(explorateur, "l'explorateur doit s'ouvrir sur le point de montage").not.toBeNull();
    expect(appels.some((a) => a.url.includes(`browse-dirs?path=${encodeURIComponent(POINT)}`))).toBe(true);

    (document.querySelector('.dir-row .dir-item') as HTMLElement).click();
    flushSync();
    (document.querySelector('.select-btn') as HTMLElement).click();
    await respirer();

    expect(ajouts().map((a) => a.corps.path)).toEqual([SOUS_DOSSIER]);
    expect(document.querySelector('.folder-modal')).toBeNull();
    expect(hote!.querySelector('[data-dossier-declare]')?.textContent).toBe(SOUS_DOSSIER);

    cliquer('.wizard-body .scan-btn'); // Analyser
    await respirer();
    expect(analyses()).toHaveLength(1);
    expect(analyses()[0].url).toContain(`path=${encodeURIComponent(SOUS_DOSSIER)}`);
  });

  it('contre-épreuve : case décochée, la racine est déclarée comme avant, sans explorateur', async () => {
    await jusquAuMontage();
    cliquer('.wizard-body .scan-btn'); // Monter
    await respirer();
    expect(document.querySelector('.folder-modal')).toBeNull();
    expect(ajouts().map((a) => a.corps.path)).toEqual([POINT]);
    cliquer('.wizard-body .scan-btn'); // Analyser
    await respirer();
    expect(analyses()[0].url).toContain(`path=${encodeURIComponent(POINT)}`);
  });

  it("fermer l'explorateur sans choisir déclare la racine (fil 2145)", async () => {
    await jusquAuMontage();
    (hote!.querySelector('[data-choisir-sous-dossier]') as HTMLInputElement).click();
    flushSync();
    cliquer('.wizard-body .scan-btn');
    await respirer();
    (document.querySelector('.folder-modal .cancel-btn') as HTMLElement).click();
    await respirer();
    expect(ajouts().map((a) => a.corps.path)).toEqual([POINT]);
  });

  it('un dossier hors du partage est refusé, rien n’est déclaré', async () => {
    await jusquAuMontage();
    (hote!.querySelector('[data-choisir-sous-dossier]') as HTMLInputElement).click();
    flushSync();
    cliquer('.wizard-body .scan-btn');
    await respirer();
    // « .. » remonte au-dessus du point, puis « Choisir » : le dossier courant.
    (document.querySelector('.dir-item.parent') as HTMLElement).click();
    await respirer();
    (document.querySelector('.select-btn') as HTMLElement).click();
    await respirer();
    expect(ajouts()).toHaveLength(0);
    expect(hote!.querySelector('.wizard-body .wizard-error[role="alert"]')).not.toBeNull();
    expect(document.querySelector('.folder-modal'), "l'explorateur reste ouvert").not.toBeNull();
  });
});

describe('#8069 — le conseil du serveur atteint l’écran', () => {
  const CONSEIL =
    'Tune is running in a container (docker): it cannot mount an SMB share itself there … rslave …';

  it('avec message_key, la phrase du serveur est affichée et la cause repliée', async () => {
    echecDuMontage = {
      statut: 500,
      corps: {
        error: 'montage_impossible_en_conteneur',
        code: 'montage_impossible_en_conteneur',
        message: CONSEIL,
        message_key: 'api.network.smbMountInContainer',
        params: { engine: 'docker' },
        cause: 'No such file or directory (os error 2)',
      },
    };
    await jusquAuMontage();
    cliquer('.wizard-body .scan-btn');
    await respirer();
    const erreur = hote!.querySelector('.wizard-body .wizard-error');
    expect(erreur?.textContent).toContain('rslave');
    expect(hote!.querySelector('[data-details-serveur]')?.textContent).toContain('os error 2');
  });

  it('contre-épreuve : la réponse de rc11 (phrase sans message_key) ne montrait que le générique', async () => {
    echecDuMontage = {
      statut: 500,
      corps: {
        error: 'montage_impossible_en_conteneur',
        message: 'Tune tourne dans un conteneur (docker) : … « rslave » …',
      },
    };
    await jusquAuMontage();
    cliquer('.wizard-body .scan-btn');
    await respirer();
    const erreur = hote!.querySelector('.wizard-body .wizard-error');
    expect(erreur).not.toBeNull();
    expect(erreur!.textContent, 'le conseil restait caché derrière le message générique').not.toContain('rslave');
  });
});

describe('sousDossierDuPartage', () => {
  it('garde le point et ce qui est dessous, refuse le reste', () => {
    expect(sousDossierDuPartage(POINT, POINT)).toBe(POINT);
    expect(sousDossierDuPartage(POINT, `${POINT}/`)).toBe(POINT);
    expect(sousDossierDuPartage(POINT, SOUS_DOSSIER)).toBe(SOUS_DOSSIER);
    expect(sousDossierDuPartage(`${POINT}/`, `${SOUS_DOSSIER}/Jazz/`)).toBe(`${SOUS_DOSSIER}/Jazz`);
    expect(sousDossierDuPartage(POINT, '/srv/tune/montages')).toBeNull();
    expect(sousDossierDuPartage(POINT, `${POINT}2/Jazz`)).toBeNull();
    expect(sousDossierDuPartage(POINT, `${POINT}/../nas_Autre`)).toBeNull();
    expect(sousDossierDuPartage('', SOUS_DOSSIER)).toBeNull();
    expect(sousDossierDuPartage(POINT, '')).toBeNull();
  });
});
