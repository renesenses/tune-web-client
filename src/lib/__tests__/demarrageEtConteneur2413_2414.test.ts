// @vitest-environment jsdom
//
// Testeur Alex, 26/10/2026, Docker, client web v1.0.0-rc8, interface en anglais.
//
// #2413 — pendant le démarrage du serveur : toast d'ERREUR « Server error: Tune
// démarre : configuration ». Français, et présenté comme un incident alors que
// c'est la phase normale du démarrage. Le serveur envoie désormais un code
// (`server_starting`, `phase_code`) ; le client en fait une INFORMATION
// traduite, un seul toast, retiré quand le serveur répond.
//
// #2414 — sous Docker, « Restart server » : le message dit ce qui se passe et
// donne la commande si le serveur ne revient pas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

vi.mock('../retourDuServeur', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../retourDuServeur')>()),
  // Le serveur « ne revient pas » : on renonce tout de suite.
  attendreRetourEtRecharger: (o: { renoncer: (m: string) => void }) => o.renoncer('budget'),
}));

import * as api from '../api';
import { locale } from '../i18n';
import { notifications } from '../stores/notifications';
import { dialogs } from '../stores/dialogs';
import { phaseDeDemarrage } from '../demarrageServeur';
import { infoConteneur } from '../conteneurServeur';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import type { V2SettingsTabId } from '../v2Settings';

vi.setConfig({ testTimeout: 60_000 });

let reponses: (() => Response)[] = [];
let ordinaire: () => Response;

function rep(status: number, corps: unknown, type = 'application/json'): Response {
  const texte = typeof corps === 'string' ? corps : JSON.stringify(corps);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 503 ? 'Service Unavailable' : 'OK',
    headers: new Headers({ 'Content-Type': type }),
    text: async () => texte,
    json: async () => JSON.parse(texte),
  } as unknown as Response;
}

const DEMARRAGE = {
  status: 'starting', code: 'server_starting', phase_code: 'configuration',
  phase: 'configuration', message: 'Tune démarre : configuration',
};

beforeEach(() => {
  locale.set('en');
  reponses = [];
  ordinaire = () => rep(200, []);
  vi.stubGlobal('fetch', vi.fn(async () => (reponses.shift() ?? ordinaire)()));
  for (const n of get(notifications)) notifications.dismiss(n.id);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const n of get(notifications)) notifications.dismiss(n.id);
});

describe('#2413 — le démarrage du serveur est une information traduite', () => {
  it('🔴 un 503 de démarrage donne UN toast d’information, pas une erreur', async () => {
    reponses = [() => rep(503, DEMARRAGE)];
    await expect(api.getZones()).rejects.toBeTruthy();
    const toasts = get(notifications);
    expect(toasts.length, 'un toast attendu').toBe(1);
    expect(toasts[0].level, `toast « ${toasts[0].message} » posé en erreur`).toBe('info');
    expect(toasts[0].message).toBe('Tune is starting: configuration…');
    expect(toasts[0].message).not.toMatch(/Server error|démarre/);
  });

  it('🔴 le toast est retiré dès que le serveur répond normalement', async () => {
    reponses = [() => rep(503, DEMARRAGE)];
    await expect(api.getZones()).rejects.toBeTruthy();
    expect(get(notifications).length).toBe(1);
    await api.getZones(); // 200, []
    expect(get(notifications), 'le toast de démarrage est resté après le retour du serveur').toEqual([]);
  });

  it('plusieurs requêtes pendant le démarrage ne font qu’un toast, qui suit l’étape', async () => {
    reponses = [
      () => rep(503, DEMARRAGE),
      () => rep(503, DEMARRAGE),
      () => rep(503, { ...DEMARRAGE, phase_code: 'plugins', phase: 'greffons' }),
    ];
    for (let i = 0; i < 3; i++) await expect(api.getZones()).rejects.toBeTruthy();
    const toasts = get(notifications);
    expect(toasts.map((t) => t.message)).toEqual(['Tune is starting: plugins…']);
  });

  it('dans la langue de l’interface', async () => {
    locale.set('fr');
    reponses = [() => rep(503, DEMARRAGE)];
    await expect(api.getZones()).rejects.toBeTruthy();
    expect(get(notifications)[0].message).toBe('Tune démarre : configuration…');
  });

  it('un serveur d’avant le code structuré (phrase française seule) est reconnu aussi', async () => {
    reponses = [() => rep(503, { status: 'starting', phase: 'base de données', message: 'Tune démarre : base de données' })];
    await expect(api.getZones()).rejects.toBeTruthy();
    const t = get(notifications);
    expect(t.length).toBe(1);
    expect(t[0].level).toBe('info');
    expect(t[0].message).toBe('Tune is starting: database…');
    expect(phaseDeDemarrage({ status: 'starting' })).toBe('');
    expect(phaseDeDemarrage({ status: 'ok' })).toBeNull();
  });

  it('une vraie panne 503 garde son bandeau d’erreur', async () => {
    reponses = [() => rep(503, 'base injoignable', 'text/plain')];
    await expect(api.getZones()).rejects.toBeTruthy();
    const t = get(notifications);
    expect(t.length).toBe(1);
    expect(t[0].level).toBe('error');
    // #2417 : un texte brut du serveur n'est plus montré ; le bandeau dit le
    // message générique, le brut reste dans le détail.
    expect(t[0].message).toBe('The server could not complete the request.');
  });
});

