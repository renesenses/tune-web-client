// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { getRetainedEqPreamp } from '../api';
import { notifications } from '../stores/notifications';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('une panne de la sonde du préampli ne déclenche pas de bandeau global',async()=>{
 const alerte=vi.spyOn(notifications,'error');
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'synthetic_failure'}),{status:503,headers:{'content-type':'application/json'}})));
 await expect(getRetainedEqPreamp(42)).rejects.toMatchObject({status:503});
 expect(alerte,'la sonde de préampli doit rester sans bandeau').not.toHaveBeenCalled();
});
