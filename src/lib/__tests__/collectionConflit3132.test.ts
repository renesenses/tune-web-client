// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CollectionPhysiqueV2 from '../../components/v2/CollectionPhysiqueV2.svelte';
import { locale } from '../i18n';
let host: HTMLDivElement;
let app: ReturnType<typeof mount> | undefined;
let lectures: number;
let refus: string;
let echecLecture: boolean;
let puts: number;
let associe: boolean;
const album = {album_id:11,titre:'Album',artiste:'Artiste',par:'manuel',qualite:null,format:null,sample_rate:null,bit_depth:null,cover_path:null};
function disque() { return {instance_id:1,release_id:1050,artiste:'Artiste',titre:'Disque',annee:2020,labels:[],numeros_catalogue:[],formats:['CD'],precisions:[],format:'cd',lien_discogs:'',pochette:false,bibliotheque:associe?album:null,streaming:[],etat:associe?'bibliotheque':'nulle_part',copie:false,proposer_extraction:false}; }
const json = (x: unknown, status=200) => new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json'}});
async function wait() { for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,0));flushSync();} }
beforeEach(() => {
  locale.set('fr'); localStorage.clear();
  lectures=0; puts=0; refus='deja_associe'; echecLecture=false; associe=false;
  host=document.createElement('div');document.body.append(host);
  class Observer { observe(){} unobserve(){} disconnect(){} }
  vi.stubGlobal('ResizeObserver',Observer);vi.stubGlobal('IntersectionObserver',Observer);
  vi.stubGlobal('fetch',vi.fn(async (url: string, init?: RequestInit) => {
    const u=String(url);
    if(u.includes('/ext/collection-physique/reglages')) return json({nom_utilisateur:'test',jeton:'integre'});
    if(u.includes('/ext/collection-physique/etat')) return json({nom_utilisateur:'test',liste_lue_le:Date.now()/1000});
    if(/\/collection(?:\?|$)/.test(u)) {
      lectures++;
      if(echecLecture && lectures>1) return json({error:'bibliotheque_illisible'},500);
      return json({statut:'ok',compteurs:{total:1,par_etat:{bibliotheque:associe?1:0,nulle_part:associe?0:1}},disques:[disque()]});
    }
    if(u.endsWith('/disques/1050/albums')) return json({release_id:1050,requete:'Album',proposee:'Album',candidats:[],albums:[album],association:null});
    if(u.endsWith('/disques/1050/association') && init?.method==='PUT') {
      puts++; if(refus==='deja_associe') associe=true;
      return json({error:'collection_physique.'+refus},refus==='deja_associe'?409:404);
    }
    return json({});
  }));
});
afterEach(()=>{if(app)unmount(app);app=undefined;host.remove();document.querySelectorAll('[data-associer-album]').forEach(e=>e.closest('.fond')?.remove());vi.unstubAllGlobals();});
async function tenter() {
  app=mount(CollectionPhysiqueV2,{target:host});await wait();
  const ouvrir=host.querySelector<HTMLButtonElement>('[data-associer-disque="1050"]');
  expect(ouvrir,'le disque initial propose l’association').not.toBeNull();ouvrir!.click();await wait();
  const choisir=document.querySelector<HTMLButtonElement>('[data-choisir-album="11"]');
  expect(choisir).not.toBeNull();choisir!.click();await wait();
}
it('3132 un conflit relit la carte et révèle la vraie association sans nouveau PUT',async()=>{
  await tenter();
  expect(lectures,'la collection est relue après le refus').toBe(2);
  expect(host.querySelector('[data-disque="1050"]')?.getAttribute('data-etat-disque')).toBe('bibliotheque');
  expect(host.querySelector('[data-associe-a-la-main="1050"]')).not.toBeNull();
  expect(document.querySelector('[data-erreur-association]')).not.toBeNull();
  expect(puts).toBe(1);
});
it('3132 un échec de relecture garde la carte et le refus visibles',async()=>{
  echecLecture=true;await tenter();
  expect(lectures).toBe(2);
  expect(host.querySelector('[data-disque="1050"]')?.getAttribute('data-etat-disque')).toBe('nulle_part');
  expect(document.querySelector('[data-erreur-association]')).not.toBeNull();expect(puts).toBe(1);
});
it('3132 un autre refus ne provoque pas de relecture',async()=>{
  refus='album_inconnu';await tenter();expect(lectures).toBe(1);expect(puts).toBe(1);
  expect(document.querySelector('[data-erreur-association]')).not.toBeNull();
});
