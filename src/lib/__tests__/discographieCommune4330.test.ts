// renesenses/tune-server-rust#4330 — FabienM, fil forum 1823 « Page artiste
// commune » (16/09/2026), et ses réponses du 17/09/2026 :
//
//   1. « une autre édition (remaster / Live / Bonus / Delux) est un album à
//      part entière […] pour une même édition d'un album, si elle est présente
//      dans plusieurs sources alors Tune propose une seule vignette avec les
//      logos des sources. »
//   2. « L'indispensable est la source. Après si tu as l'info de la qualité
//      […] tu peux l'ajouter. »
//   3. « si l'album est dans la bibliothèque alors tu affiches l'album de la
//      bibliothèque. Si absent […] par ordre de préférence : Qobuz, Tidal,
//      Youtube, Bancamp »
import { describe, expect, it } from 'vitest';
import {
  cleEdition, compterFocus, comptesProvenanceFiche, dansProvenance, filtrerFocus, fusionnerDiscographie, qualiteDe,
} from '../discographieCommune';
import type { Album } from '../types';

const al = (o: Record<string, unknown>) => o as unknown as Album;

describe('#4330 — la clé d’édition', () => {
  it('replie accents, casse, apostrophes et ponctuation', () => {
    expect(cleEdition('C’est déjà ça')).toBe(cleEdition("C'est deja CA"));
    expect(cleEdition('Simon & Garfunkel')).toBe(cleEdition('Simon and Garfunkel'));
  });

  it('GARDE les suffixes d’édition : un remaster n’est pas l’original', () => {
    expect(cleEdition('Wanderer')).not.toBe(cleEdition('Wanderer (Deluxe Edition)'));
    expect(cleEdition('The Greatest')).not.toBe(cleEdition('The Greatest (Live)'));
  });
});

describe('#4330 — la fusion', () => {
  const locaux = [al({ id: 7, title: 'The Greatest', year: 2006 })];
  const services = [
    { service: 'tidal', albums: [al({ source_id: 'T1', title: 'The Greatest', source: 'tidal' })] },
    { service: 'qobuz', albums: [
      al({ source_id: 'Q1', title: 'THE GREATEST', source: 'qobuz' }),
      al({ source_id: 'Q2', title: 'The Greatest (Deluxe)', source: 'qobuz' }),
      al({ source_id: 'Q3', title: 'Covers', source: 'qobuz' }),
    ] },
  ];

  it('une même édition dans trois sources = UNE vignette, ses sources rangées', () => {
    const e = fusionnerDiscographie(locaux, services);
    expect(e.map((x) => x.principal.album.title)).toEqual(['The Greatest', 'The Greatest (Deluxe)', 'Covers']);
    expect(e[0].sources).toEqual(['local', 'qobuz', 'tidal']);
  });

  it('la bibliothèque prime ; sinon Qobuz, Tidal, YouTube, Bandcamp', () => {
    const e = fusionnerDiscographie(locaux, services);
    expect(e[0].principal.source).toBe('local');

    const sansLocal = fusionnerDiscographie([], [
      { service: 'bandcamp', albums: [al({ source_id: 'B', title: 'X' })] },
      { service: 'youtube', albums: [al({ source_id: 'Y', title: 'X' })] },
      { service: 'tidal', albums: [al({ source_id: 'T', title: 'X' })] },
      { service: 'deezer', albums: [al({ source_id: 'D', title: 'X' })] },
    ]);
    expect(sansLocal[0].principal.source).toBe('tidal');
    expect(sansLocal[0].sources).toEqual(['tidal', 'youtube', 'bandcamp', 'deezer']);
  });

  it('un service qui rend deux fois la même édition ne pose qu’une pastille', () => {
    const e = fusionnerDiscographie([], [{ service: 'qobuz', albums: [
      al({ source_id: 'Q1', title: 'Moon Pix' }), al({ source_id: 'Q9', title: 'Moon Pix' }),
    ] }]);
    expect(e).toHaveLength(1);
    expect(e[0].sources).toEqual(['qobuz']);
    expect(e[0].principal.album.source_id).toBe('Q1');
  });

  it('un album sans titre garde sa vignette et n’avale personne', () => {
    const e = fusionnerDiscographie([al({ id: 1, title: '' }), al({ id: 2, title: '' })], []);
    expect(e).toHaveLength(2);
  });
});

