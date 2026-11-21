import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../api', async original => ({ ...(await original<typeof import('../api')>()), fetchJSON: vi.fn() }));
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';
import { fetchJSON } from '../api';
import { chargerMembresOeuvres, chargerOeuvreAlbum } from '../oeuvres';
const fetcher=vi.mocked(fetchJSON);
const works=[{work_id:'a',preferred_id:1,ids:[1,2]}];
const oeuvre={enabled:true,album_id:1,work_id:'a',method:'single',count:2,preferred_id:1,versions:[{id:1},{id:2}]};
const error=(status:number)=>Object.assign(new Error('refus'),{status});
beforeEach(()=>{fetcher.mockReset();vi.useFakeTimers();});
afterEach(()=>vi.useRealTimers());
async function result(fn:()=>Promise<unknown>) {
  const p=fn().then(value=>({value,error:undefined}),error=>({value:undefined,error}));
  await vi.runAllTimersAsync();return await p;
}
it('3100 les membres reviennent après deux 503',async()=>{
  fetcher.mockRejectedValueOnce(error(503)).mockRejectedValueOnce(error(503)).mockResolvedValue({enabled:true,works});
  expect((await result(chargerMembresOeuvres)).value).toEqual(works);expect(fetcher).toHaveBeenCalledTimes(3);
});
it('3100 les versions reviennent après une panne réseau',async()=>{
  fetcher.mockRejectedValueOnce(new TypeError('network')).mockResolvedValue(oeuvre);
  expect((await result(()=>chargerOeuvreAlbum(1))).value).toEqual(oeuvre);expect(fetcher).toHaveBeenCalledTimes(2);
});
it('3100 un 404 est une absence sans nouvel essai',async()=>{
  fetcher.mockRejectedValue(error(404));expect((await result(chargerMembresOeuvres)).value).toEqual([]);
  expect((await result(()=>chargerOeuvreAlbum(1))).value).toBeNull();expect(fetcher).toHaveBeenCalledTimes(2);
});
it('3100 la fonction désactivée est une absence explicite',async()=>{
  fetcher.mockResolvedValue({enabled:false,works,versions:oeuvre.versions});
  expect((await result(chargerMembresOeuvres)).value).toEqual([]);
  expect((await result(()=>chargerOeuvreAlbum(1))).value).toBeNull();
});
it('3100 un 403 reste une erreur sans répétition',async()=>{
  const e=error(403);fetcher.mockRejectedValue(e);
  expect((await result(chargerMembresOeuvres)).error).toBe(e);expect(fetcher).toHaveBeenCalledTimes(1);
});
it('3100 les 503 persistants sont bornés et ne deviennent pas une liste vide',async()=>{
  const e=error(503);fetcher.mockRejectedValue(e);
  expect((await result(chargerMembresOeuvres)).error).toBe(e);expect(fetcher).toHaveBeenCalledTimes(3);
});
it('3100 une réponse mal formée ne signifie pas absence de versions',async()=>{
  fetcher.mockResolvedValue({});
  expect((await result(()=>chargerOeuvreAlbum(1))).error).toBeInstanceOf(Error);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('3100 l’erreur est traduite dans quinze langues',()=>{
  for(const langue of ONZE_LANGUES) expect(dictionnaire(langue)['works.loadError'],langue).toBeTruthy();
});
