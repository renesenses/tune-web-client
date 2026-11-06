// @vitest-environment jsdom
//
// #8010 (contrat serveur #7930) — la fiche dit quand la biographie n'existe
// pas dans la langue de l'interface. Quatre cas : repli fr pour une interface
// en anglais, pas de repli, `repli` absent (serveur ancien), `langue_disponible`
// null.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import BioEtTitresPhares from '../../components/v2/BioEtTitresPhares.svelte';
import { langueBioDe, nomLangue } from '../library/langueBio';
import { locale } from '../i18n';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const REPLI_FR = {
  bio: 'Pianiste de jazz américain.',
  bio_provenance: { source: 'community', lang: 'fr' },
  repli: { raison: 'langue_indisponible', langue_demandee: 'en', langue_disponible: 'fr' },
};

describe('langueBioDe', () => {
  it('repli fr : langue servie et langue du repli', () => {
    expect(langueBioDe(REPLI_FR)).toEqual({ langue: 'fr', repliVers: 'fr' });
  });
  it('pas de repli : la langue servie seule, aucune mention', () => {
    expect(langueBioDe({ bio: 'x', bio_provenance: { source: 'wikipedia', lang: 'en' } })).toEqual({ langue: 'en', repliVers: null });
  });
  it('serveur ancien (ni lang ni repli) : rien', () => {
    expect(langueBioDe({ bio: 'x', bio_provenance: { source: 'wikipedia' } })).toEqual({ langue: null, repliVers: null });
    expect(langueBioDe({ bio: 'x' })).toEqual({ langue: null, repliVers: null });
    expect(langueBioDe(null)).toEqual({ langue: null, repliVers: null });
  });
  it('langue_disponible null : aucune mention', () => {
    expect(langueBioDe({ bio: null, repli: { raison: 'langue_indisponible', langue_demandee: 'en', langue_disponible: null } }).repliVers).toBeNull();
  });
  it('un code farfelu n’est jamais posé en attribut lang', () => {
    expect(langueBioDe({ bio_provenance: { lang: '"><script>' }, repli: { langue_disponible: 'x y' } })).toEqual({ langue: null, repliVers: null });
  });
  it('nomLangue : le nom dans la langue de l’interface', () => {
    expect(nomLangue('fr', 'en')).toBe('French');
    expect(nomLangue('en', 'fr')).toBe('anglais');
  });
});

describe('BioEtTitresPhares — mention de repli', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });
  function monter(langueBio: any) {
    const cible = document.createElement('div');
    document.body.appendChild(cible);
    const c = mount(BioEtTitresPhares, { target: cible, props: { bio: REPLI_FR.bio, titres: [], cle: 1, ...(langueBio === undefined ? {} : { langueBio }) } });
    flushSync();
    return c;
  }
  const mention = () => document.querySelector<HTMLElement>('[data-bio-repli]');

  it('interface en anglais, repli fr : « Biography available only in French », lang="fr"', () => {
    locale.set('en');
    const c = monter(langueBioDe(REPLI_FR));
    expect(mention()!.textContent!.trim()).toBe('Biography available only in French');
    expect(document.querySelector('p.bio')!.getAttribute('lang')).toBe('fr');
    unmount(c);
  });
  it('interface en français, repli en : « Biographie disponible seulement en anglais »', () => {
    locale.set('fr');
    const c = monter({ langue: 'en', repliVers: 'en' });
    expect(mention()!.textContent!.trim()).toBe('Biographie disponible seulement en anglais');
    unmount(c);
  });
  it('pas de repli : pas de mention, lang posé', () => {
    locale.set('en');
    const c = monter({ langue: 'en', repliVers: null });
    expect(mention()).toBeNull();
    expect(document.querySelector('p.bio')!.getAttribute('lang')).toBe('en');
    unmount(c);
  });
  it('serveur ancien (prop absente) : ni mention ni attribut lang', () => {
    locale.set('en');
    const c = monter(undefined);
    expect(mention()).toBeNull();
    expect(document.querySelector('p.bio')!.hasAttribute('lang')).toBe(false);
    unmount(c);
  });
  it('langue_disponible null : pas de mention', () => {
    locale.set('en');
    const c = monter(langueBioDe({ bio: 'x', repli: { raison: 'langue_indisponible', langue_demandee: 'en', langue_disponible: null } }));
    expect(mention()).toBeNull();
    unmount(c);
  });
});

describe('textes de la mention dans toutes les langues', () => {
  for (const l of ONZE_LANGUES) {
    it(`${l} : deux libellés avec {langue}`, () => {
      const d = dictionnaire(l);
      for (const k of ['v2.bioRepli.bio', 'v2.bioRepli.notes']) {
        expect(d[k], `${l} ${k}`).toContain('{langue}');
      }
    });
  }
});
