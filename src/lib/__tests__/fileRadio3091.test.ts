// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import QueueV2 from '../../components/v2/QueueV2.svelte';
import { currentZoneId, zones } from '../stores/zones';
let host: HTMLDivElement;
let mounted: ReturnType<typeof mount> | null = null;
let rows: Record<string, unknown>[];
let jumps: unknown[];
const radio = { source:'radio', source_id:'https://example.test/fip', title:'FIP en direct', artist_name:'Émission', duration_ms:0 };
function jouer(track: Record<string,unknown>) { zones.set([{id:10,name:'Salon',state:'playing',current_track:track}] as never); flushSync(); }
beforeEach(() => {
 rows=[{id:101,track_id:901,title:'Avant',source:'local'},{id:102,track_id:902,title:'Dernière piste',source:'local'}]; jumps=[];
 vi.stubGlobal('fetch',vi.fn(async (url:string,init?:RequestInit) => {
  if(String(url).includes('/queue/jump')) { jumps.push(JSON.parse(String(init?.body))); return new Response('{}'); }
  return new Response(JSON.stringify(/\/queue(?:\?|$)/.test(String(url)) ? {position:1,tracks:rows,length:rows.length}:{}),{headers:{'Content-Type':'application/json'}});
 }));
 currentZoneId.set(10); jouer(radio); host=document.createElement('div');document.body.appendChild(host);
});
afterEach(() => {if(mounted) unmount(mounted);mounted=null;host.remove();currentZoneId.set(null);zones.set([]);vi.unstubAllGlobals();});
async function ouvrir() { mounted=mount(QueueV2,{target:host});flushSync();await vi.waitFor(()=>expect(host.querySelector('.state')).toBeNull());flushSync(); }
it('montre la radio et garde la piste au curseur dans la file',async()=>{
 await ouvrir();expect(host.querySelector('.now')?.textContent).toContain('FIP en direct');
 expect(host.querySelector('.list')?.textContent).toContain('Dernière piste');
 host.querySelector<HTMLButtonElement>('.list .play')!.click();
 await vi.waitFor(()=>expect(jumps).toEqual([{position:1}]));
});
it('montre la radio même avec une file vide',async()=>{
 rows=[];mounted=mount(QueueV2,{target:host});flushSync();await vi.waitFor(()=>expect(host.querySelector('.now')?.textContent).toContain('FIP en direct'));
});
it('une piste locale qui joue garde le comportement normal',async()=>{
 jouer({track_id:902,source:'local',title:'Dernière piste'});await ouvrir();
 expect(host.querySelector('.now')?.textContent).toContain('Dernière piste');expect(host.querySelector('.list')?.textContent).not.toContain('Dernière piste');
});
it('une lecture de service hors file remplace également la carte courante',async()=>{
 jouer({source:'qobuz',source_id:'12345',title:'Titre hors file'});await ouvrir();
 expect(host.querySelector('.now')?.textContent).toContain('Titre hors file');expect(host.querySelector('.list')?.textContent).toContain('Dernière piste');
});

it('garde le début du bloc album au curseur pendant une radio', async () => {
 rows[1] = {...rows[1], album_id:50, album_title:'Album en attente'};
 rows.push({id:103,track_id:903,title:'Suite de l’album',source:'local',album_id:50,album_title:'Album en attente'});
 await ouvrir();
 const bloc = host.querySelector<HTMLElement>('[data-queue-album]');
 expect(bloc?.dataset.queueStart).toBe('1');
 expect(bloc?.textContent).toContain('Album en attente');
 bloc!.querySelector<HTMLButtonElement>('button.play')!.click();
 flushSync();
 expect(host.querySelector('.list')?.textContent).toContain('Dernière piste');
 expect(host.querySelector('.list')?.textContent).toContain('Suite de l’album');
 host.querySelector<HTMLButtonElement>('[data-queue-start="1"]:not([data-queue-album]) button.play')!.click();
 await vi.waitFor(() => expect(jumps).toEqual([{position:1}]));
});
