// @vitest-environment jsdom
/**
 * renesenses/tune-server-rust#5086 — Support › Diagnostic dit « injoignable »
 * pour TOUT échec de sonde.
 *
 * Sevy (0.9.163, macOS, fil 1911) : « Serveur : injoignable », « Base de
 * données : injoignable », « Analyse : — », pas de ligne disque, alors que le
 * serveur sert. Côté serveur, les quatre routes attendaient l'écrivain SQLite
 * (lot `batch/diagnostic-support-faux-negatif-20260926`) : elles dépassaient
 * leurs 8 s ENSEMBLE. Côté écran, deux défauts rendaient ce constat illisible :
 *
 * 1. chaque sonde se repliait sur `null` quel que soit l'échec, puis `null`
 *    s'affichait « injoignable » : un délai dépassé et un 500 disaient la même
 *    chose qu'une connexion refusée ;
 * 2. la ligne disque lisait `disk.free_human` puis `disk_free`, que le serveur
 *    n'a jamais servis : il rend `disk_free_gb`. Elle affichait « — » partout.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SupportV2 from '../../components/v2/SupportV2.svelte';
import { sonder, libelleEchec, espaceLibre } from '../sondesDiagnostic';
import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import hu from '../locales/hu';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';

const respirer = (ms = 40) => new Promise((r) => setTimeout(r, ms));

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: { get: () => null },
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

describe('#5086 — sonder : nommer ce qui a échoué', () => {
  it('une réponse arrive : ok, avec sa valeur', async () => {
    expect(await sonder(Promise.resolve({ version: '1' }), 50)).toEqual({ etat: 'ok', valeur: { version: '1' } });
  });

  it('pas de réponse dans le délai : « délai », pas « injoignable »', async () => {
    expect(await sonder(new Promise(() => {}), 20)).toEqual({ etat: 'delai' });
  });

  it('un statut HTTP d’erreur : le serveur a RÉPONDU', async () => {
    const e = Object.assign(new Error('boom'), { status: 500 });
    expect(await sonder(Promise.reject(e), 50)).toEqual({ etat: 'http', statut: 500 });
  });

  it('un rejet sans statut (réseau) : injoignable', async () => {
    expect(await sonder(Promise.reject(new TypeError('Failed to fetch')), 50)).toEqual({ etat: 'injoignable' });
  });

  it('un rejet APRÈS le délai ne remonte pas en rejet non traité', async () => {
    let rejeter!: (e: unknown) => void;
    const p = new Promise((_, r) => { rejeter = r; });
    expect(await sonder(p, 10)).toEqual({ etat: 'delai' });
    rejeter(new Error('tard'));
    await respirer(5);
  });

  it('chaque échec a sa clé, et la clé existe dans les onze langues', () => {
    expect(libelleEchec({ etat: 'ok', valeur: 1 })).toBeNull();
    expect(libelleEchec({ etat: 'delai' })?.cle).toBe('v2.sup.diagTimeout');
    expect(libelleEchec({ etat: 'http', statut: 503 })).toEqual({ cle: 'v2.sup.diagHttpError', vars: { status: 503 } });
    expect(libelleEchec({ etat: 'injoignable' })?.cle).toBe('v2.sup.diagUnreachable');
    const langues = { fr, en, de, es, hu, it: it_, ja, ko, ro, sv, zh } as Record<string, Record<string, string>>;
    for (const [l, table] of Object.entries(langues)) {
      expect(table['v2.sup.diagTimeout'], `${l} : v2.sup.diagTimeout`).toBeTruthy();
      expect(table['v2.sup.diagHttpError'], `${l} : v2.sup.diagHttpError`).toContain('{status}');
    }
  });

  it('l’espace libre se lit dans `disk_free_gb`, le champ que le serveur sert', () => {
    expect(espaceLibre({ disk_free_gb: 123.44 }, 'fr')?.replace(/\s/g, ' ')).toBe('123,4 Go');
    expect(espaceLibre({ disk_free_gb: null }, 'fr')).toBeNull();
    expect(espaceLibre(null, 'fr')).toBeNull();
  });
});

describe('#5086 — l’écran Diagnostic, monté', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url);
        if (/\/system\/database\/status/.test(u)) return reponse(500, { error: 'database is locked' });
        if (/\/system\/health$/.test(u)) throw new TypeError('Failed to fetch');
        if (/\/system\/admin\/health/.test(u)) return reponse(200, { status: 'ok', disk_free_gb: 123.44, disk_total_gb: 500 });
        if (/\/system\/scan\/status/.test(u)) return reponse(200, { status: 'idle', scanning: false });
        return reponse(200, {});
      }),
    );
  });

  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    if (hote) hote.remove();
    hote = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function lignes(): Promise<Record<string, string>> {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(SupportV2, { target: hote });
    flushSync();
    await respirer(80);
    flushSync();
    const out: Record<string, string> = {};
    for (const r of Array.from(hote.querySelectorAll('.diag .dr'))) {
      const k = r.querySelector('.dk')?.textContent?.trim() ?? '';
      out[k] = r.querySelector('.dv')?.textContent?.trim() ?? '';
    }
    return out;
  }

  it('une base qui RÉPOND 500 n’est pas dite « injoignable »', async () => {
    const vu = await lignes();
    const base = vu[fr['v2.sup.diagDb']];
    expect(base, 'ligne « Base de données » absente — témoin sans objet').toBeDefined();
    expect(
      base,
      'le serveur a répondu 500 et l’écran affiche « injoignable » : c’est le faux négatif de #5086',
    ).not.toBe(fr['v2.sup.diagUnreachable']);
    expect(base).toBe(fr['v2.sup.diagHttpError'].replace('{status}', '500'));
  });

  it('sans aucune réponse HTTP, « injoignable » reste le mot juste', async () => {
    const vu = await lignes();
    expect(vu[fr['v2.sup.diagServer']]).toBe(fr['v2.sup.diagUnreachable']);
  });

  it('la ligne disque montre l’espace libre servi, pas « — »', async () => {
    const vu = await lignes();
    expect(
      vu[fr['v2.sup.diagDisk']]?.replace(/\s/g, ' '),
      'le serveur sert `disk_free_gb` et l’écran lit `disk.free_human` / `disk_free` : « — » sur tous les serveurs',
    ).toBe('123,4 Go');
  });
});
