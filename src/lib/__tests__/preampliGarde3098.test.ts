// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
const mocks=vi.hoisted(() => ({getPluginDetail:vi.fn(),getEqExpertSettings:vi.fn(),getEq:vi.fn(),setEq:vi.fn(),getDsp:vi.fn(),listEqPresets:vi.fn(),setDsp:vi.fn(),getRetainedEqPreamp:vi.fn(),releaseRetainedEqPreamp:vi.fn()}));
vi.mock('../api',()=>mocks);
import EqualizerV2 from '../../components/v2/EqualizerV2.svelte';
import {currentZoneId} from '../stores/zones';
import {audiophileEnabled} from '../stores/audiophile';
import {preferences} from '../stores/preferences';
import {locale} from '../i18n';
let hote:HTMLDivElement;
let instance:ReturnType<typeof mount>|null=null;
beforeEach(()=>{
 for(const f of Object.values(mocks))f.mockReset();
 mocks.getPluginDetail.mockResolvedValue({name:'equalizer',installed:true});
 mocks.getEqExpertSettings.mockResolvedValue({expert_bands:10});
 mocks.getEq.mockResolvedValue({enabled:false,bands:[]});
 mocks.listEqPresets.mockResolvedValue([]);mocks.setEq.mockResolvedValue({applied_live:true});mocks.getDsp.mockResolvedValue({});
 mocks.getRetainedEqPreamp.mockResolvedValue({db:-8.4,returning:false});
 mocks.releaseRetainedEqPreamp.mockResolvedValue({released:true});
 preferences.update(p=>({...p,settingsLevel:'expert'}));locale.set('fr');currentZoneId.set(1);audiophileEnabled.set(false);
 hote=document.createElement('div');document.body.append(hote);
});
afterEach(()=>{if(instance)unmount(instance);instance=null;hote?.remove();currentZoneId.set(null);audiophileEnabled.set(false);});
async function ouvrir(){instance=mount(EqualizerV2,{target:hote});flushSync();await vi.waitFor(()=>expect(hote.querySelector('.v2-actions .v2-btn')).not.toBeNull());}
function rendre(){const b=[...hote.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes('Rendre le niveau'));expect(b,'#3098 : geste explicite absent').toBeTruthy();return b!;}
it('le préampli réel est annoncé et seul le bouton distinct rend le niveau',async()=>{
 await ouvrir();await vi.waitFor(()=>expect(hote.textContent,'#3098 : le préampli gardé reste invisible').toContain('Préampli gardé'));
 expect(hote.textContent).toMatch(/[−-]8,4/);expect(mocks.releaseRetainedEqPreamp).not.toHaveBeenCalled();
 hote.querySelector<HTMLButtonElement>('.v2-actions .v2-btn')!.click();
 await vi.waitFor(()=>expect(mocks.setEq).toHaveBeenCalledTimes(1));
 expect(mocks.releaseRetainedEqPreamp).not.toHaveBeenCalled();
 await vi.waitFor(()=>expect(hote.textContent).toContain('Préampli gardé'));
 rendre().click();await vi.waitFor(()=>expect(mocks.releaseRetainedEqPreamp).toHaveBeenCalledExactlyOnceWith(1));
});
it('un refus garde le montant visible et permet de réessayer',async()=>{
 mocks.releaseRetainedEqPreamp.mockRejectedValue(new Error('refus synthétique'));
 await ouvrir();await vi.waitFor(()=>expect(hote.textContent).toContain('Préampli gardé'));
 rendre().click();await vi.waitFor(()=>expect(hote.textContent).toContain('Impossible de rendre le niveau'));
 expect(hote.textContent).toMatch(/[−-]8,4/);expect(rendre().disabled).toBe(false);
});
it('une réponse tardive de l’ancienne zone ne remplace pas le gain de la nouvelle',async()=>{
 let ancienne!:(v:unknown)=>void;
 mocks.getRetainedEqPreamp.mockImplementation((z:number)=>z===1?new Promise(r=>{ancienne=r;}):Promise.resolve({db:-3,returning:false}));
 await ouvrir();await vi.waitFor(()=>expect(mocks.getRetainedEqPreamp).toHaveBeenCalledWith(1));
 currentZoneId.set(2);flushSync();await vi.waitFor(()=>expect(hote.textContent).toMatch(/[−-]3,0/));
 ancienne({db:-8.4,returning:false});await Promise.resolve();flushSync();
 expect(hote.textContent).not.toMatch(/[−-]8,4/);rendre().click();await vi.waitFor(()=>expect(mocks.releaseRetainedEqPreamp).toHaveBeenCalledExactlyOnceWith(2));
});
it('un ancien serveur sans mesure ne reçoit aucune demande de restitution',async()=>{
 mocks.getRetainedEqPreamp.mockRejectedValue(new Error('404'));
 await ouvrir();expect(hote.textContent).not.toContain('Préampli gardé');expect(mocks.releaseRetainedEqPreamp).not.toHaveBeenCalled();
});
it('PURE masque le geste sans toucher au niveau',async()=>{
 audiophileEnabled.set(true);await ouvrir();expect(hote.textContent).not.toContain('Rendre le niveau');expect(mocks.releaseRetainedEqPreamp).not.toHaveBeenCalled();
});
it('une rampe en cours garde le message et désactive le bouton',async()=>{
 mocks.getRetainedEqPreamp.mockResolvedValue({db:-4.2,returning:true});
 await ouvrir();await vi.waitFor(()=>expect(hote.textContent).toMatch(/[−-]4,2/));
 expect(rendre().disabled).toBe(true);rendre().click();expect(mocks.releaseRetainedEqPreamp).not.toHaveBeenCalled();
});
it('un gain déjà rendu ne laisse pas de bouton de niveau',async()=>{
 mocks.getRetainedEqPreamp.mockResolvedValue({db:null,returning:false});
 await ouvrir();await vi.waitFor(()=>expect(mocks.getRetainedEqPreamp).toHaveBeenCalled());
 expect(hote.textContent).not.toContain('Rendre le niveau');
});
