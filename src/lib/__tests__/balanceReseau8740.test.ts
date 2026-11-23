// @vitest-environment jsdom
//
// tune-server-rust#8740 (rc14) — décision de Bertrand du 17/11 : la balance
// gauche/droite s'applique aussi aux flux réseau (DLNA, AirPlay…), hors PURE
// et bit-perfect strict, quand Tune traite le PCM. Le serveur dit
// `applies_to_output`, `output_reason`, `requires_processed_pcm` et
// `balance` ; on monte le VRAI écran contre un serveur simulé.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import Ecran from '../../components/v2/ReaffectationCanauxV2.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { notifications } from '../stores/notifications';
import { identite, avertissementDeSortie } from '../reaffectationCanaux';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 30_000 });

const ZONE = { id: 4, name: 'Salon DrUPnP', output_type: 'dlna', state: 'playing', volume: 50,
  current_track: { id: 1, title: 'Piste' } };
const effectif = { valid: true, identity: false, bit_exact_copy: false, normalization_db: [0, 0] };
const BALANCE = { ...identite(2), enabled: true, gains_db: [[0, null], [null, -2]] };
let reponseZone: Record<string, unknown> = {};
const appels: { url: string; method: string; body: unknown }[] = [];

function etat(extra: Record<string, unknown>) {
  return { key: 'zone_4_channel_remap', saved: true, settings: BALANCE, effective: effectif,
    input_names: null, output_names: null, zone_id: 4, applied_live: false, ...extra };
}

function repondre(url: string, init?: RequestInit) {
  const p = new URL(url, 'http://localhost').pathname.replace(/^\/api\/v1/, '');
  const method = init?.method ?? 'GET';
  appels.push({ url: p, method, body: init?.body ? JSON.parse(String(init.body)) : null });
  let corps: unknown = {};
  if (p === '/channel-remap/presets') corps = { presets: [], limits: { max_channels: 8, gain_min_db: -60, gain_max_db: 12 } };
  else if (p === '/channel-remap/zones/4') corps = reponseZone;
  else if (p === '/channel-remap/zones/4/balance') corps = { ...reponseZone, balance: (appels.at(-1)!.body as any).balance };
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendreQue(cond: () => boolean, quoi: string, ms = 4_000): Promise<void> {
  const fin = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fin) throw new Error(`jamais atteint : ${quoi}`);
    await new Promise((r) => setTimeout(r, 10));
    flushSync();
  }
}

const monter = () => {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(Ecran, { target: hote, props: {} });
  flushSync();
};
const bouton = (texte: string) =>
  [...hote!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texte);
const curseur = () => hote!.querySelector<HTMLInputElement>('[data-balance] input[type="range"]');
const messages = () => get(notifications).map((n) => n.message);

beforeEach(() => {
  appels.length = 0;
  locale.set('fr');
  for (const n of get(notifications)) notifications.dismiss(n.id);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => repondre(String(url), init)));
  zones.set([ZONE] as any);
  currentZoneId.set(ZONE.id);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('#8740 rc14 — balance sur un lecteur réseau', () => {
  it('🔴 sortie réseau qui applique la balance : aucun avertissement, la condition du PCM traité est dite', async () => {
    reponseZone = etat({ applies_to_output: true, requires_processed_pcm: true, output_reason: null, balance: -21 });
    monter();
    await attendreQue(() => !!hote!.querySelector('[data-reseau-pcm]'), 'la note « Tune traite le flux »');
    expect(hote!.querySelector('[data-sortie-reseau]')).toBeNull();
    await attendreQue(() => curseur()?.value === '-21', 'le curseur posé sur la balance de la zone');
    expect(hote!.querySelector('[data-balance-valeur]')!.textContent).toBe('-21');
  });

  it('🔴 avertissement seulement quand c\'est vraiment inactif : PURE, bit-perfect, matrice non stéréo, hausse', async () => {
    const attendus: Record<string, string> = {
      pure_mode: 'Mode PURE',
      bit_perfect_strict: 'Bit-perfect strict',
      network_stereo_only: 'seule une matrice 2 → 2',
      network_gain_increase: 'sécurité du volume',
    };
    for (const [raison, texte] of Object.entries(attendus)) {
      reponseZone = etat({ applies_to_output: false, requires_processed_pcm: true, output_reason: raison });
      monter();
      await attendreQue(() => !!hote!.querySelector('[data-sortie-reseau]'), `l'avertissement ${raison}`);
      expect(hote!.querySelector('[data-sortie-reseau]')!.textContent).toContain(texte);
      expect(hote!.querySelector('[data-reseau-pcm]')).toBeNull();
      unmount(monte!); monte = null; hote!.remove(); hote = null;
    }
  });

  it('contre-épreuve : aucune règle armée, rien à avertir', () => {
    expect(avertissementDeSortie(etat({ applies_to_output: false, output_reason: 'no_rule' }) as any)).toBeNull();
    expect(avertissementDeSortie(etat({ applies_to_output: true }) as any)).toBeNull();
    expect(avertissementDeSortie(etat({}) as any)).toBeNull();
    // Serveur rc13 : `false` sans raison = lecteur réseau, l'avertissement d'avant.
    expect(avertissementDeSortie(etat({ applies_to_output: false }) as any)).toBe('v2.cr.networkOutput');
  });

  it('🔴 « Appliquer la balance » écrit la balance du curseur par PUT /zones/{id}/balance', async () => {
    reponseZone = etat({ applies_to_output: true, requires_processed_pcm: true, balance: 0 });
    monter();
    await attendreQue(() => !!bouton('Appliquer la balance') && !!curseur(), 'le curseur de balance');
    const c = curseur()!;
    c.value = '40';
    c.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(hote!.querySelector('[data-balance-valeur]')!.textContent).toBe('+40');
    bouton('Appliquer la balance')!.click();
    await attendreQue(() => appels.some((a) => a.url === '/channel-remap/zones/4/balance'), 'le PUT de la balance');
    const put = appels.find((a) => a.url === '/channel-remap/zones/4/balance')!;
    expect(put.method).toBe('PUT');
    expect(put.body).toEqual({ balance: 40 });
    await attendreQue(() => messages().length > 0, 'une notification');
    expect(messages().join(' ')).toContain('prochaine lecture');
  });
});
