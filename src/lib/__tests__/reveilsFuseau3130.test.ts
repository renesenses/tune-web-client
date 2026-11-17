// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';
import AlarmesV2 from '../../components/v2/AlarmesV2.svelte';
import ArretProgrammeV2 from '../../components/v2/ArretProgrammeV2.svelte';
let host: HTMLDivElement;
let app: ReturnType<typeof mount> | undefined;
let config: Record<string, unknown>;
let writes: unknown[];
let refuse: boolean;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const wait = async () => { for (let i=0;i<8;i++) { await new Promise(r => setTimeout(r,0)); flushSync(); } };
beforeEach(() => {
  config = { alarms_timezone: '' }; writes = []; refuse = false;
  host = document.createElement('div'); document.body.append(host);
  vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes('/system/config')) {
      if (init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)); writes.push(body);
        if (refuse) return json({error:'refus'}, 400);
        Object.assign(config,body);
      }
      return json(config);
    }
    if (String(url).includes('/settings/scheduled-stop')) return json({ scheduled_stop:{enabled:true,time:'23:00',days_of_week:'1111111',zone_ids:null}, next_stop_at:'2026-11-18T23:00:00+01:00', timezone:config.alarms_timezone, poweroff_available:false });
    if (String(url).includes('/alarms')) return json([{ id:1,name:'Matin',time:'11:10',days_of_week:'1111100',enabled:1,source_type:'radio',source_id:'fip',timezone:'Europe/Paris',next_fired_at:'2026-11-18T10:10:00Z' }]);
    if (String(url).includes('/zones')) return json([]);
    return json({});
  }));
});
afterEach(() => { if(app) unmount(app); app=undefined; host.remove(); vi.unstubAllGlobals(); });
async function show() { app=mount(AlarmesV2,{target:host}); await wait(); }
function input() { return host.querySelector<HTMLInputElement>('[data-fuseau-saisie]'); }
async function change(value: string) { expect(input()).not.toBeNull(); input()!.value=value; input()!.dispatchEvent(new Event('input',{bubbles:true})); flushSync(); }
it('3130 propose le navigateur sans écrire puis enregistre seulement au clic', async () => {
  await show();
  expect(input(), 'champ de fuseau explicite').not.toBeNull();
  expect(input()!.value).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  expect(writes).toEqual([]);
  await change('Europe/Paris');
  host.querySelector<HTMLButtonElement>('[data-fuseau-enregistrer]')!.click(); await wait();
  expect(writes).toEqual([{alarms_timezone:'Europe/Paris'}]);
  expect(host.querySelector('[data-fuseau-actuel]')?.textContent).toContain('Europe/Paris');
});
it('3130 montre le prochain déclenchement dans le fuseau du réveil', async () => {
  config.alarms_timezone='Europe/Paris'; await show();
  expect(host.querySelector('[data-reveil-prochain]')?.textContent).toContain('11:10');
  expect(host.querySelector('[data-reveil-prochain]')?.textContent).toContain('Europe/Paris');
});
it('3130 un refus garde le réglage effectif et la saisie à corriger', async () => {
  config.alarms_timezone='UTC'; refuse=true; await show(); await change('Europe/Paris');
  host.querySelector<HTMLButtonElement>('[data-fuseau-enregistrer]')!.click(); await wait();
  expect(host.querySelector('[data-fuseau-actuel]')?.textContent).toContain('UTC');
  expect(input()!.value).toBe('Europe/Paris');
});
it('3130 un ancien serveur ne reçoit aucune écriture de fuseau', async () => {
  config={}; await show();
  expect(input()).toBeNull(); expect(writes).toEqual([]);
});

it('3130 les libellés existent dans les quinze langues', async () => {
  for (const langue of ONZE_LANGUES) for (const key of ['timezone','timezoneCurrent','timezoneSystem','timezoneHint','nextTrigger']) {
    expect(dictionnaire(langue)['alarms.'+key], langue+':'+key).toBeTruthy();
  }
});

it('3130 arrêt programmé : même réglage explicite, sans modifier son heure', async () => {
  config.alarms_timezone='UTC'; app=mount(ArretProgrammeV2,{target:host}); await wait();
  expect(input(), 'le fuseau commun doit être proposé aussi pour l’arrêt').not.toBeNull();
  expect(input()!.value).toBe('UTC'); expect(writes).toEqual([]);
  await change('Europe/Paris'); host.querySelector<HTMLButtonElement>('[data-fuseau-enregistrer]')!.click(); await wait();
  expect(writes).toEqual([{alarms_timezone:'Europe/Paris'}]);
  expect(host.querySelector('[data-fuseau-actuel]')?.textContent).toContain('Europe/Paris');
  expect(host.querySelector<HTMLInputElement>('input[type=time]')!.value).toBe('23:00');
});
