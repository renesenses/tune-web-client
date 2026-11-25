// @vitest-environment jsdom
//
// rc14 — le greffon TESS « Casque » (`equalizer-headphone`) tiré d'OPRA :
//   1. fonctions pures (`tessCasque.ts`) : référence, bandes libres, réglages
//      de l'aperçu, tracé de la courbe, erreurs nommées ;
//   2. le panneau : chercher, choisir une variante, voir la courbe et le
//      préampli, appliquer (les `settings` du SERVEUR partent par
//      `onChange`), régler le niveau d'un profil en place ;
//   3. l'écran TESS monte ce panneau pour `equalizer-headphone`, sans lien
//      vers l'ancien écran ;
//   4. les clés existent dans les 20 langues.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({ chercherCasqueOpra: vi.fn(), apercuCasqueOpra: vi.fn() }));
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, ...mocks };
});

import PanneauCasqueOpra from '../../components/v2/tess/PanneauCasqueOpra.svelte';
import ReglagesGreffonTess from '../../components/v2/tess/ReglagesGreffonTess.svelte';
import { locale } from '../i18n';
import type { CasqueOpraApercu } from '../api';
import {
  referenceOpra, aDesBandesLibres, reglagesDepuisApercu, nomDuCasque, libelleVariante, formatDb,
  plageCourbe, traceCourbe, cleErreurOpra, bornerNiveau,
} from '../tessCasque';
import { genrePanneau } from '../tessPanneaux';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const en = dictionnaire('en');
const HD650 = 'sennheiser:hd650::oratory1990_harman_target';

const REF = {
  id: HD650, product_id: 'sennheiser::hd650', vendor: 'Sennheiser', product: 'HD650',
  author: 'oratory1990', details: 'Harman Target', license: 'CC BY-SA 4.0', level: 100, bands_digest: 'abc',
};

function apercu(level = 100): CasqueOpraApercu {
  const bands = [{ freq: 105, gain: 5.5 * level / 100, q: 0.71, type: 'low_shelf' }] as any;
  return {
    id: HD650,
    product: { id: 'sennheiser::hd650', vendor: 'Sennheiser', name: 'HD650', form: 'over_the_ear' },
    variant: { id: HD650, author: 'oratory1990', details: 'Harman Target' },
    bands,
    level,
    settings: { listening: 'headphones', bands, headroom_mode: 'realistic', opra: { ...REF, level } },
    preamp_db: -6.1,
    curve: { frequency_hz: [20, 200, 2000, 20000], gain_db: [5.5, 3, 0, 0] },
    source: { name: 'OPRA', url: 'https://github.com/opra-project/OPRA', license: 'CC BY-SA 4.0' },
  };
}

const RECHERCHE = {
  query: 'hd650', total: 1,
  source: { name: 'OPRA', url: 'https://github.com/opra-project/OPRA', license: 'CC BY-SA 4.0' },
  results: [{
    id: 'sennheiser::hd650', vendor: 'Sennheiser', name: 'HD650', form: 'over_the_ear',
    variants: [
      { id: HD650, author: 'oratory1990', details: 'Harman Target' },
      { id: 'sennheiser:hd650::autoeq_crinacle', author: 'AutoEQ', details: 'Measured by crinacle' },
    ],
  }],
};

let hote: HTMLElement;
let composant: Record<string, any> | null = null;
const nouveauOnChange = () => vi.fn<(id: string, reglages: Record<string, any>) => void>();
let onChange: ReturnType<typeof nouveauOnChange>;