describe('#4330 — la qualité, lue sous ses deux formes', () => {
  it('bibliothèque : champs à plat', () => {
    expect(qualiteDe({ source: 'local', album: al({ bit_depth: 24, sample_rate: 96000, format: 'flac' }) })).toBe('hires');
    expect(qualiteDe({ source: 'local', album: al({ bit_depth: 16, sample_rate: 44100, format: 'flac' }) })).toBe('cd');
    expect(qualiteDe({ source: 'local', album: al({ format: 'mp3' }) })).toBe('lossy');
    expect(qualiteDe({ source: 'local', album: al({}) })).toBeNull();
  });

  it('service : l’OBJET `quality` que sérialise `StreamQuality`', () => {
    expect(qualiteDe({ source: 'qobuz', album: al({ quality: { codec: 'FLAC', sample_rate: 192000, bit_depth: 24 } }) })).toBe('hires');
    expect(qualiteDe({ source: 'qobuz', album: al({ quality: { codec: 'FLAC', sample_rate: 44100, bit_depth: 16 } }) })).toBe('cd');
    expect(qualiteDe({ source: 'youtube', album: al({}) })).toBe('lossy');
  });
});

describe('#4330 — le Focus', () => {
  const e = fusionnerDiscographie(
    [al({ id: 1, title: 'A', bit_depth: 16, format: 'flac' })],
    [{ service: 'qobuz', albums: [
      al({ source_id: 'QA', title: 'A', quality: { codec: 'FLAC', sample_rate: 96000, bit_depth: 24 } }),
      al({ source_id: 'QB', title: 'B', quality: { codec: 'FLAC', sample_rate: 44100, bit_depth: 16 } }),
    ] }],
  );

  it('compte sur la discographie entière, sources dans l’ordre de préférence', () => {
    const c = compterFocus(e);
    expect(c.sources).toEqual([{ source: 'local', n: 1 }, { source: 'qobuz', n: 2 }]);
    expect(c.qualites).toEqual([{ qualite: 'hires', n: 1 }, { qualite: 'cd', n: 2 }]);
  });

  it('OU dans un axe, ET entre les axes, rien de coché = tout', () => {
    const titres = (s: string[], q: any[]) =>
      filtrerFocus(e, { sources: new Set(s), qualites: new Set(q) }).map((x) => x.principal.album.title);
    expect(titres([], [])).toEqual(['A', 'B']);
    expect(titres(['local'], [])).toEqual(['A']);
    expect(titres(['local', 'qobuz'], [])).toEqual(['A', 'B']);
    expect(titres(['qobuz'], ['hires'])).toEqual(['A']);
  });
});

describe('#4330 — le menu « Source » de la Bibliothèque, fiche ouverte', () => {
  const e = fusionnerDiscographie(
    [al({ id: 1, title: 'A', source: 'local' }), al({ id: 2, title: 'U', source: 'upnp', source_id: 'uuid:srv|42' })],
    [
      { service: 'qobuz', albums: [al({ source_id: 'QA', title: 'A' }), al({ source_id: 'QB', title: 'B' })] },
      { service: 'tidal', albums: [al({ source_id: 'TB', title: 'B' })] },
    ],
  );

  it('compte chaque source une fois par vignette, services compris ; total = vignettes', () => {
    const c = comptesProvenanceFiche(e);
    expect(c.total).toBe(3);
    expect(Object.fromEntries(c.comptes)).toEqual({ local: 1, 'upnp:uuid:srv': 1, upnp: 1, qobuz: 2, tidal: 1 });
  });

  it('filtre : un exemplaire de la source suffit ; « upnp » couvre ses serveurs', () => {
    const t = (f: string | null) => e.filter((x) => dansProvenance(x, f)).map((x) => x.principal.album.title);
    expect(t(null)).toEqual(['A', 'U', 'B']);
    expect(t('qobuz')).toEqual(['A', 'B']);
    expect(t('tidal')).toEqual(['B']);
    expect(t('local')).toEqual(['A']);
    expect(t('upnp')).toEqual(['U']);
  });
});
