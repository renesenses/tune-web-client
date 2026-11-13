// @vitest-environment jsdom
// tune-server-rust#8615 (fil 2784, laguespa) — décision de Bertrand du 13/11 :
// l'option de réveil « Interrompre la lecture en cours », COCHÉE par défaut,
// part au serveur (`interrupt_playback`) à la création comme à l'édition.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import AlarmesV2 from '../../components/v2/AlarmesV2.svelte';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let envoyes: { method: string; body: any }[] = [];
let liste: any[] = [];
const json = (c: unknown) => new Response(JSON.stringify(c), { status: 200, headers: { 'Content-Type': 'application/json' } });
async function attendre(ms = 0, tours = 6) {
  for (let i = 0; i < tours; i++) { await new Promise((r) => setTimeout(r, ms)); flushSync(); }
}
const reveil = (extra: Record<string, unknown>) => ({
  id: 3, name: 'Matin', time: '07:00', days: '0,1,2,3,4', days_of_week: '1111100',
  skip_holidays: false, holiday_country: 'FR', zone_id: 1, source_type: 'radio',
  source_id: 'https://icecast.radiofrance.fr/fip-hifi.aac', source_name: 'FIP',
  volume: 30, fade_in_seconds: 30, enabled: true, ...extra,
});

beforeEach(() => {
  envoyes = [];
  liste = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/alarms') && (init?.method === 'POST' || init?.method === 'PUT')) {
      envoyes.push({ method: init.method, body: JSON.parse(String(init.body)) });
      return json({ id: 3 });
    }
    if (u.includes('/alarms')) return json(liste);
    if (u.includes('/zones')) return json([{ id: 1, name: 'Chambre' }]);
    return json({});
  }));
});
afterEach(() => { if (monte) unmount(monte); hote?.remove(); monte = null; hote = null; vi.unstubAllGlobals(); });

async function monter() {
  hote = document.createElement('div'); document.body.appendChild(hote);
  monte = mount(AlarmesV2, { target: hote, props: {} });
  await attendre();
  return hote;
}
const caseInterrompre = (h: HTMLElement) =>
  h.querySelector('[data-reveil-interrompre] input[type="checkbox"]') as HTMLInputElement;
const enregistrer = async (h: HTMLElement) => {
  (Array.from(h.querySelectorAll('button')).find((b) => b.classList.contains('primaire') && !!b.closest('.form')) as HTMLElement).click();
  await attendre();
};

describe('#8615 — « Interrompre la lecture en cours »', () => {
  it('🔴 un nouveau réveil l’a cochée, et l’envoie', async () => {
    const h = await monter();
    (Array.from(h.querySelectorAll('button')).find((b) => b.classList.contains('primaire')) as HTMLElement).click();
    flushSync();
    const c = caseInterrompre(h);
    expect(c, 'la case est visible au niveau débutant').toBeTruthy();
    expect(c.checked).toBe(true);
    await enregistrer(h);
    expect(envoyes.at(-1)?.body.interrupt_playback).toBe(true);
  });

  it('décochée, elle part à false', async () => {
    liste = [reveil({ interrupt_playback: true })];
    const h = await monter();
    (h.querySelector('.carte.reveil .corps') as HTMLElement).click();
    flushSync();
    const c = caseInterrompre(h);
    expect(c.checked).toBe(true);
    c.click();
    flushSync();
    await enregistrer(h);
    expect(envoyes.at(-1)).toMatchObject({ method: 'PUT', body: { interrupt_playback: false } });
  });

  it('un réveil décoché le reste quand on l’active ou le désactive', async () => {
    liste = [reveil({ interrupt_playback: false })];
    const h = await monter();
    (h.querySelector('.carte.reveil .bascule input') as HTMLInputElement).click();
    await attendre();
    expect(envoyes.at(-1)?.body.interrupt_playback).toBe(false);
  });

  it('un réveil d’un serveur d’avant (clé absente) s’ouvre cochée', async () => {
    liste = [reveil({})];
    const h = await monter();
    (h.querySelector('.carte.reveil .corps') as HTMLElement).click();
    flushSync();
    expect(caseInterrompre(h).checked).toBe(true);
  });

  it('le libellé et son aide existent dans les quinze langues', () => {
    for (const langue of ONZE_LANGUES) {
      expect(dictionnaire(langue)['alarms.interruptPlayback'], langue).toBeTruthy();
      expect(dictionnaire(langue)['alarms.interruptPlaybackHint'], langue).toBeTruthy();
    }
  });
});