async function attendre() {
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function monter(settings: Record<string, unknown> | null) {
  composant = mount(PanneauCasqueOpra, {
    target: hote,
    props: { lien: { id: 'equalizer-headphone', enabled: true, settings } as any, onChange },
  });
  await attendre();
}

const un = <T extends Element = HTMLElement>(sel: string) => hote.querySelector(sel) as T | null;

async function chercher(q: string) {
  const input = un<HTMLInputElement>('[data-tess-casque-requete]')!;
  input.value = q;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  un<HTMLFormElement>('[data-tess-casque-recherche]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await attendre();
}

beforeEach(() => {
  locale.set('en');
  hote = document.createElement('div');
  document.body.appendChild(hote);
  onChange = nouveauOnChange();
  mocks.chercherCasqueOpra.mockReset();
  mocks.apercuCasqueOpra.mockReset();
  mocks.chercherCasqueOpra.mockResolvedValue(RECHERCHE);
  mocks.apercuCasqueOpra.mockImplementation(async (_id: string, level = 100) => apercu(level));
});
afterEach(() => {
  if (composant) unmount(composant);
  composant = null;
  hote.remove();
});

describe('Casque — fonctions pures', () => {
  it('lit la référence OPRA des réglages, et rien sans elle', () => {
    expect(referenceOpra({ opra: REF })?.id).toBe(HD650);
    expect(referenceOpra({ opra: { ...REF, level: 250 } })?.level).toBe(100);
    expect(referenceOpra({ opra: { id: '' } })).toBeNull();
    expect(referenceOpra(null)).toBeNull();
  });

  it('distingue des bandes libres d’un profil reconnu', () => {
    expect(aDesBandesLibres({ bands: [{ freq: 100, gain: 1, q: 1, type: 'peak' }] })).toBe(true);
    expect(aDesBandesLibres({ bands: [{ freq: 100, gain: 1, q: 1, type: 'peak' }], opra: REF })).toBe(false);
    expect(aDesBandesLibres({ bands: [] })).toBe(false);
  });

  it('pose les réglages du serveur sans perdre un champ inconnu', () => {
    const r = reglagesDepuisApercu({ futur: 1, bands: [], enabled: true }, apercu(70));
    expect(r.futur).toBe(1);
    expect((r.opra as any).id).toBe(HD650);
    expect((r.opra as any).level).toBe(70);
    expect(r.enabled).toBeUndefined();
  });

  it('nomme le casque et sa variante', () => {
    expect(nomDuCasque('Sennheiser', 'HD650')).toBe('Sennheiser HD650');
    expect(nomDuCasque('Sony', 'Sony WH-1000XM4')).toBe('Sony WH-1000XM4');
    expect(libelleVariante('oratory1990', 'Harman Target')).toBe('oratory1990 · Harman Target');
    expect(libelleVariante('AutoEQ', '')).toBe('AutoEQ');
  });

  it('écrit les dB, la plage et le tracé de la courbe', () => {
    expect(formatDb(-7.24, 'en')).toBe('−7.2 dB');
    expect(formatDb(0, 'en')).toBe('0.0 dB');
    expect(plageCourbe([1, -2])).toEqual({ bas: -6, haut: 6 });
    // Asymétrique : chaque bord suit la courbe, par paliers de 3 dB.
    expect(plageCourbe([7.5, -2])).toEqual({ bas: -6, haut: 9 });
    expect(plageCourbe([2, -13])).toEqual({ bas: -15, haut: 6 });
    expect(plageCourbe([40, -50])).toEqual({ bas: -30, haut: 20 });
    const d = traceCourbe([20, 20000], [6, -6], 100, 50, { bas: -6, haut: 6 });
    expect(d).toBe('M0.0,0.0 L100.0,50.0');
    // Le zéro n'est plus au milieu d'une plage asymétrique.
    expect(traceCourbe([20, 20000], [0, 0], 100, 60, { bas: -12, haut: 6 })).toBe('M0.0,20.0 L100.0,20.0');
    expect(traceCourbe([20], [0], 100, 50, { bas: -6, haut: 6 })).toBe('');
    expect(bornerNiveau(103)).toBe(100);
    expect(bornerNiveau(-4)).toBe(0);
  });

  it('nomme chaque erreur du serveur', () => {
    expect(cleErreurOpra({ status: 503, code: 'opra_unreachable' })).toBe('tess.headphone.error.offline');
    expect(cleErreurOpra({ status: 422, code: 'opra_profile_unsupported' })).toBe('tess.headphone.error.unsupported');
    expect(cleErreurOpra({ status: 404, code: 'opra_profile_unknown' })).toBe('tess.headphone.error.unknown');
    // Un serveur rc13 n'a pas la route.
    expect(cleErreurOpra({ status: 404 })).toBe('tess.headphone.error.notSupported');
    expect(cleErreurOpra(new Error('x'))).toBe('tess.headphone.error.generic');
  });

  it('le casque a son propre panneau', () => {
    expect(genrePanneau('equalizer-headphone')).toBe('eq-casque');
  });
});

describe('Casque — le panneau', () => {
  it('sans profil, invite à chercher', async () => {
    await monter(null);
    expect(un('[data-tess-casque-aucun]')?.textContent).toBe(en['tess.headphone.none']);
    expect(mocks.apercuCasqueOpra).not.toHaveBeenCalled();
    expect(un('[data-tess-casque-niveau]')).toBeNull();
  });

  it('cherche, choisit une variante, montre courbe et préampli, puis applique', async () => {
    await monter({ futur: 'garde' });
    await chercher('hd650');
    expect(mocks.chercherCasqueOpra).toHaveBeenCalledWith('hd650');
    expect(un('[data-tess-casque-produit="sennheiser::hd650"]')?.textContent).toContain('Sennheiser HD650');
    expect(hote.querySelectorAll('[data-tess-casque-variante]')).toHaveLength(2);

    un<HTMLButtonElement>(`[data-tess-casque-variante="${HD650}"]`)!.click();
    await attendre();
    expect(mocks.apercuCasqueOpra).toHaveBeenCalledWith(HD650, 100);
    expect(un('[data-tess-casque-courbe] path')?.getAttribute('d')).toMatch(/^M0\.0,/);
    expect(un('[data-tess-casque-preampli]')?.textContent).toContain('−6.1 dB');
    expect(un('[data-tess-casque-source]')?.textContent).toContain('CC BY-SA 4.0');
    expect(onChange).not.toHaveBeenCalled();

    un<HTMLButtonElement>('[data-tess-casque-appliquer]')!.click();
    await attendre();
    expect(onChange).toHaveBeenCalledTimes(1);
    const [id, reglages] = onChange.mock.calls[0];
    expect(id).toBe('equalizer-headphone');
    expect(reglages.opra.id).toBe(HD650);
    expect(reglages.headroom_mode).toBe('realistic');
    expect(reglages.futur).toBe('garde');
  });

  it('un profil en place se montre, et son niveau s’applique aussitôt', async () => {
    await monter({ bands: [{ freq: 105, gain: 5.5, q: 0.71, type: 'low_shelf' }], opra: REF });
    expect(un('[data-tess-casque-nom]')?.textContent).toBe('Sennheiser HD650');
    expect(mocks.apercuCasqueOpra).toHaveBeenCalledWith(HD650, 100);
    expect(un(`[data-tess-casque-apercu="${HD650}"]`)).toBeTruthy();

    const niveau = un<HTMLInputElement>('[data-tess-casque-niveau]')!;
    niveau.value = '50';
    niveau.dispatchEvent(new Event('change', { bubbles: true }));
    await attendre();
    expect(mocks.apercuCasqueOpra).toHaveBeenLastCalledWith(HD650, 50);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][1].opra.level).toBe(50);
  });

  it('des bandes libres le disent', async () => {
    await monter({ bands: [{ freq: 105, gain: 5.5, q: 0.71, type: 'low_shelf' }] });
    expect(un('[data-tess-casque-libres]')?.textContent).toBe(en['tess.headphone.freeBands']);
  });

  it('OPRA injoignable : le message traduit, jamais une liste vide', async () => {
    mocks.chercherCasqueOpra.mockRejectedValue(Object.assign(new Error('x'), { status: 503, code: 'opra_unreachable' }));
    await monter(null);
    await chercher('hd650');
    expect(un('[data-tess-casque-erreur]')?.textContent).toBe(en['tess.headphone.error.offline']);
    expect(un('[data-tess-casque-vide]')).toBeNull();
  });

  it('aucun résultat : la requête est rappelée', async () => {
    mocks.chercherCasqueOpra.mockResolvedValue({ ...RECHERCHE, results: [], total: 0 });
    await monter(null);
    await chercher('zzz');
    expect(un('[data-tess-casque-vide]')?.textContent).toBe(en['tess.headphone.noResult'].replace('{q}', 'zzz'));
  });

  it('verrouillé : rien ne part', async () => {
    composant = mount(PanneauCasqueOpra, {
      target: hote,
      props: { lien: { id: 'equalizer-headphone', enabled: true, settings: null } as any, onChange, verrou: 'Premium' },
    });
    await attendre();
    await chercher('hd650');
    expect(mocks.chercherCasqueOpra).not.toHaveBeenCalled();
  });
});

