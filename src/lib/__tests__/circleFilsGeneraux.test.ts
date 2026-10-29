// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import Dialogues from '../../components/partages/DialogContainer.svelte';
import Messagerie from '../../components/v2/MessagerieCercleV2.svelte';
import Generaux from '../../components/v2/CerclesGenerauxV2.svelte';
import Partage from '../../components/v2/PartageMessageV2.svelte';
import { fetchJSON } from '../api';
import { dialogs } from '../stores/dialogs';
import { preparerLocale } from '../i18n';
import { conversations, demandeConversation, messagerieSupport } from '../circleMessagerie';
vi.mock('../api', () => ({ BASE: '/api/v1', fetchJSON: vi.fn(), searchLibrary: vi.fn(), getPlaylists: vi.fn() }));
vi.mock('../circleNotifications', () => ({ relireNotifications: vi.fn(async () => {}) }));
const appel = vi.mocked(fetchJSON);
let hote: HTMLDivElement;
let vue: ReturnType<typeof mount> | null = null;
let dialogueVue: ReturnType<typeof mount> | null = null;
let besoin = true;
let membre = true;
let confirm: ReturnType<typeof vi.spyOn>;
const direct = { id: 12, kind: 'direct', contact: { user_id: 7, name: 'Jazz' }, unread_count: 0 };
const cercle = () => ({ id: 20, kind: 'circle', circle: { id: 8, name: 'Jazz' }, unread_count: 1, name_consent_required: besoin });
const finir = async () => { for (let i=0;i<6;i++) { await new Promise((r)=>setTimeout(r,0)); flushSync(); } };
const bouton = (texte: string) => [...hote.querySelectorAll('button')].find((b)=>(b.getAttribute('aria-label') ?? b.textContent?.trim()) === texte)!;
beforeAll(async () => preparerLocale('fr'));
beforeEach(() => {
  besoin=true; membre=true; demandeConversation.set(null); messagerieSupport.set(null); appel.mockReset();
  confirm=vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
  hote=document.createElement('div'); document.body.append(hote);
  appel.mockImplementation(async (url: any, options: any) => {
    const u=String(url); const method=options?.method ?? 'GET';
    if (u.endsWith('/ext/circle')) return {members:[], sent:[], received:[]} as any;
    if (u.endsWith('/general-circles')) return {circles:[{id:8,name:'Jazz',category:'genre',member_count:3,joined:membre}]} as any;
    if (u.endsWith('/membership')) { membre=method==='POST'; return {joined:membre} as any; }
    if (u.endsWith('/conversations')) return {conversations:membre?[direct,cercle()]:[direct]} as any;
    if (u.endsWith('/general-circles/8/conversation')) return cercle() as any;
    if (u.endsWith('/name-consent')) {besoin=false;return {name_consent_required:false} as any;}
    if (u.includes('/messages?')) return {conversation:cercle(),messages:[{id:1,sender_id:7,mine:false,body:'Ancien message',author:{name:'Bob'},card:null,created_at:'2026-10-01T10:00:00Z'}],next_cursor:null} as any;
    return {unread_count:0} as any;
  });
});
afterEach(async()=>{ if(vue)await unmount(vue);vue=null;if(dialogueVue)await unmount(dialogueVue);dialogueVue=null;for(const d of get(dialogs))dialogs.settle(d.id,false);hote.remove();vi.restoreAllMocks(); });
const saisir = (texte:string) => {const champ=hote.querySelector('#message-texte') as HTMLTextAreaElement;champ.value=texte;champ.dispatchEvent(new Event('input',{bubbles:true}));flushSync();};
const ouvrir = async()=>{vue=mount(Messagerie,{target:hote});await finir();demandeConversation.set({circle:8});await finir();};

