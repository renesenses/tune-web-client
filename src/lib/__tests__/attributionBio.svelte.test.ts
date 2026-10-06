// @vitest-environment jsdom
//
// Attribution des biographies — préalable à site-mozaiklabs#278 (Bertrand,
// 06/10/2026). Quand l'IA est indisponible, le site publie l'extrait Wikipédia
// comme bio ; la licence CC BY-SA 4.0 exige d'en nommer la source, l'article
// et la licence. Avant ce lot, AUCUN composant ne lisait `bio_provenance` :
// le texte s'affichait sans attribution.
//
// Contre-épreuves : sans provenance (serveur ancien) et pour une bio IA, la
// ligne n'existe pas ; la même bio rendue SANS la prop n'a pas de ligne.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import BioEtTitresPhares from '../../components/v2/BioEtTitresPhares.svelte';
import AttributionBio from '../../components/v2/AttributionBio.svelte';
import { attributionBio, licenceLisible, provenanceDe } from '../library/attributionBio';
import { locale } from '../i18n';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const WIKI = {
  source: 'wikipedia',
  source_url: 'https://fr.wikipedia.org/wiki/Bill_Evans',
  license: 'CC BY-SA 4.0',
  lang: 'fr',
};

describe('attributionBio — règles', () => {
  it('Wikipédia : article, titre lisible, licence CC BY-SA 4.0 et son lien', () => {
    const a = attributionBio(WIKI)!;
    expect(a.cleSource).toBe('v2.bioAttr.wikipedia');
    expect(a.urlArticle).toBe('https://fr.wikipedia.org/wiki/Bill_Evans');
    expect(a.titreArticle).toBe('Bill Evans');
    expect(a.licence).toBe('CC BY-SA 4.0');
    expect(a.urlLicence).toBe('https://creativecommons.org/licenses/by-sa/4.0/');
  });

  it('la graphie du serveur (« CC-BY-SA-4.0 ») et celle du site se rejoignent', () => {
    expect(licenceLisible('CC-BY-SA-4.0')).toEqual(licenceLisible('CC BY-SA 4.0'));
    expect(licenceLisible('CC-BY-SA-3.0').url).toBe('https://creativecommons.org/licenses/by-sa/3.0/');
    expect(licenceLisible('TheAudioDB')).toEqual({ libelle: 'TheAudioDB', url: null });
  });

  it('Wikipédia sans licence explicite (proxy) : CC BY-SA 4.0 quand même', () => {
    const a = attributionBio({ source: 'wikipedia' })!;
    expect(a.licence).toBe('CC BY-SA 4.0');
    expect(a.urlArticle).toBeNull();
  });

  it('Last.fm : nom propre, article et licence CC BY-SA 3.0', () => {
    const a = attributionBio({ source: 'lastfm', source_url: 'https://www.last.fm/music/Bill+Evans', license: 'CC-BY-SA-3.0' })!;
    expect(a.nomSource).toBe('Last.fm');
    expect(a.cleSource).toBeNull();
    expect(a.licence).toBe('CC BY-SA 3.0');
    expect(a.titreArticle).toBeNull();
  });

  it('TheAudioDB : la « licence » qui répète le nom est tue', () => {
    const a = attributionBio({ source: 'theaudiodb', license: 'TheAudioDB' })!;
    expect(a.nomSource).toBe('TheAudioDB');
    expect(a.licence).toBeNull();
  });

  it('contre-épreuve : IA, repli « community », provenance absente → rien', () => {
    expect(attributionBio({ source: 'ai', license: 'CC BY-SA 4.0' })).toBeNull();
    expect(attributionBio({ source: 'claude' })).toBeNull();
    expect(attributionBio({ source: 'community' })).toBeNull();
    expect(attributionBio(null)).toBeNull();
    expect(attributionBio({ source: '' })).toBeNull();
    expect(attributionBio({ source: 'inconnue' }), 'étiquette interne sans rien d’autre').toBeNull();
  });

  it('un lien n’est posé que sur une URL http(s)', () => {
    expect(attributionBio({ source: 'wikipedia', source_url: 'javascript:alert(1)' })!.urlArticle).toBeNull();
  });

  it('provenanceDe : `bio_provenance` d’abord, sinon les champs à plat du proxy', () => {
    expect(provenanceDe({ bio: 'x', source: 'ai', bio_provenance: WIKI })).toBe(WIKI);
    expect(provenanceDe({ bio: 'x', source: 'wikipedia' })).toEqual({ source: 'wikipedia', source_url: null, license: null });
    expect(provenanceDe({ bio: 'x' })).toBeNull();
    expect(provenanceDe({ bio: 'x', bio_provenance: null, source: null })).toBeNull();
    expect(provenanceDe(null)).toBeNull();
  });
});

