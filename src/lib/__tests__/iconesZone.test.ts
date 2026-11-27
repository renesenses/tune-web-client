// @vitest-environment jsdom
// Itération 7 du thème Roon-like (27/11/2026) — le jeu d'icônes de zone de
// Rémi (CC0) : catalogue, fichiers sûrs, icône par défaut, choix par zone.
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { get } from 'svelte/store';
import {
  FAMILLES_ICONES, ICONES, estIconeZone, iconeParDefaut, iconeDeZone, choixIconesZones,
  choisirIconeZone, cleLibelleIcone, CLE_STOCKAGE_ICONES,
} from '../iconesZone';
import lFr from '../locales/fr';
import lEn from '../locales/en';

const DOSSIER = join(__dirname, '..', '..', 'assets', 'zone-icons');

describe('le jeu de fichiers', () => {
  it('trois familles, un README de licence CC0, rien d’autre', () => {
    expect(readdirSync(DOSSIER).sort()).toEqual(['README.md', 'appareils', 'personnes', 'pieces']);
    expect(readFileSync(join(DOSSIER, 'README.md'), 'utf8')).toMatch(/CC0/);
  });
  it('le catalogue du code et les fichiers sur disque sont les mêmes (52 icônes)', () => {
    let total = 0;
    for (const f of FAMILLES_ICONES) {
      const surDisque = readdirSync(join(DOSSIER, f)).map((x) => x.replace(/\.svg$/, '')).sort();
      expect(surDisque, f).toEqual([...ICONES[f]].sort());
      total += surDisque.length;
    }
    expect(total).toBe(52);
  });
  it('des tracés seuls, à la couleur du thème (ni script, ni lien, ni image)', () => {
    for (const f of FAMILLES_ICONES) for (const n of ICONES[f]) {
      const svg = readFileSync(join(DOSSIER, f, `${n}.svg`), 'utf8');
      expect(svg, n).toMatch(/^<svg [^>]*viewBox="0 0 24 24"/);
      expect(svg, n).toContain('stroke="currentColor"');
      expect(svg, n).not.toMatch(/<script|href|<image|foreignObject|\son[a-z]+=/i);
    }
  });
  it('chaque icône est nommée en français et en anglais', () => {
    const fr = lFr as unknown as Record<string, string>;
    const en = lEn as unknown as Record<string, string>;
    for (const f of FAMILLES_ICONES) for (const n of ICONES[f]) {
      const k = cleLibelleIcone(`${f}/${n}`);
      expect(fr[k], k).toBeTruthy();
      expect(en[k], k).toBeTruthy();
    }
  });
});

describe('icône par défaut selon le type de sortie', () => {
  const cas: [Record<string, string>, string][] = [
    [{ output_type: 'airplay' }, 'appareils/enceinte-reseau'],
    [{ output_type: 'airplay2' }, 'appareils/enceinte-reseau'],
    [{ output_type: 'devialet_air', model: 'Phantom I' }, 'appareils/enceinte-connectee'],
    [{ output_type: 'devialet_air', model: 'Expert 220 Pro' }, 'appareils/ampli'],
    [{ output_type: 'tune_agent' }, 'appareils/dac'],
    [{ output_type: 'local', name: 'AirPods de Bertrand' }, 'appareils/ecouteurs'],
    [{ output_type: 'local', name: 'Casque Sennheiser' }, 'appareils/casque'],
    [{ output_type: 'local', name: 'Sortie HDMI' }, 'appareils/televiseur'],
    [{ output_type: 'local', name: 'Haut-parleurs intégrés' }, 'appareils/ordinateur'],
    [{ output_type: 'local', brand: 'RME', model: 'ADI-2 DAC' }, 'appareils/dac'],
    [{ output_type: 'dlna', detected_manufacturer: 'Samsung' }, 'appareils/televiseur'],
    [{ output_type: 'dlna', detected_manufacturer: 'Sonos, Inc.' }, 'appareils/enceinte-connectee'],
    [{ output_type: 'dlna', detected_manufacturer: 'Linn' }, 'appareils/streamer'],
    [{ output_type: 'chromecast', name: 'Salon TV' }, 'appareils/televiseur'],
    [{ output_type: 'chromecast', name: 'Chromecast Audio' }, 'appareils/recepteur-tv'],
    [{ output_type: 'browser', name: 'iPhone de Rémi' }, 'appareils/telephone'],
    [{ output_type: 'browser', name: 'iPad' }, 'appareils/tablette'],
    [{ output_type: 'browser', name: 'Firefox' }, 'appareils/navigateur'],
    [{ output_type: 'oaat' }, 'appareils/streamer'],
    [{ output_type: 'openhome' }, 'appareils/streamer'],
    [{ output_type: 'squeezebox' }, 'appareils/streamer'],
    [{ output_type: 'bluos' }, 'appareils/streamer'],
    [{ output_type: 'sendspin' }, 'appareils/streamer'],
    [{ output_type: 'bridge' }, 'appareils/streamer'],
    [{ output_type: 'inconnu' }, 'appareils/enceinte'],
    [{}, 'appareils/enceinte'],
  ];
  it.each(cas)('%o → %s', (z, attendu) => {
    expect(iconeParDefaut(z)).toBe(attendu);
    expect(estIconeZone(attendu)).toBe(true);
  });
  it('un groupe de zones', () => {
    expect(iconeParDefaut({ output_type: 'dlna' }, { groupe: true })).toBe('appareils/groupe');
  });
});

describe('le choix de l’utilisateur, par zone, dans ce navigateur', () => {
  beforeEach(() => choixIconesZones.set({}));
  it('le choix l’emporte sur le défaut, et se retire', () => {
    choisirIconeZone(7, 'pieces/cuisine');
    expect(iconeDeZone({ id: 7, output_type: 'airplay' }, get(choixIconesZones))).toBe('pieces/cuisine');
    expect(iconeDeZone({ id: 8, output_type: 'airplay' }, get(choixIconesZones))).toBe('appareils/enceinte-reseau');
    expect(JSON.parse(localStorage.getItem(CLE_STOCKAGE_ICONES) ?? '{}')).toEqual({ 7: 'pieces/cuisine' });
    choisirIconeZone(7, null);
    expect(get(choixIconesZones)).toEqual({});
  });
  it('un nom inconnu n’est pas rangé', () => {
    choisirIconeZone(7, 'roon/livingroom');
    expect(get(choixIconesZones)).toEqual({});
    expect(estIconeZone('pieces/../x')).toBe(false);
  });
});

describe('libellés des icônes dans chaque langue (itération 8)', () => {
  const dossier = join(__dirname, '..', 'locales');
  const langues = readdirSync(dossier).filter((x) => x.endsWith('.ts') && x !== 'index.ts');
  const lire = (f: string) => Object.fromEntries(
    [...readFileSync(join(dossier, f), 'utf8').matchAll(/"(roonLike\.icone\.[^"]+)": "((?:[^"\\]|\\.)*)"/g)].map((m) => [m[1], m[2]]),
  );
  const en = lire('en.ts');
  it.each(langues)('%s : les 52 icônes nommées, et traduites (pas une copie de l’anglais)', (f) => {
    const d = lire(f);
    let copies = 0;
    for (const fam of FAMILLES_ICONES) for (const n of ICONES[fam]) {
      const k = cleLibelleIcone(`${fam}/${n}`);
      expect(d[k], `${f} ${k}`).toBeTruthy();
      if (d[k] === en[k]) copies++;
    }
    // Quelques noms sont les mêmes partout (DAC, Garage, Tablet…).
    if (f !== 'en.ts') expect(copies, f).toBeLessThan(12);
  });
});