describe('#2414 — Restart server sous Docker', () => {
  class Inerte { observe() {} unobserve() {} disconnect() {} }
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, unknown> | null = null;
  let questions: string[] = [];

  async function monterSante(env: Record<string, unknown>) {
    preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
    vi.stubGlobal('ResizeObserver', Inerte);
    vi.stubGlobal('IntersectionObserver', Inerte);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/system/env')) return rep(200, env);
      if (url.includes('/system/health')) return rep(200, { status: 'ok' });
      if (url.includes('/system/restart')) return rep(200, { status: 'restarting' });
      return rep(200, url.includes('/zones') || url.includes('/devices') ? [] : {});
    }));
    v2SettingsTarget.set({ tab: 'system' as V2SettingsTabId, section: 'health' });
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(SettingsV2, { target: hote, props: {} });
    for (let i = 0; i < 12; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
    return hote;
  }

  async function cliquerRedemarrer(h: HTMLElement, reponse: boolean) {
    questions = [];
    vi.spyOn(dialogs, 'confirm').mockImplementation(async (m: string) => { questions.push(m); return reponse; });
    const b = Array.from(h.querySelectorAll<HTMLButtonElement>('[data-actions-serveur] button'))
      .find((x) => /Restart server/.test(x.textContent ?? ''))!;
    b.click();
    for (let i = 0; i < 12; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
  }

  afterEach(() => {
    if (monte) { try { unmount(monte); } catch { /* sans objet */ } }
    monte = null;
    hote?.remove();
    hote = null;
    v2SettingsTarget.set(null);
  });

  it('🔴 avant de redémarrer, la confirmation dit que Tune tourne dans Docker', async () => {
    const h = await monterSante({ container: 'docker', container_id: '3f2a9c1b7d44' });
    await cliquerRedemarrer(h, false);
    expect(questions.length, 'aucune confirmation').toBe(1);
    expect(questions[0]).toContain('Tune runs in Docker');
    expect(questions[0]).toContain('docker restart 3f2a9c1b7d44');
  });

  it('🔴 si le serveur ne revient pas, le message nomme Docker, la commande et la politique', async () => {
    const h = await monterSante({ container: 'docker', container_id: null });
    await cliquerRedemarrer(h, true);
    const erreurs = get(notifications).filter((n) => n.level === 'error').map((n) => n.message);
    const msg = erreurs.find((m) => /came back|come back|Docker/i.test(m));
    expect(msg, `aucun message quand le serveur ne revient pas : [${erreurs.join(' | ')}]`).toBeTruthy();
    expect(msg).toContain('Tune runs in Docker');
    expect(msg).toContain('docker restart <name>');
    expect(msg).toContain('restart: unless-stopped');
    expect(msg).not.toContain('reload the page in a moment');
  });

  it('hors conteneur, rien ne change', async () => {
    const h = await monterSante({ container: null });
    await cliquerRedemarrer(h, true);
    expect(questions[0]).toBe('Restart the Tune server? Any active playback will be interrupted.');
    const erreurs = get(notifications).filter((n) => n.level === 'error').map((n) => n.message);
    expect(erreurs.some((m) => m.includes('The server hasn\'t come back')), `[${erreurs.join(' | ')}]`).toBe(true);
    expect(erreurs.some((m) => /Docker/.test(m))).toBe(false);
  });

  it('le moteur détermine la commande', () => {
    expect(infoConteneur({ container: 'docker', container_id: 'abc123abc123' })).toEqual({
      moteur: 'Docker', commande: 'docker restart abc123abc123',
    });
    expect(infoConteneur({ container: 'podman' })?.commande).toBe('podman restart <name>');
    expect(infoConteneur({ container: 'kubernetes' })?.moteur).toBe('Kubernetes');
    expect(infoConteneur({ container: null })).toBeNull();
    expect(infoConteneur(undefined)).toBeNull();
  });
});
