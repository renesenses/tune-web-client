// @vitest-environment jsdom
//
// Assistant SMB — renesenses/tune-server-rust#3637 : les partages d'un hôte
// DÉCOUVERT ne s'affichaient jamais.
//
// Les deux bouts, relevés au tag v0.9.142 :
//
//   • `GET /network/shares` (`tune-server/src/routes/network.rs:228-236`) fait
//     un balayage mDNS `_smb._tcp.local.` et rend, pour chaque hôte,
//     `{id, name, host, hostname, port, protocol, available}`. AUCUN champ
//     `shares`, et l'`id` est la CHAÎNE `smb://192.168.x.y`.
//   • `SmbWizard.svelte` déclarait `shares: string[]` obligatoire, lisait
//     `share.shares.length` au rendu de la liste comme au clic, puis se
//     rabattait sur `GET /network/shares/{id}` — une route qui extrait un
//     `Path<i64>` (`network.rs:1628-1630`) et rend la ligne d'un MONTAGE
//     enregistré, jamais la liste des partages d'un hôte.
//
// 🔴 CES TÉMOINS APPELLENT, ILS NE LISENT PAS. On monte le vrai assistant, on
// stube `fetch` avec la charge utile LITTÉRALE du serveur — sans champ
// `shares` —, on clique, et on regarde les URL que `fetch` a réellement
// reçues. Remettre `shares` dans la réponse du serveur maquillerait le
// défaut : c'est justement pour cela qu'il n'y est pas ici.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SmbWizard from '../../components/SmbWizard.svelte';

/** Ce que `list_shares` rend vraiment : un hôte, sans ses partages. */
const HOTE_DECOUVERT = {
  id: 'smb://192.168.1.50',
  name: 'NAS-Salon',
  host: '192.168.1.50',
  hostname: 'nas-salon.local',
  port: 445,
  protocol: 'smb',
  available: true,
};

/** Ce que `scan-host` rend vraiment : un TABLEAU NU d'objets de partage. */
const PARTAGES_DE_L_HOTE = [
  { name: 'Musique', type: 'Disk', host: '192.168.1.50', protocol: 'smb', path: '//192.168.1.50/Musique' },
  { name: 'Photos', type: 'Disk', host: '192.168.1.50', protocol: 'smb', path: '//192.168.1.50/Photos' },
];

let appels: { url: string; method: string }[] = [];

function corpsPour(url: string): unknown {
  if (url.includes('/network/scan-host')) return PARTAGES_DE_L_HOTE;
  if (/\/network\/shares(\?|$)/.test(url)) return [HOTE_DECOUVERT];
  // `/network/shares/{id}` : la route de détail d'un MONTAGE. Sur un
  // identifiant d'hôte elle ne peut que refuser — on le rend tel quel pour
  // que l'appel fautif se voie plutôt qu'il ne se devine.
  if (url.includes('/network/shares/')) return { erreur: 'Path<i64> refuse smb://…' };
  return {};
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

function poserAssistant(): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SmbWizard, {
    target: hote,
    props: { onClose: () => {}, onMusicDirsChanged: () => {} },
  });
  flushSync();
  return hote;
}

const respirer = () => new Promise((r) => setTimeout(r, 0));

/** Le bouton « Analyser le réseau », celui du bloc `.scan-actions`. */
function boutonBalayage(el: HTMLElement): HTMLButtonElement {
  const b = el.querySelector('.scan-actions .scan-btn') as HTMLButtonElement;
  expect(b, "le bouton de balayage réseau a disparu de l'assistant").not.toBeNull();
  return b;
}

async function balayerLeReseau(el: HTMLElement) {
  boutonBalayage(el).click();
  await respirer();
  await respirer();
  flushSync();
}

const lignesHotes = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('.shares-list .share-item')) as HTMLButtonElement[];

const nomsDesPartagesAffiches = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('.sub-shares .share-item.sub')).map(
    (b) => b.textContent?.trim() ?? '',
  );

