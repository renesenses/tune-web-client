// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { largeursColonnes } from '../largeursColonnes';
import { locale } from '../i18n';
let host: HTMLDivElement;
let mounted: ReturnType<typeof mount> | null = null;
beforeEach(()=>{
 localStorage.clear();largeursColonnes.set({});locale.set('fr');
 preferences.update(p=>({...p,settingsLevel:'expert'}));
 v2SettingsTarget.set({tab:'display',section:'displayPrefs'});
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(/\/(zones|profiles|devices|playlists|shortcuts)(\?|$)/.test(String(url))?'[]':'{}',{headers:{'Content-Type':'application/json'}})));
 host=document.createElement('div');document.body.appendChild(host);
});
afterEach(()=>{if(mounted)unmount(mounted);mounted=null;host.remove();largeursColonnes.set({});vi.unstubAllGlobals();});
async function bouton(){mounted=mount(SettingsV2,{target:host});flushSync();await vi.waitFor(()=>expect(host.querySelector('[data-retablir-largeurs]')).not.toBeNull());return host.querySelector<HTMLButtonElement>('[data-retablir-largeurs]')!;}
it('sans largeur personnalisée le bouton est désactivé',async()=>{
 const b=await bouton();expect(b.disabled).toBe(true);expect(b.textContent).toContain('Rétablir la largeur automatique des colonnes');
});
it('retrouve les largeurs stockées et confirme leur remise automatique',async()=>{
 for(const e of ['album','playlist','titres'])localStorage.setItem(`tune_v2_ecran_largeurs_colonnes_${e}`,JSON.stringify({artist:240}));
 const b=await bouton();expect(b.disabled).toBe(false);b.click();flushSync();expect(b.disabled).toBe(true);
 expect(host.querySelector('[data-largeurs-retablies]')?.textContent).toContain('Largeurs des colonnes rétablies');
 for(const e of ['album','playlist','titres'])expect(localStorage.getItem(`tune_v2_ecran_largeurs_colonnes_${e}`)).toBeNull();
});
