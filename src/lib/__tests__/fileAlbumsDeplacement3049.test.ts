// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import QueueV2 from '../../components/v2/QueueV2.svelte';
import { currentZoneId } from '../stores/zones';
import { preferences } from '../stores/preferences';

let hote: HTMLDivElement;
let monte: ReturnType<typeof mount> | null = null;
let pistes: Record<string, unknown>[];
let mouvements: Record<string, unknown>[];
let blocsPermis: boolean;
const elementInitial = document.elementFromPoint;
beforeEach(() => {
  pistes = [
    { id:100, track_id:900, title:'En cours' },
    ...[1,2,3].map(n => ({ id:100+n, track_id:900+n, title:`Alpha ${n}`, album_id:10, album_title:'Album Alpha' })),
    ...[4,5].map(n => ({ id:100+n, track_id:900+n, title:`Bêta ${n}`, album_id:20, album_title:'Album Bêta' })),
    { id:106, track_id:906, title:'Piste seule' },
  ].map(p => ({ ...p, source:'local', artist_name:'Artiste', duration_ms:60000 }));
  mouvements = [];
  blocsPermis = true;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (/\/queue\/move(?:\?|$)/.test(String(url))) {
      const corps = JSON.parse(String(init?.body)); mouvements.push(corps);
      const bloc = pistes.splice(corps.from_position, corps.count ?? 1);
      pistes.splice(corps.to_position, 0, ...bloc);
      return new Response(null, { status:204 });
    }
    return new Response(JSON.stringify(String(url).match(/\/queue(?:\?|$)/) ? { position:0, length:pistes.length, tracks:pistes, block_move_supported:blocsPermis } : {}), { headers:{'Content-Type':'application/json'} });
  }));
  currentZoneId.set(10);
  preferences.update(p => ({ ...p, settingsLevel:'expert' }));
  hote = document.createElement('div'); document.body.appendChild(hote);
});
afterEach(() => { if (monte) unmount(monte); monte=null; hote.remove(); currentZoneId.set(null); vi.unstubAllGlobals(); Object.defineProperty(document, "elementFromPoint", { configurable:true, value:elementInitial }); });
async function ouvrir() {
  monte = mount(QueueV2, { target:hote }); flushSync();
  await vi.waitFor(() => expect(hote.textContent).toContain('Piste seule')); flushSync();
}
function album() {
  const ligne = hote.querySelector<HTMLElement>('[data-queue-album]');
  expect(ligne, '#3049 : aucun album replié dans la file').not.toBeNull();
  return ligne!;
}
function poigneeSeule() {
  const ligne = [...hote.querySelectorAll<HTMLElement>('[data-queue-start]')].find(e => e.textContent?.includes('Piste seule'));
  const poignee = ligne?.querySelector<HTMLButtonElement>('[data-queue-handle]');
  expect(poignee, '#3049 : la piste ne peut pas être saisie au clavier/tactile').toBeTruthy();
  return poignee!;
}
it('un album occupe une ligne repliée, puis le + montre ses pistes', { timeout:60000 }, async () => {
  await ouvrir();
  expect(hote.querySelectorAll('[data-queue-album]')).toHaveLength(2);
  expect(hote.textContent).not.toContain('Alpha 1');
  const bouton = album().querySelector<HTMLButtonElement>('[aria-expanded]')!;
  expect(bouton.getAttribute('aria-expanded')).toBe('false'); bouton.click(); flushSync();
  expect(hote.textContent).toContain('Alpha 1'); expect(hote.textContent).toContain('Alpha 3');
  bouton.click(); flushSync(); expect(hote.textContent).not.toContain('Alpha 1');
});
it('la flèche déplace le bloc entier après l’album suivant en une requête', { timeout:60000 }, async () => {
  await ouvrir();
  album().querySelector<HTMLButtonElement>('[data-queue-down]')!.click();
  await vi.waitFor(() => expect(mouvements).toHaveLength(1));
  expect(mouvements[0]).toMatchObject({ from_position:1, to_position:3, count:3, expected_order:[100,101,102,103,104,105,106] });
  expect(pistes.map(p => p.id)).toEqual([100,104,105,101,102,103,106]);
});
it('Espace, flèche et Entrée déplacent une piste devant le bloc précédent', { timeout:60000 }, async () => {
  await ouvrir(); const p = poigneeSeule(); p.focus();
  for (const key of [' ', 'ArrowUp', 'Enter']) { p.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles:true })); flushSync(); }
  await vi.waitFor(() => expect(mouvements).toHaveLength(1));
  expect(mouvements[0]).toMatchObject({ from_position:6, to_position:4, count:1 });
});
it.each(['mouse','touch'])('le geste %s déplace la piste, sans transformer le défilement en glisser', { timeout:60000 }, async (pointerType) => {
  await ouvrir(); const p = poigneeSeule();
  Object.defineProperty(document, 'elementFromPoint', { configurable:true, value:vi.fn(() => album()) });
  for (const type of ['pointerdown','pointermove','pointerup']) {
    const e = new MouseEvent(type, { bubbles:true, clientX:50, clientY:70, button:0 });
    Object.defineProperties(e, { pointerId:{value:1}, pointerType:{value:pointerType}, isPrimary:{value:true} });
    p.dispatchEvent(e); flushSync();
  }
  await vi.waitFor(() => expect(mouvements).toHaveLength(1));
  expect(mouvements[0]).toMatchObject({ from_position:6, to_position:1, count:1 });
});

it('un ancien serveur ne reçoit jamais un déplacement de bloc qu’il ignorerait', { timeout:60000 }, async () => {
  blocsPermis=false; await ouvrir();
  expect(album().querySelector<HTMLButtonElement>('[data-queue-handle]')!.disabled).toBe(true);
  const descendre=album().querySelector<HTMLButtonElement>('[data-queue-down]')!;
  expect(descendre.disabled).toBe(true); descendre.click(); flushSync();
  expect(mouvements).toHaveLength(0);
  album().querySelector<HTMLButtonElement>('[aria-expanded]')!.click(); flushSync();
  const piste=hote.querySelector<HTMLButtonElement>('[data-queue-handle="piste:101"]')!;
  expect(piste.disabled).toBe(false);
});
it('Échap annule sans écriture', { timeout:60000 }, async () => {
  await ouvrir(); const p=poigneeSeule();
  for (const key of [' ', 'ArrowUp', 'Escape', 'Enter']) { p.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true})); flushSync(); }
  expect(mouvements).toHaveLength(0);
});

it('le clavier garde le focus et atteint une cible hors de la fenêtre virtualisée', { timeout:60000 }, async () => {
  pistes.push(...Array.from({length:600}, (_,i) => ({id:1000+i, track_id:2000+i, title:`Suite ${i}`, source:'local', duration_ms:1000})));
  await ouvrir();
  const scroller=hote.querySelector<HTMLElement>('.scroll')!;
  Object.defineProperty(scroller,'clientHeight',{configurable:true,value:550});
  const p=poigneeSeule(); p.focus();
  p.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true})); flushSync();
  expect(document.activeElement).toBe(scroller);
  for (let i=0;i<80;i++) {
    scroller.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})); flushSync();
  }
  expect(p.isConnected, 'la poignée initiale doit avoir quitté le DOM').toBe(false);
  expect(document.activeElement).toBe(scroller);
  expect(scroller.scrollTop).toBeGreaterThan(550);
  scroller.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); flushSync();
  await vi.waitFor(() => expect(mouvements).toHaveLength(1));
  expect(mouvements[0]).toMatchObject({from_position:6,to_position:86,count:1});
});