beforeEach(() => {
  appels = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      appels.push({ url: String(url), method: (init?.method ?? 'GET').toUpperCase() });
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

describe("#3637 — l'assistant SMB affiche les partages d'un hôte découvert", () => {
  it("rend la liste des hôtes découverts, alors qu'ils ne portent aucun champ `shares`", async () => {
    const el = poserAssistant();
    await balayerLeReseau(el);

    // Première moitié du défaut : `{#if share.shares.length > 0}` dans le
    // `{#each}` lisait une propriété de `undefined`. Le rendu ne pouvait pas
    // aboutir.
    const lignes = lignesHotes(el);
    expect(lignes.length, "aucun hôte rendu — le gabarit a buté sur `shares` absent").toBe(1);
    expect(lignes[0].textContent).toContain('NAS-Salon');
  });

  it("le clic sur un hôte découvert APPELLE `scan-host` avec son ADRESSE", async () => {
    const el = poserAssistant();
    await balayerLeReseau(el);
    lignesHotes(el)[0].click();
    await respirer();
    await respirer();
    flushSync();

    const vers = (motif: RegExp) => appels.filter((a) => motif.test(a.url));
    const scans = vers(/\/network\/scan-host\?/);
    expect(
      scans.length,
      `\`scan-host\` n'a pas été appelée ; appels vus : ${appels.map((a) => `${a.method} ${a.url}`).join(' | ')}`,
    ).toBe(1);
    expect(scans[0].url).toContain('host=192.168.1.50');
    expect(scans[0].url).toContain('protocol=smb');
    expect(scans[0].method).toBe('GET');

    // Contre-épreuve, l'autre moitié : la route de détail d'un MONTAGE ne doit
    // plus être sollicitée. Elle attend un entier ; `smb%3A%2F%2F192.168.1.50`
    // était rejeté avant même d'entrer dans le gestionnaire, et le `catch`
    // ramenait « aucun partage ».
    expect(
      vers(/\/network\/shares\/[^?]/).map((a) => a.url),
      "l'assistant appelle encore /network/shares/{id} avec un identifiant d'hôte",
    ).toEqual([]);
  });

  it('affiche les partages rendus par le serveur, et non « aucun partage »', async () => {
    const el = poserAssistant();
    await balayerLeReseau(el);
    lignesHotes(el)[0].click();
    await respirer();
    await respirer();
    flushSync();

    // Le cœur du ticket : des NOMS DE PARTAGES à l'écran pour un hôte
    // DÉCOUVERT. Un `shares: []` vide côté serveur aurait rendu la liste vide
    // « proprement » sans rien régler — ce test-ci ne s'en contenterait pas.
    expect(nomsDesPartagesAffiches(el)).toEqual(['Musique', 'Photos']);
    expect(el.querySelector('.sub-shares .muted'), '« aucun partage » est affiché').toBeNull();
  });

  it("le chemin par ADRESSE SAISIE continue de marcher, et n'appelle pas `scan-host` deux fois", async () => {
    const el = poserAssistant();
    const champ = el.querySelector('.manual-row .auth-input') as HTMLInputElement;
    expect(champ, "le champ d'adresse manuelle a disparu").not.toBeNull();
    champ.value = '\\\\192.168.1.50\\Musique';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    (el.querySelector('.manual-row .scan-btn') as HTMLButtonElement).click();
    await respirer();
    await respirer();
    flushSync();

    // `scanManualHost` remplit déjà `shares` : `selectHost` doit s'en servir
    // et NE PAS relancer un balayage.
    expect(appels.filter((a) => /\/network\/scan-host\?/.test(a.url)).length).toBe(1);
    expect(nomsDesPartagesAffiches(el)).toEqual(['Musique', 'Photos']);
    // Le partage cité dans l'adresse est pré-sélectionné (#1846). La
    // comparaison portait sur les OBJETS rendus par `scan-host` et appelait
    // `nom.toLowerCase()` dessus : elle levait, la pré-sélection ne se faisait
    // jamais, et le message brut de JavaScript s'affichait comme une erreur de
    // balayage alors que le balayage avait réussi.
    const choisi = el.querySelector('.sub-shares .share-item.sub.selected');
    expect(choisi?.textContent?.trim()).toBe('Musique');
    expect(
      el.querySelector('.wizard-error')?.textContent ?? null,
      'une erreur est affichée alors que le balayage a abouti',
    ).toBeNull();
  });
});
