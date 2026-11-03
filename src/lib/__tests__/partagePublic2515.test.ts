// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { partagePublic } from '../partagePublic';
import * as utils from '../utils';
import { notifications } from '../stores/notifications';
import { carteAPartager } from '../circleMessagerie';
import { preparerLocale, locale } from '../i18n';
import Menu from '../../components/partages/PartageEcouteMenu.svelte';
const metadata = { title: 'Song', artist_name: 'Artist', album_title: 'Album', stream_url: 'https://stream.test/song?token=secret', file_path: '/private/song.flac', token: 'secret' };
const mounted: ReturnType<typeof mount>[] = [];
beforeEach(async () => { await preparerLocale('fr'); locale.set('fr'); carteAPartager.set(null); });
afterEach(async () => { for (const c of mounted.splice(0)) await unmount(c); document.body.innerHTML=''; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it.each([
  ['qobuz','123','https://open.qobuz.com/track/123'],
  ['tidal','456','https://tidal.com/browse/track/456'],
  ['youtube','dQw4w9WgXcQ','https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
  ['spotify','4uLU6hMCjMI75M1A2tKUQC','https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'],
  ['bandcamp','https://artist.bandcamp.com/track/song?token=secret#x','https://artist.bandcamp.com/track/song'],
])('reconstructs a public %s track without stream tokens', (source, source_id, url) => {
  expect(partagePublic({...metadata,source,source_id})).toEqual({texte:url,url});
});
it('shares local metadata only, never a server or file URL', () => {
  expect(partagePublic({...metadata,source:'local',url:'http://localhost/shared/secret'})).toEqual({texte:'Artist – Song (Album)'});
});
it('uses a station page or the station and current title', () => {
  expect(partagePublic({...metadata,source:'radio',album_title:'FIP',website_url:'https://www.radiofrance.fr/fip?token=secret'}).url).toBe('https://www.radiofrance.fr/fip');
  expect(partagePublic({...metadata,source:'radio',album_title:'FIP'})).toEqual({texte:'FIP – Song'});
});
it.each(['https://stream.example/stream/live?token=secret','http://127.0.0.1/live','http://localhost/private','https://name:secret@example.com/','https://example.com/live.m3u8'])('rejects unsafe station URL %s', (website_url) => {
  expect(partagePublic({...metadata,source:'radio',album_title:'FIP',website_url})).toEqual({texte:'FIP – Song'});
});
it('never treats an arbitrary service id or Bandcamp stream as a share URL', () => {
  for(const source of ['qobuz','tidal','youtube','spotify','bandcamp']) expect(partagePublic({...metadata,source,source_id:metadata.stream_url})).toEqual({texte:'Artist – Song (Album)'});
});
async function menu(piste = {...metadata,source:'qobuz',source_id:'123'}) {
  const target=document.body.appendChild(document.createElement('div'));
  mounted.push(mount(Menu,{target,props:{piste}})); await tick();
  (target.querySelector('details') as HTMLDetailsElement).open=true;
  return target;
}
const button=(target:HTMLElement,label:string)=>[...target.querySelectorAll('button')].find(b=>b.textContent?.includes(label))!;
it('copies the public link and announces success only after a successful clipboard write',async()=>{
  const copy=vi.spyOn(utils,'copyText').mockResolvedValue(true), toast=vi.spyOn(notifications,'success');
  const target=await menu();button(target,'Copier le lien').click();
  await vi.waitFor(()=>expect(toast).toHaveBeenCalledWith('Lien copié'));
  expect(copy).toHaveBeenCalledWith('https://open.qobuz.com/track/123');
});
it('shows selectable text after clipboard refusal without a success toast',async()=>{
  vi.spyOn(utils,'copyText').mockRejectedValue(new DOMException('Denied','NotAllowedError'));
  const toast=vi.spyOn(notifications,'success');const target=await menu();button(target,'Copier le lien').click();
  await vi.waitFor(()=>expect(target.querySelector('textarea')?.value).toBe('https://open.qobuz.com/track/123'));
  expect(toast).not.toHaveBeenCalled();expect(target.querySelector('textarea')?.readOnly).toBe(true);
});
it('opens the existing music-card sharing flow with sanitized metadata',async()=>{
  const target=await menu();button(target,'message').click();await tick();
  expect(get(carteAPartager)).toMatchObject({type:'track',title:'Song',qobuz_id:'123'});
  expect(JSON.stringify(get(carteAPartager))).not.toContain('secret');
});
it('uses native sharing when the browser exposes it',async()=>{
  const share=vi.fn().mockResolvedValue(undefined);Object.defineProperty(navigator,'share',{configurable:true,value:share});
  const target=await menu();button(target,'Partager avec').click();
  await vi.waitFor(()=>expect(share).toHaveBeenCalledWith({url:'https://open.qobuz.com/track/123'}));
  delete (navigator as any).share;
});