describe('AttributionBio — rendu', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver);
    locale.set('fr');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  function monter(comp: any, props: Record<string, unknown>) {
    const cible = document.createElement('div');
    document.body.appendChild(cible);
    const c = mount(comp, { target: cible, props });
    flushSync();
    return c;
  }
  const ligne = () => document.querySelector<HTMLElement>('.bio-attrib');

  it('sous la biographie : « Source : Wikipédia — Bill Evans — licence CC BY-SA 4.0 », liens sûrs', () => {
    const c = monter(BioEtTitresPhares, { bio: 'Pianiste de jazz américain.', provenance: WIKI, titres: [], cle: 1 });
    const l = ligne();
    expect(l, 'la ligne d’attribution doit exister').not.toBeNull();
    expect(l!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Source : Wikipédia — Bill Evans — licence CC BY-SA 4.0');
    const liens = [...l!.querySelectorAll('a')];
    expect(liens.map((a) => a.getAttribute('href'))).toEqual([
      'https://fr.wikipedia.org/wiki/Bill_Evans',
      'https://creativecommons.org/licenses/by-sa/4.0/',
    ]);
    for (const a of liens) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    }
    unmount(c);
  });

  it('contre-épreuve : la même bio sans provenance (serveur ancien) n’a aucune ligne', () => {
    const c = monter(BioEtTitresPhares, { bio: 'Pianiste de jazz américain.', titres: [], cle: 1 });
    expect(document.querySelector('.bio')).not.toBeNull();
    expect(ligne()).toBeNull();
    unmount(c);
  });

  it('contre-épreuve : une bio IA n’a aucune ligne', () => {
    const c = monter(BioEtTitresPhares, { bio: 'Bio rédigée par l’IA.', provenance: { source: 'ai' }, titres: [], cle: 1 });
    expect(ligne()).toBeNull();
    unmount(c);
  });

  it('Last.fm sans article : la source et la licence seules', () => {
    const c = monter(AttributionBio, { provenance: { source: 'lastfm', license: 'CC-BY-SA-3.0' } });
    expect(ligne()!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Source : Last.fm — licence CC BY-SA 3.0');
    unmount(c);
  });

  it('se traduit : en anglais, « Source: Wikipedia — … — license … »', () => {
    locale.set('en');
    const c = monter(AttributionBio, { provenance: { source: 'wikipedia' } });
    expect(ligne()!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Source: Wikipedia — license CC BY-SA 4.0');
    unmount(c);
  });
});

describe('attribution — onze langues et deux fiches branchées', () => {
  it('les quatre clés existent, non vides, dans les onze langues', () => {
    for (const code of ONZE_LANGUES) {
      const d = dictionnaire(code) as Record<string, string>;
      for (const k of ['v2.bioAttr.source', 'v2.bioAttr.wikipedia', 'v2.bioAttr.article', 'v2.bioAttr.license']) {
        expect(d[k]?.trim(), `${code} : ${k}`).toBeTruthy();
      }
    }
  });

  const src = (f: string) => readFileSync(resolve(__dirname, '../../components/v2', f), 'utf8');

  it('fiche album : la provenance de `/albums/{id}/bio` part sous la notice', () => {
    const s = src('AlbumDetailV2.svelte');
    expect(s).toMatch(/bioProvenance = provenanceDe\(r\)/);
    expect(s).toMatch(/<AttributionBio provenance=\{bioProvenance\} \/>/);
  });

  it('fiche artiste : la provenance accompagne la bio jusqu’au bloc commun', () => {
    const s = src('ArtisteServiceV2.svelte');
    expect(s).toMatch(/<BioEtTitresPhares bio=\{bio\} provenance=\{bioProvenance\}/);
    expect(s).toMatch(/bioProvenance = bio \? provenanceDe\(r\) : null/);
    expect(src('BioEtTitresPhares.svelte')).toMatch(/<AttributionBio \{provenance\} \/>/);
  });
});