describe('Casque — l’écran TESS', () => {
  it('monte le panneau OPRA pour equalizer-headphone, sans lien vers l’ancien écran', async () => {
    composant = mount(ReglagesGreffonTess, {
      target: hote,
      props: {
        lien: { id: 'equalizer-headphone', enabled: true, settings: null } as any,
        nom: 'Headphone EQ', zoneId: 3, ecranHistorique: 'Equalizer',
        onToggle: vi.fn(), onRemove: vi.fn(), onChange, onOuvrirEcran: vi.fn(),
      },
    });
    await attendre();
    expect(un('[data-tess-casque]')).toBeTruthy();
    expect(un('[data-tess-ecran-historique]')).toBeNull();
    // L'interrupteur du greffon reste celui de l'en-tête.
    expect(un('[data-tess-reglages="equalizer-headphone"] header input')).toBeTruthy();
  });

  it('les autres égaliseurs gardent leur panneau', async () => {
    composant = mount(ReglagesGreffonTess, {
      target: hote,
      props: {
        lien: { id: 'equalizer-parametric', enabled: true, settings: null } as any,
        nom: 'Parametric EQ', zoneId: 3,
        onToggle: vi.fn(), onRemove: vi.fn(), onChange,
      },
    });
    await attendre();
    expect(un('[data-tess-casque]')).toBeNull();
    expect(un('[data-tess-panneau="equalizer-parametric"]')).toBeTruthy();
  });
});

describe('Casque — traductions', () => {
  it('chaque clé tess.headphone.* existe, non vide, dans les 20 langues', () => {
    const cles = Object.keys(en).filter((k) => k.startsWith('tess.headphone.'));
    expect(cles.length).toBe(28);
    expect(ONZE_LANGUES).toHaveLength(20);
    const fr = dictionnaire('fr');
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      for (const k of cles) expect(d[k], `${l} ${k}`).toBeTruthy();
      // Traduites, pas recopiées de l'anglais (hors noms propres).
      if (l !== 'en') expect(d['tess.headphone.searchLabel'], l).not.toBe(en['tess.headphone.searchLabel']);
    }
    for (const k of cles) {
      for (const p of (en[k].match(/\{\w+\}/g) ?? [])) expect(fr[k], k).toContain(p);
    }
  });
});
