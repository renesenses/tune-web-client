// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
const mocks=vi.hoisted(()=>({getRetainedEqPreamp:vi.fn(),releaseRetainedEqPreamp:vi.fn()}));
vi.mock('../api',()=>mocks);
import PreampliGardeV2 from '../../components/v2/PreampliGardeV2.svelte';
let instance:ReturnType<typeof mount>|undefined;
let host:HTMLDivElement;
beforeEach(()=>{vi.useFakeTimers();mocks.getRetainedEqPreamp.mockReset();host=document.createElement('div');document.body.append(host);});
afterEach(async()=>{if(instance)await unmount(instance);instance=undefined;host.remove();vi.useRealTimers();});
async function ouvrir(){instance=mount(PreampliGardeV2,{target:host,props:{zoneId:42}});flushSync();await vi.advanceTimersByTimeAsync(0);}
it('un serveur ancien reçoit une seule sonde après son 404',async()=>{
 mocks.getRetainedEqPreamp.mockRejectedValue(Object.assign(new Error('route absente'),{status:404}));
 await ouvrir();await vi.advanceTimersByTimeAsync(6000);
 expect(mocks.getRetainedEqPreamp,'le 404 doit arrêter les sondes répétées').toHaveBeenCalledTimes(1);
 expect(host.textContent).toBe('');
});
it('une panne temporaire permet encore une mesure ultérieure',async()=>{
 mocks.getRetainedEqPreamp.mockRejectedValueOnce(Object.assign(new Error('panne'),{status:503})).mockResolvedValue({db:-4,returning:false});
 await ouvrir();await vi.advanceTimersByTimeAsync(2000);flushSync();
 expect(mocks.getRetainedEqPreamp).toHaveBeenCalledTimes(2);
 expect(host.querySelector('[role="status"]')).not.toBeNull();
});
