// @vitest-environment jsdom
//
// renesenses/tune-web-client#1577 — Didier (fil 1904) : « Est-il possible de
// glisser quelque part un indicateur toujours visible de mise à jour en cours
// de la base ? » Il avait programmé une analyse à 22 h et n'a jamais pu voir
// si elle tournait : l'avancement n'était lu que par les Réglages et Tune
// Health.
//
// 🔴 CE BANC MONTE LA BARRE LATÉRALE — présente sur tous les écrans — et fait
// parler le VRAI bus d'événements (`tuneWS`) comme le serveur le ferait
// pendant une analyse planifiée : aucun écran de Réglages n'est monté.
//
// Contre-épreuve (Sidebar.svelte d'origin/main) : les cinq témoins virent
// au rouge — aucun indicateur n'est jamais peint.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import SidebarV2 from '../../components/v2/Sidebar.svelte';
import { tuneWS } from '../websocket';
import { activeView } from '../stores/navigation';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { terminerAvancement } from '../analyseBibliotheque';
import { locale } from '../i18n';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

const reponse = (corps: unknown) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => JSON.stringify(corps),
} as unknown as Response);
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function jusqua(condition: () => boolean, borne = 3000): Promise<void> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return;
    if (Date.now() >= fin) return;
    await respirer();
  }
}

/** Ce que répond `GET /system/scan/status`. */
let scanning = false;
let hote: HTMLElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  scanning = false;
  terminerAvancement();
  locale.set('fr');
  activeView.set('home');
  v2SettingsTarget.set(null);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    if (/\/system\/scan\/status/.test(String(url))) return reponse({ scanning });
    return reponse([]);
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  terminerAvancement();
  activeView.set('home');
  v2SettingsTarget.set(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function monter() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SidebarV2, { target: hote });
  flushSync();
}
/** Le serveur parle : on passe par les abonnés réels de `tuneWS`. */
function emettre(type: string, data?: unknown) {
  ((tuneWS as any).handlers as ((e: unknown) => void)[]).slice().forEach((h) => h({ type, data }));
  flushSync();
}
const indicateur = () => hote?.querySelector<HTMLButtonElement>('button.analyse') ?? null;

describe('#1577 — une analyse en cours se voit hors des Réglages', () => {
  it('🔴 une analyse lancée AILLEURS (planification) apparaît dans la barre, avec son avancement', () => {
    monter();
    expect(indicateur(), 'rien ne tourne : pas d’indicateur').toBeNull();

    // Parcours des dossiers : le serveur ne connaît pas encore le total.
    emettre('library.scan.progress', { phase: 'indexing', scanned: 1840, total: 0 });
    expect(indicateur(), 'l’analyse tourne et la barre n’en dit rien').not.toBeNull();
    expect(indicateur()!.textContent).toContain('1');
    expect(indicateur()!.textContent).toContain('840');
    expect(indicateur()!.textContent).not.toContain('%');

    // Le total arrive : le pourcentage aussi.
    emettre('library.scan.progress', { phase: 'files', scanned: 900, total: 3000 });
    expect(indicateur()!.textContent?.trim()).toBe(fr['v2.nav.scanRunningPct'].replace('{p}', '30'));
    expect(indicateur()!.getAttribute('title')).toBe(fr['v2.nav.scanRunningHint']);
  });

  it('🔴 il disparaît à la fin de l’analyse', () => {
    monter();
    emettre('library.scan.progress', { phase: 'files', scanned: 10, total: 20 });
    expect(indicateur()).not.toBeNull();
    emettre('library.scan.completed', { removed: 0 });
    expect(indicateur(), 'l’analyse est finie et l’indicateur reste').toBeNull();
  });

  it('🔴 il mène aux Réglages › Bibliothèque', () => {
    monter();
    emettre('library.scan.progress', { phase: 'files', scanned: 10, total: 20 });
    indicateur()!.click();
    flushSync();
    expect(get(activeView)).toBe('settings');
    // La cible est consommée par l'écran Réglages, absent ici : elle reste lisible.
    expect(get(v2SettingsTarget)?.tab).toBe('library');
  });

  it('🔴 une analyse DÉJÀ en cours à l’ouverture se signale sans attendre un événement', async () => {
    scanning = true;
    monter();
    await jusqua(() => !!indicateur());
    expect(indicateur(), 'le serveur scanne et la barre se tait').not.toBeNull();
    expect(indicateur()!.textContent?.trim()).toBe(fr['v2.nav.scanRunning']);
  });

  it('un `completed` perdu : le contrôle périodique baisse l’indicateur quand le serveur ne scanne plus', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    scanning = true;
    monter();
    emettre('library.scan.progress', { phase: 'files', scanned: 10, total: 20 });
    expect(indicateur()).not.toBeNull();
    scanning = false; // l'analyse s'est finie pendant une coupure du flux
    vi.advanceTimersByTime(10_000);
    await jusqua(() => !indicateur());
    expect(indicateur(), 'l’indicateur survit à la fin de l’analyse').toBeNull();
  });
});
