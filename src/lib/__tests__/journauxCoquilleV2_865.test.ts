// @vitest-environment jsdom
//
// « Nouvelle interface : ni page Journaux, ni téléchargement des journaux »
// — renesenses/tune-web-client#865.
//
// 🔴 LE DÉFAUT LE PLUS CHER DE LA SEMAINE, ET LE MOINS SPECTACULAIRE.
//
// Chaque fois qu'on demande ses journaux à un testeur, celui qui est en `?v2`
// ne peut pas les fournir : il n'y a ni page, ni bouton, ni fichier. Le client
// actuel les sert depuis `DiagnosticsView` — vue `diagnostics` — mais
// `App.svelte` en est le SEUL montage, et `ShellV2` rend `TuneHealthV2` sous
// cette même vue. Écrit, pas branché.
//
// 🔴 CES TÉMOINS APPELLENT, ILS NE LISENT PAS.
//
// Chercher « journaux » dans le source de `TuneHealthV2.svelte` resterait vert
// devant un bouton mort. Ici on MONTE l'écran de la coquille v2, on clique son
// bouton d'export, et on regarde deux choses : l'URL que `fetch` a reçue, et
// le fichier que le navigateur s'est vu remettre — son nom et son contenu.
//
// ⚠️ Aucune ligne de journal réelle n'apparaît ici. Tout le texte est fabriqué.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import TuneHealthV2 from '../../components/v2/TuneHealthV2.svelte';
import {
  construireFichierJournaux,
  enteteJournaux,
  nomFichierJournaux,
  telechargerTexte,
} from '../journaux';

/** Deux lignes INVENTÉES, de la forme d'un journal — jamais un vrai extrait. */
const JOURNAL_FICTIF =
  '2026-01-01T00:00:00Z  INFO  temoin: premiere ligne fabriquee\n' +
  '2026-01-01T00:00:01Z  WARN  temoin: seconde ligne fabriquee';

let urls: string[] = [];
let dernierBlob: Blob | null = null;
let ancresCliquees: string[] = [];

/** Les collections que l'écran lit au montage : la forme suffit. */
const VIDE = /\/(zones|devices|profiles|shortcuts|collections)(\?|\/|$)/;

function corpsPour(url: string): unknown {
  if (url.includes('/system/logs')) return { logs: JOURNAL_FICTIF, source: 'temoin-source' };
  if (url.includes('/system/diagnostics')) return { server_version: '9.9.9-temoin', os: 'OS-temoin' };
  if (VIDE.test(url)) return [];
  return {};
}

function enveloppe(corps: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

function poserLeServeur(sur: (url: string) => unknown = corpsPour) {
  vi.stubGlobal('fetch', vi.fn(async (input: any) => {
    const u = typeof input === 'string' ? input : String(input?.url ?? input);
    urls.push(u);
    const corps = sur(u);
    if (corps instanceof Error) throw corps;
    return enveloppe(corps);
  }));
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  urls = [];
  dernierBlob = null;
  ancresCliquees = [];
  poserLeServeur();
  // jsdom n'implémente pas les URL d'objet. On les remplace sur l'objet réel —
  // le remplacer en entier casserait `new URL(...)` ailleurs dans le client.
  (URL as any).createObjectURL = (b: Blob) => { dernierBlob = b; return 'blob:temoin'; };
  (URL as any).revokeObjectURL = () => {};
});

afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  delete (URL as any).createObjectURL;
  delete (URL as any).revokeObjectURL;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * Intercepte l'ancre de téléchargement : jsdom refuse de naviguer vers un
 * `blob:`, et on veut de toute façon lire ce qui a été remis.
 */
function guetterLAncre() {
  const vraiCreer = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((nom: string, ...reste: any[]) => {
    const el = vraiCreer(nom as any, ...reste);
    if (String(nom).toLowerCase() === 'a') {
      (el as HTMLAnchorElement).click = () => { ancresCliquees.push((el as HTMLAnchorElement).download); };
    }
    return el;
  }) as any);
}

const souffler = (ms = 40) => new Promise((r) => setTimeout(r, ms));

