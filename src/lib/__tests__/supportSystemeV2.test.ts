import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { modeleSysteme, mermaidSysteme, planSysteme } from '../schemaSysteme';
import type { Zone } from '../types';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const z = (o: Partial<Zone>) => o as Zone;

describe('Support v2 : diagnostic et « Mon système » (Bertrand, 05/09/2026)', () => {
  const sup = sansCommentaires(lire('src/components/v2/SupportV2.svelte'));

  it("l'écran a bien les trois volets qui manquaient", () => {
    for (const k of ['v2.sup.tabDiag', 'v2.sup.tabTickets', 'v2.sup.tabSystem']) {
      expect(sup).toContain(k);
    }
    expect(sup).toContain("volet === 'diagnostic'");
    expect(sup).toContain("volet === 'systeme'");
  });

  it('les quatre sondes du diagnostic sont INDÉPENDANTES', () => {
    // Une seule chaîne d'`await` ferait d'un serveur sans tableau de bord
    // administrateur un écran vide.
    expect(sup).toContain('Promise.all([');
    for (const s of ['getDatabaseStatus', 'getScanStatus', 'getAdminHealth', 'getHealth']) {
      expect(sup).toContain(s);
    }
    expect((sup.match(/\.catch\(\(\) => null\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('le schéma est rendu par MERMAID, charge en import differe', () => {
    // Bertrand a demande le vrai rendu apres que je lui aie propose le dessin
    // fait main pour eviter le poids. `mermaid` pese plus que tout le reste du
    // client reuni : un `import` en tete de fichier l'aurait mis dans le paquet
    // principal, que tout le monde telecharge au premier ecran.
    expect(sup).toContain("await import('mermaid')");
    expect(sup).not.toMatch(/^\s*import mermaid from/m);
    // Le paquet est bien declare — un import differe d'une dependance absente
    // echouerait a la construction.
    const pkg = JSON.parse(lire('package.json'));
    expect(Object.keys(pkg.dependencies ?? {})).toContain('mermaid');
    expect(sup).toContain('securityLevel:');
  });

  it('le dessin fait main RESTE, en secours', () => {
    // Reseau coupe, morceau absent : on montre le schema plutot qu'un vide.
    expect(sup).toContain('planSysteme');
    expect(sup).toContain('{:else}');
    expect(sup).toContain('mermaidEchec');
    expect(sup).toContain('v2.sup.sysFallback');
  });

  it("le rendu suit le theme et ne se marche pas dessus", () => {
    // Un schema clair sur fond sombre serait une tache blanche au milieu de
    // l'ecran ; et deux rendus sous le meme identifiant se corrompent, Mermaid
    // posant des `id` dans le SVG.
    expect(sup).toContain("theme: sombre ? 'dark' : 'default'");
    expect(sup).toContain('`sys${mien}`');
    expect(sup).toContain('mien === mermaidSeq');
  });

  it('les deux écrans partagent le MÊME générateur', () => {
    const v1 = sansCommentaires(lire('src/components/SupportView.svelte'));
    expect(v1).toContain("from '../lib/schemaSysteme'");
    expect(sup).toContain("from '../../lib/schemaSysteme'");
    // Le v0 ne construit plus le Mermaid ligne à ligne.
    expect(v1).not.toContain("const lines: string[] = ['flowchart LR'");
  });

  it('une zone sans identifiant ne figure pas au schéma', () => {
    const m = modeleSysteme([z({ id: 1, name: 'Salon' }), z({ name: 'Brouillon' })], '1.0');
    expect(m.zones.map((x) => x.nom)).toEqual(['Salon']);
  });

  it("une zone dont le serveur ne dit rien est réputée EN LIGNE", () => {
    // Avec `online === true`, toute zone sans le champ serait apparue en
    // pointillés, c'est-à-dire en panne.
    expect(modeleSysteme([z({ id: 1, name: 'A' })], '1').zones[0].enLigne).toBe(true);
    expect(modeleSysteme([z({ id: 1, name: 'A', online: false } as any)], '1').zones[0].enLigne).toBe(false);
  });

  it('le Mermaid échappe ce qui casserait son analyseur', () => {
    const m = modeleSysteme([z({ id: 1, name: 'Salon "HiFi" [A]' })], '1.0');
    const txt = mermaidSysteme(m);
    expect(txt).toContain('flowchart LR');
    expect(txt).not.toContain('"Salon "HiFi"');
    expect(txt).toContain('#34;');
  });

  it('une zone hors ligne se dessine en pointillés, des deux côtés', () => {
    const m = modeleSysteme([z({ id: 1, name: 'A', online: false } as any)], '1');
    expect(mermaidSysteme(m)).toContain('stroke-dasharray');
    const p = planSysteme(m);
    expect(p.boites.find((b) => b.genre === 'zone')?.horsLigne).toBe(true);
    expect(p.traits[0].horsLigne).toBe(true);
  });

  it('le serveur est centré sur la hauteur des zones, pas posé en haut', () => {
    // Posé en haut, son trait vers la dernière zone traversait tout le dessin.
    const m = modeleSysteme([1, 2, 3, 4, 5, 6].map((i) => z({ id: i, name: `Z${i}` })), '1');
    const p = planSysteme(m);
    const serveur = p.boites.find((b) => b.genre === 'serveur')!;
    expect(serveur.y + serveur.h / 2).toBeCloseTo(p.hauteur / 2, 5);
  });

  it("le plan n'invente pas de colonne d'appareils quand aucune zone n'en a", () => {
    const sans = planSysteme(modeleSysteme([z({ id: 1, name: 'A' })], '1'));
    const avec = planSysteme(modeleSysteme([z({ id: 1, name: 'A', brand: 'Devialet', model: 'A1' } as any)], '1'));
    expect(avec.largeur).toBeGreaterThan(sans.largeur);
    expect(avec.boites.some((b) => b.genre === 'appareil')).toBe(true);
    expect(sans.boites.some((b) => b.genre === 'appareil')).toBe(false);
  });
});
