// @vitest-environment jsdom
// Diagnostic #8343 : comparer les choix réellement affichés après découverte
// d'une provenance présente dans les artistes mais absente des albums chargés.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import type { Album } from '../types';
import Library from '../../components/v2/LibraryV2.svelte';
import { albums, libraryFolderScope } from '../stores/library';
import { activeView } from '../stores/navigation';
import { sourcesArtistesServeur } from '../stores/sourcesArtistesServeur';
import { _remiseAZeroPourTests as oublierLesPistes } from '../stores/pistesEntieres';
import { preferences } from '../stores/preferences';
import { _remiseAZeroPourTests as oublierLesAlbums } from '../stores/albumsPagines';
let preferencesAvant = get(preferences);

const catalogue: Album[] = [
  { id: 1, title: 'Disque A', artist_id: 1, artist_name: 'Local', source: 'local', genre: 'Jazz', year: 2020, label: 'Label A' },
  { id: 2, title: 'Disque Q', artist_id: 2, artist_name: 'Qobuz', source: 'qobuz', genre: 'Rock', year: 2021, label: 'Label B' },
];
const artistes = [
  { id: 1, name: 'Local', provenances: {local:{albums:1,pistes:1}} },
  { id: 2, name: 'Qobuz', provenances: {qobuz:{albums:1,pistes:1}} },
  { id: 3, name: 'Bandcamp sans album', provenances: {bandcamp:{albums:0,pistes:1}} },
];
let instance: ReturnType<typeof mount> | null = null;
let target: HTMLDivElement;
let urls: string[]=[];
let bandcampChezArtistes=true;
const flush = async () => { for(let i=0;i<12;i++) await new Promise(r=>setTimeout(r,0)); flushSync(); };
async function cliquer(selector:string) { const b=target.querySelector<HTMLButtonElement>(selector); expect(b,selector).toBeTruthy(); b!.click(); await flush(); }
async function choix() {
  const b=[...target.querySelectorAll<HTMLButtonElement>('.filters button.chip')].find(b=>b.textContent?.trim().startsWith('Source'));
  expect(b,'menu Source').toBeTruthy();b!.click();await flush();
  const noms=[...target.querySelectorAll('.filters .drop.open .menu button')].map(b=>[...b.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').trim());
  b!.click();await flush();return noms;
}
beforeEach(()=>{
  localStorage.clear();libraryFolderScope.set(null);activeView.set('library');oublierLesPistes();oublierLesAlbums();sourcesArtistesServeur.set(null);urls=[];bandcampChezArtistes=true;
  preferencesAvant=get(preferences);preferences.adopterSansEcrire(p=>({...p,settingsLevel:'expert'}));
  vi.stubGlobal('ResizeObserver',class {observe(){} unobserve(){} disconnect(){}});
  vi.stubGlobal('fetch',vi.fn(async (input:unknown)=>{
    const u=String(input);urls.push(u);let data:unknown={};
    if(u.includes('/library/artists')) {const items=bandcampChezArtistes?artistes:artistes.slice(0,2);data={items,total:items.length};}
    else if(u.includes('/library/tracks')) data={items:[{id:1,title:'Piste locale',source:'local'},{id:2,title:'Piste Q',source:'qobuz'},{id:3,title:'Piste B',source:'bandcamp'}],total:3,order:'title',source_counts:{local:1,qobuz:1,bandcamp:1},total_all_sources:3};
    else if(u.includes('/library/albums?')) data={items:catalogue,total:2};
    else if(u.includes('/library/albums/filters')) data={};
    else if(u.includes('/library/stats')) data={tracks:3,albums:2,artists:3};
    else if(u.includes('/network/library-sources')) data={items:[]};
    else if(u.includes('/network/media-servers') || /\/zones|\/playlists/.test(u)) data=[];
    return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
  }));
  albums.set(catalogue);target=document.createElement('div');document.body.appendChild(target);
});
afterEach(async()=>{if(instance) await unmount(instance);instance=null;target.remove();preferences.adopterSansEcrire(()=>preferencesAvant);oublierLesAlbums();vi.unstubAllGlobals();localStorage.clear();albums.set([]);activeView.set('home');sourcesArtistesServeur.set(null);});
it.each(['artists','tracks'])('garde les sources connues depuis %s au même rang dans les six onglets',async(premier)=>{
  bandcampChezArtistes=premier==='artists';
  instance=mount(Library,{target});await flush();
  await cliquer(`[data-onglet="${premier}"]`);
  const reference=await choix();expect(reference).toContain('BANDCAMP');
  for(const onglet of ['albums','tracks','genres','years','labels','artists']) {
    await cliquer(`[data-onglet="${onglet}"]`);
    expect(await choix(),`8343 : les sources connues changent de rang dans ${onglet}`).toEqual(reference);
  }
  expect(urls.filter(u=>{const url=new URL(u,'http://banc');return url.pathname.endsWith('/library/tracks')&&Number(url.searchParams.get('limit'))>=5000;}),'pas de chargement intégral ajouté pour les sources').toEqual([]);
},30000);