it('conserve des contrats distincts pour un contact et un cercle portant le même nom',async()=>{
 const liste=await conversations();expect(liste.map((c)=>[c.id,c.kind])).toEqual([[12,'direct'],[20,'circle']]);
 await ouvrir();expect(hote.querySelectorAll('.conversation')).toHaveLength(2);
 expect(hote.querySelector('.fil h3')?.textContent).toBe('Jazz');
 expect(hote.querySelector('.auteur')?.textContent).toBe('Bob');
 expect(hote.textContent).toContain('Ancien message');
 expect(appel.mock.calls.some(c=>String(c[0]).endsWith('/general-circles/8/conversation')&&c[1]?.method==='POST')).toBe(true);
});
it('refuser le consentement conserve le brouillon et n’envoie rien au cloud',async()=>{
 confirm.mockResolvedValue(false);await ouvrir();saisir('Bonjour cercle');bouton('Envoyer').click();await finir();
 expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Ton pseudo sera visible des membres de ce cercle'));
 expect(appel.mock.calls.some(c=>String(c[0]).endsWith('/name-consent'))).toBe(false);
 expect(appel.mock.calls.some(c=>String(c[0]).endsWith('/messages')&&c[1]?.method==='POST')).toBe(false);
 expect((hote.querySelector('#message-texte') as HTMLTextAreaElement).value).toBe('Bonjour cercle');
});
it('enregistre le consentement côté cloud avant le message, une seule fois par fil',async()=>{
 await ouvrir();saisir('Premier');bouton('Envoyer').click();await finir();saisir('Deuxième');bouton('Envoyer').click();await finir();
 const mutations=appel.mock.calls.filter(c=>c[1]?.method==='POST');
 expect(mutations.filter(c=>String(c[0]).endsWith('/name-consent'))).toHaveLength(1);
 expect(JSON.parse(mutations.find(c=>String(c[0]).endsWith('/name-consent'))![1]!.body as string)).toEqual({accepted:true});
 expect(mutations.findIndex(c=>String(c[0]).endsWith('/name-consent'))).toBeLessThan(mutations.findIndex(c=>String(c[0]).endsWith('/messages')));
 expect(confirm).toHaveBeenCalledTimes(1);
});
it('un refus du cloud pendant le consentement interdit l’envoi',async()=>{
 const normal=appel.getMockImplementation()!;appel.mockImplementation(async(...args:any[])=>{if(String(args[0]).endsWith('/name-consent'))throw Object.assign(new Error('refused'),{status:422});return normal(...args as Parameters<typeof fetchJSON>);});
 await ouvrir();saisir('Ne pas envoyer');bouton('Envoyer').click();await finir();
 expect(appel.mock.calls.some(c=>String(c[0]).endsWith('/messages')&&c[1]?.method==='POST')).toBe(false);
 expect(hote.querySelector('[role=alert]')).toBeTruthy();
});
it('retire immédiatement le fil chargé après un départ local',async()=>{
 await ouvrir();expect(hote.textContent).toContain('Ancien message');membre=false;window.dispatchEvent(new CustomEvent('circle-membership-changed'));await finir();
 expect(hote.textContent).not.toContain('Ancien message');expect(hote.querySelector('.fil')).toBeNull();
 expect(hote.querySelectorAll('.conversation')).toHaveLength(1);
});
it('ne propose Écrire au cercle qu’après adhésion volontaire et retire l’accès au départ',async()=>{
 membre=false;vue=mount(Generaux,{target:hote});await finir();expect(bouton('Écrire au cercle')).toBeUndefined();
 bouton('Rejoindre').click();await finir();expect(bouton('Écrire au cercle')).toBeTruthy();
 bouton('Quitter').click();await finir();expect(bouton('Écrire au cercle')).toBeUndefined();
 expect(appel.mock.calls.some(c=>String(c[0]).endsWith('/membership')&&c[1]?.method==='DELETE')).toBe(true);
});
it('partage aussi une carte dans le cercle après consentement cloud',async()=>{
 vue=mount(Partage,{target:hote,props:{carte:{type:'album',title:'Album de test'}}});await finir();
 const select=hote.querySelector('select') as HTMLSelectElement;select.value='circle:8';select.dispatchEvent(new Event('change',{bubbles:true}));flushSync();
 bouton('Envoyer').click();await finir();
 const envoi=appel.mock.calls.find(c=>String(c[0]).endsWith('/messages')&&c[1]?.method==='POST');
 expect(JSON.parse(envoi![1]!.body as string)).toEqual({card:{type:'album',title:'Album de test'}});
 expect(appel.mock.calls.some(c=>String(c[0]).endsWith('/name-consent'))).toBe(true);
});


it('Entrée pour envoyer ne valide pas aussi le vrai dialogue de consentement', async () => {
  confirm.mockRestore();
  await ouvrir();
  dialogueVue = mount(Dialogues, { target: hote }); await finir();
  saisir('Un envoi demande une acceptation distincte');
  const champ = hote.querySelector('#message-texte') as HTMLTextAreaElement;
  champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await finir();
  expect(hote.querySelector('[role=alertdialog]')).toBeTruthy();
  expect(appel.mock.calls.some(c => String(c[0]).endsWith('/name-consent'))).toBe(false);
  expect(appel.mock.calls.some(c => String(c[0]).endsWith('/messages') && c[1]?.method === 'POST')).toBe(false);
  const d = get(dialogs)[0]; expect(d.message).toContain('Ton pseudo sera visible');
  dialogs.settle(d.id, true); await finir();
  expect(appel.mock.calls.some(c => String(c[0]).endsWith('/name-consent'))).toBe(true);
});

it('quitter un cercle ne détruit pas le brouillon d’une conversation directe', async () => {
  const normal = appel.getMockImplementation()!;
  appel.mockImplementation(async (...args: any[]) => {
    if (String(args[0]).includes('/12/messages?')) return { conversation: direct, messages: [], next_cursor: null } as any;
    return normal(...args as Parameters<typeof fetchJSON>);
  });
  vue = mount(Messagerie, { target: hote }); await finir();
  (hote.querySelector('.conversation') as HTMLButtonElement).click(); await finir();
  saisir('Brouillon destiné au contact');
  membre = false;
  window.dispatchEvent(new CustomEvent('circle-membership-changed', { detail: { circleId: 8 } })); await finir();
  expect((hote.querySelector('#message-texte') as HTMLTextAreaElement)?.value).toBe('Brouillon destiné au contact');
});
