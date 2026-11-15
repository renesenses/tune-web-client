// @vitest-environment jsdom
//
// Assistant SMB — renesenses/tune-server-rust#8628 (fil 2788, Synology en
// Docker) : l'image n'avait pas `smbclient`, et le clic sur un hôte DÉCOUVERT
// affichait « aucun partage » sans dire pourquoi.
//
// Le serveur (PR #8637) rend désormais, en échec,
// `{"shares": [], "code": "smbclient_missing", "error": "<message traduit>"}`.
// La saisie manuelle affichait déjà `error` ; `selectHost` le jetait. On monte
// le vrai assistant, on stube `fetch` avec cette charge utile, on clique sur
// l'hôte, et on lit ce que l'écran montre.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SmbWizard from '../../components/partages/SmbWizard.svelte';

const HOTE_DECOUVERT = {
  id: 'smb://192.168.1.60',
  name: 'DiskStation',
  host: '192.168.1.60',
  hostname: 'diskstation.local',
  port: 445,
  protocol: 'smb',
  available: true,
};

const MESSAGE_SERVEUR =
  "smbclient est introuvable sur ce serveur : impossible de lister les partages SMB.";

let reponseScan: unknown = null;

function corpsPour(url: string): unknown {
  if (url.includes('/network/scan-host')) return reponseScan;
  if (/\/network\/shares(\?|$)/.test(url)) return [HOTE_DECOUVERT];
  return {};
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));

async function cliquerSurLHoteDecouvert(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SmbWizard, {
    target: hote,
    props: { onClose: () => {}, onMusicDirsChanged: () => {} },
  });
  flushSync();
  (hote.querySelector('.scan-actions .scan-btn') as HTMLButtonElement).click();
  await respirer();
  await respirer();
  flushSync();
  const ligne = hote.querySelector('.shares-list .share-item') as HTMLButtonElement;
  expect(ligne, "aucun hôte découvert rendu").not.toBeNull();
  ligne.click();
  await respirer();
  await respirer();
  flushSync();
  return hote;
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const corps = corpsPour(String(url));
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => corps,
        text: async () => JSON.stringify(corps),
      } as unknown as Response;
    }),
  );
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
  vi.unstubAllGlobals();
});

describe("#8628 — l'erreur de scan-host s'affiche aussi pour un hôte découvert", () => {
  it('affiche le message traduit du serveur quand smbclient manque', async () => {
    reponseScan = { shares: [], code: 'smbclient_missing', error: MESSAGE_SERVEUR };
    const el = await cliquerSurLHoteDecouvert();

    const erreur = el.querySelector('.sub-shares .wizard-error');
    expect(erreur, "la raison rendue par le serveur n'est pas affichée").not.toBeNull();
    expect(erreur!.textContent).toContain(MESSAGE_SERVEUR);
    expect(el.querySelector('.sub-shares .muted'), '« aucun partage » sans raison').toBeNull();
  });

  it("ouvre les identifiants quand le serveur parle d'accès refusé", async () => {
    reponseScan = { shares: [], error: 'Authentication failed: NT_STATUS_ACCESS_DENIED' };
    const el = await cliquerSurLHoteDecouvert();

    expect(el.querySelector('.sub-shares .wizard-error')!.textContent).toContain('ACCESS_DENIED');
    expect(el.querySelector('.scan-credentials'), 'les identifiants ne sont pas proposés').not.toBeNull();
  });

  it('contre-épreuve : un hôte sans partage ni erreur garde « aucun partage »', async () => {
    reponseScan = [];
    const el = await cliquerSurLHoteDecouvert();

    expect(el.querySelector('.sub-shares .wizard-error')).toBeNull();
    expect(el.querySelector('.sub-shares .muted')).not.toBeNull();
  });
});
