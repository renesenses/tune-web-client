// tune-server-rust#8325 / web#2762 — les critères « Chef d'orchestre »,
// « Ensemble / orchestre » et « Œuvre » des collections et playlists
// intelligentes, comme « Compositeur » : un texte, les mêmes opérateurs, le
// même nom aux deux niveaux, un libellé dans les quinze langues.
import { describe, expect, it } from 'vitest';
import { CHAMPS, operateursDe } from '../smartRegles';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const CLASSIQUES = [
  ['conductor', 'smartCollection.fieldConductor'],
  ['ensemble', 'smartCollection.fieldEnsemble'],
  ['work', 'smartCollection.fieldWork'],
] as const;

describe('#8325 — critères classiques des règles intelligentes', () => {
  it('sont proposés comme Compositeur, aux deux niveaux', () => {
    const compositeur = CHAMPS.find((c) => c.value === 'composer')!;
    for (const [champ, cle] of CLASSIQUES) {
      const c = CHAMPS.find((x) => x.value === champ);
      expect(c, `critère ${champ} absent de l'éditeur`).toBeTruthy();
      expect(c!.labelKey).toBe(cle);
      expect(c!.type).toBe('text');
      expect(c!.piste, 'même nom dans une playlist').toBeUndefined();
      expect(c!.seulement, 'offert aux collections ET aux playlists').toBeUndefined();
      expect(operateursDe(champ).map((o) => o.value)).toEqual(
        operateursDe(compositeur.value).map((o) => o.value),
      );
    }
  });

  it('ont un libellé dans les quinze langues', () => {
    for (const langue of ONZE_LANGUES) {
      const d = dictionnaire(langue);
      for (const [, cle] of CLASSIQUES) {
        expect(d[cle], `${langue} : ${cle}`).toBeTruthy();
      }
      expect(d['app.task.readClassical'], `${langue} : app.task.readClassical`).toBeTruthy();
    }
  });
});
