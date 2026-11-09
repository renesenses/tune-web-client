// renesenses/tune-server-rust#8198, volet 3 — la logique de l'assistant pas à pas.
import { describe, expect, it } from 'vitest';
import {
  CLE_SAUT,
  NB_ETAPES,
  ecrireSaut,
  etapePrecedente,
  etapeSuivante,
  lireSaut,
  ouvertAuDepart,
} from '../assistantSpotify';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

function memoire() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

describe('#8198 — quatre écrans', () => {
  it('on avance et on recule sans sortir de 1…4', () => {
    expect(NB_ETAPES).toBe(4);
    expect(etapeSuivante(1)).toBe(2);
    expect(etapeSuivante(4)).toBe(4);
    expect(etapePrecedente(1)).toBe(1);
    expect(etapePrecedente(3)).toBe(2);
  });

  it('ouvert de lui-même seulement s’il manque le Client ID et qu’on ne l’a pas sauté', () => {
    expect(ouvertAuDepart(true, false)).toBe(true);
    expect(ouvertAuDepart(true, true)).toBe(false);
    expect(ouvertAuDepart(false, false)).toBe(false);
  });

  it('« J’ai déjà mon Client ID » se retient, et se défait', () => {
    const s = memoire();
    expect(lireSaut(s)).toBe(false);
    ecrireSaut(true, s);
    expect(s.getItem(CLE_SAUT)).toBe('1');
    expect(lireSaut(s)).toBe(true);
    ecrireSaut(false, s);
    expect(lireSaut(s)).toBe(false);
  });

  it('un stockage qui lève ne casse rien', () => {
    const casse = {
      getItem: () => { throw new Error('bloqué'); },
      setItem: () => { throw new Error('bloqué'); },
      removeItem: () => { throw new Error('bloqué'); },
    };
    expect(lireSaut(casse)).toBe(false);
    expect(() => ecrireSaut(true, casse)).not.toThrow();
  });
});

describe('#8198 — les textes de l’assistant', () => {
  it('l’écran 3 rappelle le Premium du propriétaire et la limite de 5 utilisateurs, dans toutes les langues', () => {
    for (const l of ONZE_LANGUES) {
      const s = dictionnaire(l)['v2.spotify.asst.e3Premium'];
      expect(s, l).toContain('Premium');
      expect(s, l).toContain('5');
    }
  });

  it('le relais nomme l’adresse de mozaiklabs.fr et dit que rien n’est stocké', () => {
    expect(dictionnaire('fr')['v2.spotify.relais.texte']).toContain('Rien n’est stocké');
    for (const l of ONZE_LANGUES) expect(dictionnaire(l)['v2.spotify.relais.titre'], l).toContain('mozaiklabs.fr');
  });

  it('chaque texte est traduit (pas l’anglais recopié), sauf les mots identiques par nature', () => {
    const en = dictionnaire('en');
    const memesPartout = new Set(['v2.spotify.asst.description', 'v2.spotify.asst.nom']);
    for (const l of ONZE_LANGUES) {
      if (l === 'en') continue;
      const d = dictionnaire(l);
      for (const cle of ['v2.spotify.asst.e1Texte', 'v2.spotify.asst.e2Texte', 'v2.spotify.asst.e4Texte', 'v2.spotify.relais.texte']) {
        if (memesPartout.has(cle)) continue;
        expect(d[cle], `${l} ${cle}`).not.toBe(en[cle]);
      }
    }
  });
});
