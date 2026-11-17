// @vitest-environment jsdom
//
// tune-server-rust#8740 — forum-hifi.fr, fil Tune p. 92 (#914, #919) : sous
// GentooPlayer, écoute par DrUPnP (zone DLNA), « je n'arrive pas à régler
// une balance gauche / droite dans le module d'extension dédié ».
//
// Seule une sortie locale applique la matrice. L'écran disait pourtant
// « Enregistré : la réaffectation s'entendra à la prochaine lecture » sur
// une zone réseau. Le serveur dit désormais `applies_to_output` ; on monte
// le VRAI écran contre un serveur simulé et on lit ce qu'il affiche.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import Ecran from '../../components/v2/ReaffectationCanauxV2.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { notifications } from '../stores/notifications';
import { identite } from '../reaffectationCanaux';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 30_000 });

const ZONE = { id: 4, name: 'Salon DrUPnP', output_type: 'dlna', state: 'playing', volume: 50,
  current_track: { id: 1, title: 'Piste' } };
const effectif = { valid: true, identity: false, bit_exact_copy: false, normalization_db: [0, 0] };
const BALANCE = { ...identite(2), enabled: true, gains_db: [[0, null], [null, -2]] };
/** `true`, `false` ou `undefined` (serveur antérieur, champ absent). */
let applique: boolean | undefined = false;

function etat(saved: boolean) {
  const e: Record<string, unknown> = { key: 'zone_4_channel_remap', saved, settings: BALANCE, effective: effectif,
    input_names: null, output_names: null, zone_id: 4, applied_live: false };
  if (applique !== undefined) e.applies_to_output = applique;
  return e;
}

function repondre(url: string) {
  const p = new URL(url, 'http://localhost').pathname.replace(/^\/api\/v1/, '');
  let corps: unknown = {};
  if (p === '/channel-remap/presets') corps = { presets: [], limits: { max_channels: 8, gain_min_db: -60, gain_max_db: 12 } };
  else if (p === '/channel-remap/zones/4') corps = etat(true);
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
const messages = () => get(notifications).map((n) => n.message);

beforeEach(() => {
  applique = false;
  locale.set('fr');
  for (const n of get(notifications)) notifications.dismiss(n.id);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => repondre(String(url))));
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

describe('#8740 — balance réglée sur une zone dont la sortie est un lecteur réseau', () => {
  it('🔴 l\'écran dit que la sortie réseau n\'applique pas la réaffectation', async () => {
    monter();
    await attendreQue(() => !!hote!.querySelector('[data-sortie-reseau]'), 'l\'avertissement « lecteur réseau »');
    expect(hote!.querySelector('[data-sortie-reseau]')!.textContent).toContain("n'applique pas la réaffectation");
  });

  it('🔴 enregistrer ne promet plus « s\'entendra à la prochaine lecture »', async () => {
    monter();
    await attendreQue(() => !!bouton('Enregistrer pour la zone'), 'le bouton Enregistrer');
    bouton('Enregistrer pour la zone')!.click();
    await attendreQue(() => messages().length > 0, 'une notification');
    expect(messages().join(' ')).toContain("n'applique pas la réaffectation");
    expect(messages().join(' ')).not.toContain('prochaine lecture');
  });

  it('contre-épreuve : sortie locale, aucun avertissement, « prochaine lecture » inchangé', async () => {
    applique = true;
    monter();
    await attendreQue(() => !!bouton('Enregistrer pour la zone'), 'le bouton Enregistrer');
    expect(hote!.querySelector('[data-sortie-reseau]')).toBeNull();
    bouton('Enregistrer pour la zone')!.click();
    await attendreQue(() => messages().length > 0, 'une notification');
    expect(messages().join(' ')).toContain('prochaine lecture');
  });

  it('contre-épreuve : serveur antérieur (champ absent), rien n\'est affirmé', async () => {
    applique = undefined;
    monter();
    await attendreQue(() => !!bouton('Enregistrer pour la zone'), 'le bouton Enregistrer');
    expect(hote!.querySelector('[data-sortie-reseau]')).toBeNull();
  });
});
