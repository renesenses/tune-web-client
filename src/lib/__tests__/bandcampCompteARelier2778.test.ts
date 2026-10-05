/**
 * #2778 (FabienM, fil 1606) — le formulaire « relier votre compte » ne
 * revient que lorsque le serveur dit qu'aucun compte n'est relié (428).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compteBandcampARelier } from '../bandcampAchats';

function erreur(status: number, message: string) {
  const e = new Error(message) as Error & { status: number };
  e.status = status;
  return e;
}

describe('compteBandcampARelier (#2778)', () => {
  it('428 : aucun compte relié, on propose de relier', () => {
    expect(compteBandcampARelier(erreur(428, 'aucun compte Bandcamp lié'))).toBe(true);
  });

  it('502 dont le message recopie une page HTML de Bandcamp (<link …>) : le compte reste relié', () => {
    const e = erreur(
      502,
      'HTTP 403 Forbidden: <!DOCTYPE html><html><head><link rel="stylesheet" href="https://s4.bcbits.com/x.css">',
    );
    expect(compteBandcampARelier(e)).toBe(false);
  });

  it('500 « réglages Bandcamp illisibles » : ce n’est pas une liaison manquante', () => {
    expect(compteBandcampARelier(erreur(500, 'réglages Bandcamp illisibles'))).toBe(false);
  });

  it('une erreur réseau sans statut, même si son texte parle de lien, ne demande pas de relier', () => {
    expect(compteBandcampARelier(new Error('connection link reset'))).toBe(false);
    expect(compteBandcampARelier(null)).toBe(false);
    expect(compteBandcampARelier(undefined)).toBe(false);
  });
});

describe('StreamingV2 — « Ma collection » (#2778)', () => {
  const src = readFileSync(resolve(__dirname, '../../components/v2/StreamingV2.svelte'), 'utf8');

  it('ne décide plus de la liaison sur le TEXTE du message', () => {
    expect(src).not.toMatch(/\/lié\|link\/i/);
    expect(src).toMatch(/bcNeedsLink = compteBandcampARelier\(e\)/);
  });

  it('un échec de chargement dit qu’il a échoué, pas que la collection est vide', () => {
    expect(src).toMatch(/v2\.stream\.bcCollectionFailed/);
  });

  it('une liaison réussie suivie d’un rechargement en échec ne dit pas « compte introuvable »', () => {
    const corps = src.slice(src.indexOf('async function linkBandcamp'), src.indexOf('async function rechargerCollection'));
    // La liaison et le rechargement ont chacun leur issue.
    expect(corps).toMatch(/await api\.bandcampLink\(u\)[\s\S]*catch[\s\S]*bandcampNotFound[\s\S]*rechargerCollection\(\)[\s\S]*catch/);
  });
});