describe('#865 — la coquille v2 donne accès aux journaux', () => {
  it("l'écran de santé v2 porte le bloc des journaux, et son export produit un FICHIER", async () => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(TuneHealthV2, { target: hote });
    flushSync();
    await souffler(80);
    flushSync();

    // 1. Le bloc existe. Avant le correctif, cet écran ne parlait QUE des
    //    traitements de fond : il n'y avait ni bloc, ni bouton, ni fichier.
    const bloc = hote.querySelector('.journaux');
    expect(bloc, 'la coquille v2 n’expose aucun accès aux journaux — c’est #865').toBeTruthy();

    const boutons = Array.from(bloc!.querySelectorAll('button'));
    expect(boutons.length, 'le bloc des journaux doit porter AFFICHER et EXPORTER').toBe(2);

    // 2. Afficher : le serveur est interrogé, et les lignes arrivent à l'écran.
    guetterLAncre();
    boutons[0].click();
    await souffler(80);
    flushSync();
    expect(
      urls.some((u) => u.includes('/system/logs')),
      'la coquille v2 ne demande jamais les journaux au serveur',
    ).toBe(true);
    expect(hote.querySelector('.jtexte')?.textContent ?? '').toContain('premiere ligne fabriquee');

    // 3. Exporter : un fichier est remis, il porte le nom du contrat, et il
    //    contient les journaux — pas une coquille vide.
    boutons[1].click();
    await souffler(80);
    flushSync();

    expect(ancresCliquees.length, 'aucun fichier n’a été remis au navigateur').toBe(1);
    expect(ancresCliquees[0]).toMatch(/^tune-logs-\d{4}-\d{2}-\d{2}\.txt$/);

    const remis = await dernierBlob!.text();
    expect(remis).toContain(JOURNAL_FICTIF);
    expect(remis).toContain('9.9.9-temoin');
    expect(remis).toContain('temoin-source');
  });
});

describe('#865 — le geste des journaux, partagé par les deux coquilles', () => {
  it('le nom du fichier est le CONTRAT que les testeurs citent', () => {
    expect(nomFichierJournaux(new Date('2026-09-12T22:30:00Z'))).toBe('tune-logs-2026-09-12.txt');
  });

  it("l'en-tête dit la version, le système et la source", () => {
    const e = enteteJournaux('0.9.146', 'Linux', 'journald');
    expect(e).toContain('Tune Server 0.9.146');
    expect(e).toContain('Linux');
    expect(e).toContain('journald');
  });

  it('le fichier composé porte l’en-tête PUIS les journaux, sur mille lignes', async () => {
    const f = await construireFichierJournaux({ quand: new Date('2026-09-12T00:00:00Z') });
    expect(f.nom).toBe('tune-logs-2026-09-12.txt');
    expect(f.contenu.startsWith('Tune Server 9.9.9-temoin')).toBe(true);
    expect(f.contenu.endsWith(JOURNAL_FICTIF)).toBe(true);
    expect(urls.some((u) => u.includes('/system/logs?lines=1000'))).toBe(true);
  });

  it('un serveur sans fiche de diagnostic ne coûte PAS l’export', async () => {
    poserLeServeur((u) => (u.includes('/system/diagnostics') ? new Error('route absente') : corpsPour(u)));
    const f = await construireFichierJournaux();
    expect(f.contenu).toContain(JOURNAL_FICTIF);
    expect(f.contenu).toContain('inconnue');
  });

  it('un serveur sans aucune ligne ne remet pas un fichier VIDE', async () => {
    poserLeServeur((u) => (u.includes('/system/logs') ? { logs: '', source: 'vide' } : corpsPour(u)));
    const f = await construireFichierJournaux({ siVide: 'AUCUN JOURNAL' });
    expect(f.contenu).toContain('AUCUN JOURNAL');
  });

  it('la remise passe par une ancre POSÉE dans le document', () => {
    // Une ancre détachée n'ouvre rien dans plusieurs webviews : c'est de là que
    // venait l'export muet. On vérifie qu'elle est bien dans le document au
    // moment du clic, et qu'elle en ressort après.
    let dansLeDocumentAuClic = false;
    const faux = {
      createElement: () => {
        const a = document.createElement('a');
        a.click = () => { dansLeDocumentAuClic = document.body.contains(a); };
        return a;
      },
      body: document.body,
    } as unknown as Document;
    telechargerTexte('tune-logs-2026-09-12.txt', 'contenu fabrique', faux);
    expect(dansLeDocumentAuClic, 'l’ancre a été cliquée hors du document').toBe(true);
    expect(document.querySelectorAll('a[download]').length, 'l’ancre n’a pas été retirée').toBe(0);
  });

  it('les TROIS anciens appelants passent par le module, sans copie locale', async () => {
    // Il y avait trois copies du geste — `DiagnosticsView`, `SettingsView`, et
    // rien du tout côté v2 — et elles avaient déjà divergé : celle de
    // `SettingsView` lisait la route en `.text()` alors qu'elle rend du JSON,
    // et exportait donc l'objet JSON échappé au lieu des lignes.
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
    for (const f of [
      '../../components/DiagnosticsView.svelte',
      '../../components/SettingsView.svelte',
      '../../components/v2/TuneHealthV2.svelte',
    ]) {
      const src = lire(f);
      expect(src.includes("/journaux'"), `${f} n’emprunte pas le module des journaux`).toBe(true);
      expect(
        /a\.download\s*=\s*`tune-logs-/.test(src),
        `${f} refabrique le nom de fichier au lieu de l’emprunter`,
      ).toBe(false);
    }
  });
});
