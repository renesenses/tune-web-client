import { describe, expect, it } from 'vitest';
import { adresseCatalogue, type FiltresCatalogue } from './catalogueExport';

const base: FiltresCatalogue = { qualites: [], formats: [], tri: 'title', ordreAnnee: 'desc' };

function params(f: Partial<FiltresCatalogue>): URLSearchParams {
  const adresse = adresseCatalogue({ ...base, ...f });
  expect(adresse.startsWith('/export/catalogue.html?')).toBe(true);
  return new URLSearchParams(adresse.split('?')[1]);
}

describe('web#2622 — Exporter le catalogue avec les filtres en cours', () => {
  it('sans filtre : tout le catalogue, par titre', () => {
    const p = params({});
    expect(p.get('sort')).toBe('title');
    expect(p.has('quality')).toBe(false);
    expect(p.has('format')).toBe(false);
    expect(p.has('genre')).toBe(false);
    expect(p.has('artist')).toBe(false);
  });

  it('transmet les qualités et les formats cochés (OU dans une facette)', () => {
    const p = params({ qualites: ['hires', 'dsd'], formats: ['FLAC', 'WAV'] });
    expect(p.get('quality')).toBe('hires,dsd');
    expect(p.get('format')).toBe('flac,wav');
  });

  it('transmet le genre ou l’artiste ouvert, encodé', () => {
    expect(params({ genre: 'Jazz & Blues' }).get('genre')).toBe('Jazz & Blues');
    expect(adresseCatalogue({ ...base, genre: 'Jazz & Blues' })).toContain('genre=Jazz+%26+Blues');
    expect(params({ artiste: 'Miles Davis' }).get('artist')).toBe('Miles Davis');
  });

  it('reprend le tri par artiste et par année, avec son sens', () => {
    expect(params({ tri: 'artist' }).get('sort')).toBe('artist');
    const p = params({ tri: 'year', ordreAnnee: 'asc' });
    expect(p.get('sort')).toBe('year');
    expect(p.get('order')).toBe('asc');
    expect(params({ tri: 'release_date', ordreAnnee: 'desc' }).get('order')).toBe('desc');
  });

  it('un tri inconnu du catalogue retombe sur le titre', () => {
    expect(params({ tri: 'random' }).get('sort')).toBe('title');
    expect(params({ tri: 'added' }).get('sort')).toBe('title');
  });

  it('passe la langue de l’interface', () => {
    expect(params({ langue: 'fr' }).get('lang')).toBe('fr');
    expect(params({ langue: 'de' }).get('lang')).toBe('en');
  });
});
