/**
 * `dist/version.json` — le fichier que le serveur lit pour savoir QUELLE
 * interface tourne (#3667, résidu de tune-server-rust#3380).
 *
 * Deux choses distinctes sont gardées ici, et il faut les deux :
 *
 *  1. le CONTENU, qui doit satisfaire le lecteur Rust — un champ `version`,
 *     chaîne non vide, dans un document JSON valide ;
 *  2. le CÂBLAGE, c'est-à-dire le fait que `vite.config.ts` monte réellement
 *     le greffon. C'est précisément ce dont l'absence ne se voit pas : sans
 *     lui, le build reste vert, l'interface fonctionne, et seule la ligne
 *     « Interface (web) » d'un rapport de bogue ment — six mois plus tard,
 *     devant un testeur.
 *
 * Le premier point se teste pour de vrai (on appelle le greffon et on regarde
 * ce qu'il émet). Le second est une lecture de source, assumée comme telle :
 * monter un build Vite complet dans la suite unitaire coûterait des dizaines
 * de secondes pour garder une seule ligne.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  FICHIER_VERSION,
  contenuVersionJson,
  greffonVersionJson,
} from './versionJson';

describe('contenu de version.json', () => {
  it('porte la version sous la clé que le serveur lit', () => {
    const doc = JSON.parse(contenuVersionJson('0.9.145'));
    expect(doc.version).toBe('0.9.145');
  });

  it('se termine par un saut de ligne', () => {
    expect(contenuVersionJson('1.2.3').endsWith('\n')).toBe(true);
  });

  it("n'écrit rien d'autre que ce que le serveur lit", () => {
    // Le lecteur Rust ignore les champs inconnus, mais écrire ce qui n'est pas
    // lu crée une seconde chose à tenir à jour. Si un champ est ajouté ici un
    // jour, que ce soit une décision, pas un accident.
    expect(Object.keys(JSON.parse(contenuVersionJson('1.2.3')))).toEqual(['version']);
  });
});

describe('greffon Vite', () => {
  function emissions(version: string) {
    const emis: any[] = [];
    const greffon = greffonVersionJson(version);
    greffon.generateBundle.call({ emitFile: (a: unknown) => emis.push(a) });
    return emis;
  }

  it('émet un actif nommé version.json à la racine du bundle', () => {
    const emis = emissions('0.9.145');
    expect(emis).toHaveLength(1);
    expect(emis[0].type).toBe('asset');
    expect(emis[0].fileName).toBe(FICHIER_VERSION);
    // Pas de sous-dossier : le serveur cherche `<web_dir>/version.json`, pas
    // `<web_dir>/assets/version.json`.
    expect(emis[0].fileName).not.toContain('/');
  });

  it('émet la version qu on lui donne, et pas une autre', () => {
    expect(JSON.parse(emissions('9.9.9')[0].source).version).toBe('9.9.9');
  });

  it('passe par emitFile, donc suit outDir et survit à emptyOutDir', () => {
    // Une écriture disque directe dans un hook trop précoce serait effacée par
    // le nettoyage de `emptyOutDir: true` — en silence, et seulement parfois.
    // Ce test échoue si quelqu un remplace `emitFile` par un `writeFileSync`.
    expect(typeof greffonVersionJson('1.0.0').generateBundle).toBe('function');
  });
});

describe('câblage dans vite.config.ts', () => {
  const config = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf-8');

  it('monte le greffon dans la liste des plugins', () => {
    expect(
      /plugins:\s*\[[^\]]*greffonVersionJson\(/.test(config),
      'le greffon n est plus monté : `dist/version.json` ne sera plus produit, ' +
        'et tout rapport de bogue affirmera de nouveau que le build web est ' +
        'antérieur à #3380 — y compris pour un build du jour.'
    ).toBe(true);
  });

  it('lui passe la version de package.json, pas une constante écrite à la main', () => {
    expect(/greffonVersionJson\(pkg\.version\)/.test(config)).toBe(true);
  });
});

describe('accord avec package.json', () => {
  it('la version émise est bien celle du paquet', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')
    );
    expect(typeof pkg.version).toBe('string');
    expect(pkg.version.length).toBeGreaterThan(0);
    expect(JSON.parse(contenuVersionJson(pkg.version)).version).toBe(pkg.version);
  });
});
