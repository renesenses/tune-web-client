import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { entreesRadios } from '../rechercheRadios';
import { TYPES_RECHERCHE, sectionVisible } from '../rechercheRestreinte';
import type { FicheAnnuaireRadio } from '../api/annuaireRadios';
import type { RadioStation } from '../types';

/**
 * Radios dans la recherche globale — tune-web-client#2399 / tune-server-rust#7045.
 * Rémi (rapport RC7) : « la recherche (loupe) ne trouve pas les radios ».
 */
const station = (id: number, name: string, extra: Partial<RadioStation> = {}): RadioStation =>
  ({ id, name, stream_url: `https://x/${id}`, favorite: false, ...extra }) as RadioStation;
const fiche = (ext: string, name: string, extra: Partial<FicheAnnuaireRadio> = {}): FicheAnnuaireRadio =>
  ({ external_id: ext, name, stream_url: `https://y/${ext}`, now_playing: false, ...extra }) as FicheAnnuaireRadio;

describe('entreesRadios', () => {
  it("met « Mes radios » avant l'annuaire", () => {
    const e = entreesRadios({ miennes: [station(1, 'FIP')], annuaire: [fiche('S2', 'FIP Jazz')], reste: 0 });
    expect(e.map((x) => x.nom)).toEqual(['FIP', 'FIP Jazz']);
    expect(e[0].idLocal).toBe(1);
    expect(e[1].idLocal).toBeNull();
    expect(e[1].idAnnuaire).toBe('S2');
  });

  it('une station présente des deux côtés ne fait qu\'UNE ligne, et garde le lien vers sa fiche', () => {
    const e = entreesRadios({
      miennes: [station(1, 'FIP', { logo_url: null })],
      annuaire: [fiche('S1', 'FIP', { my_radio_id: 1, logo_url: 'https://logo/fip.png', country_code: 'FR' })],
      reste: 0,
    });
    expect(e).toHaveLength(1);
    expect(e[0].idLocal).toBe(1);
    expect(e[0].idAnnuaire).toBe('S1');
    expect(e[0].logo).toBe('https://logo/fip.png');
    expect(e[0].pays).toBe('FR');
  });

  it("une fiche déjà dans « Mes radios » que la recherche n'a trouvée que par la fiche reste jouable par son identifiant local", () => {
    const e = entreesRadios({ miennes: [], annuaire: [fiche('S9', 'WDR 2', { my_radio_id: 7, my_radio_favorite: true })], reste: 0 });
    expect(e).toHaveLength(1);
    expect(e[0].idLocal).toBe(7);
    expect(e[0].favori).toBe(true);
  });

  it('une saisie manuelle (sans fiche) reste une ligne locale', () => {
    const e = entreesRadios({ miennes: [station(5, 'Ma radio', { favorite: true })], annuaire: [], reste: 0 });
    expect(e[0].idAnnuaire).toBeNull();
    expect(e[0].favori).toBe(true);
  });

  it('ne répète pas une fiche rendue deux fois', () => {
    const e = entreesRadios({ miennes: [], annuaire: [fiche('S1', 'A'), fiche('S1', 'A')], reste: 0 });
    expect(e).toHaveLength(1);
  });
});

describe('la pastille « Radios » de la recherche', () => {
  it('est un type de recherche comme les autres, et se restreint comme eux', () => {
    expect(TYPES_RECHERCHE).toContain('radios');
    expect(sectionVisible(new Set(), 'radios')).toBe(true);
    expect(sectionVisible(new Set(['albums']), 'radios')).toBe(false);
    expect(sectionVisible(new Set(['radios']), 'radios')).toBe(true);
  });
});

describe("l'écran de recherche montre les radios", () => {
  const src = readFileSync(join(__dirname, '../../components/v2/SearchV2.svelte'), 'utf8');

  it('interroge les radios à chaque recherche, sans que leur échec casse le reste', () => {
    expect(src).toMatch(/api\.chercherRadios\(requeteExacte\(query\)\)/);
    expect(src).toMatch(/\.catch\(\(\) => \{ if \(mine === seq\) radiosTrouvees = null; \}\)/);
  });

  it('rend une section « Radios » et la compte dans « aucun résultat »', () => {
    expect(src).toContain('<RadiosTrouvees entrees={lesRadios}');
    expect(src).toMatch(/!\(radiosTrouvees && \(radiosTrouvees\.miennes\.length \|\| radiosTrouvees\.annuaire\.length\)\)/);
  });
});
