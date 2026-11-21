// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
vi.mock('../oeuvres',async original=>({...await original<typeof import('../oeuvres')>(),chargerMembresOeuvres:vi.fn(),chargerOeuvreAlbum:vi.fn()}));
import { chargerMembresOeuvres, chargerOeuvreAlbum } from '../oeuvres';
import { tuneWS } from '../websocket';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import { albums } from '../stores/library';
let host:HTMLDivElement, app:ReturnType<typeof mount>|undefined;
let listeners:((e:any)=>void)[];
const oeuvre={enabled:true,album_id:1,work_id:'a',method:'single' as const,count:2,preferred_id:1,versions:[{id:1,title:'Album'},{id:2,title:'Autre'}] as any[]};
async function wait(){for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,0));flushSync();}}
beforeEach(()=>{
  host=document.createElement('div');document.body.append(host);listeners=[];
  class Observer{observe(){}unobserve(){}disconnect(){}}
  vi.stubGlobal('ResizeObserver',Observer);vi.stubGlobal('IntersectionObserver',Observer);
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('[]',{status:200,headers:{'Content-Type':'application/json'}})));
  vi.spyOn(tuneWS,'onEvent').mockImplementation(fn=>{listeners.push(fn);return()=>{listeners=listeners.filter(x=>x!==fn);};});
  vi.mocked(chargerMembresOeuvres).mockReset().mockResolvedValue([]);
  vi.mocked(chargerOeuvreAlbum).mockReset().mockResolvedValue(oeuvre);
  albums.set([]);
});
afterEach(()=>{if(app)unmount(app);app=undefined;host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('3100 la bibliothèque relit les œuvres au retour du WebSocket sans changer les albums',async()=>{
  app=mount(LibraryV2,{target:host});await wait();const before=vi.mocked(chargerMembresOeuvres).mock.calls.length;expect(before).toBeGreaterThan(0);
  listeners.forEach(f=>f({type:'_connected',data:null}));await wait();
  expect(vi.mocked(chargerMembresOeuvres).mock.calls.length).toBe(before+1);
});
it('3100 la fiche ouverte relit ses versions au retour du WebSocket',async()=>{
  app=mount(AlbumDetailV2,{target:host,props:{album:{id:1,title:'Album',artist_name:'Artiste'} as any,onClose:()=>{}}});
  await wait();expect(host.querySelector('#album-onglet-versions')).not.toBeNull();
  const before=vi.mocked(chargerOeuvreAlbum).mock.calls.length;
  listeners.forEach(f=>f({type:'_connected',data:null}));await wait();
  expect(vi.mocked(chargerOeuvreAlbum).mock.calls.length).toBe(before+1);
});

it('3100 une panne à la reconnexion conserve les versions connues, une absence explicite les retire',async()=>{
  app=mount(AlbumDetailV2,{target:host,props:{album:{id:1,title:'Album',artist_name:'Artiste'} as any,onClose:()=>{}}});
  await wait();expect(host.querySelector('#album-onglet-versions')).not.toBeNull();
  vi.mocked(chargerOeuvreAlbum).mockRejectedValueOnce(new Error('serveur occupé'));
  listeners.forEach(f=>f({type:'_connected',data:null}));await wait();
  expect(host.querySelector('#album-onglet-versions')).not.toBeNull();
  vi.mocked(chargerOeuvreAlbum).mockResolvedValueOnce(null);
  listeners.forEach(f=>f({type:'_connected',data:null}));await wait();
  expect(host.querySelector('#album-onglet-versions')).toBeNull();
});
it('3100 fermer la fiche retire son abonnement à la reconnexion',async()=>{
  app=mount(AlbumDetailV2,{target:host,props:{album:{id:1,title:'Album',artist_name:'Artiste'} as any,onClose:()=>{}}});
  await wait();await unmount(app);app=undefined;const before=vi.mocked(chargerOeuvreAlbum).mock.calls.length;
  listeners.forEach(f=>f({type:'_connected',data:null}));await wait();
  expect(vi.mocked(chargerOeuvreAlbum).mock.calls.length).toBe(before);
});
