// Menu des colonnes dans les tableaux de pistes (GO de Bertrand, 28/11/2026) :
// masquer, réafficher, rétablir ; même réglage que Réglages › Affichage ;
// une colonne toujours affichée ne se masque pas.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { choixAvecColonne, colonnesDuMenu, colonnesParDefaut, colonnesRetenues, DEFAUTS } from '../colonnesPistes';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

describe('menu des colonnes — réglage', () => {
  it('masquer, puis réafficher, puis rétablir', () => {
    let choix: string[] = colonnesParDefaut('intermediate');
    expect(choix).toContain('genre');
    choix = choixAvecColonne(choix, 'genre', false);
    expect(choix).not.toContain('genre');
    expect(colonnesRetenues(choix, 'intermediate').map((c) => c.cle)).not.toContain('genre');
    choix = choixAvecColonne(choix, 'genre', true);
    expect(colonnesRetenues(choix, 'intermediate').map((c) => c.cle)).toContain('genre');
    choix = choixAvecColonne(choix, 'year', false);
    expect(colonnesParDefaut('intermediate')).toEqual(DEFAUTS.intermediate);
  });
  it('une colonne toujours affichée (le titre) ne peut pas être masquée', () => {
    const choix = choixAvecColonne(['num', 'title', 'artist'], 'title', false);
    expect(colonnesRetenues(choix, 'expert').map((c) => c.cle)).toContain('title');
    expect(colonnesDuMenu('expert').find((c) => c.cle === 'title')?.verrouillee).toBe(true);
  });
  it('une clé inconnue ne s’ajoute pas et n’efface rien', () => {
    expect(choixAvecColonne(['num', 'title'], 'inconnue', true)).toEqual(['num', 'title']);
  });
  it('rétablir rend une COPIE (la table des défauts reste intacte)', () => {
    const d = colonnesParDefaut('beginner');
    d.push('bpm');
    expect(DEFAUTS.beginner).not.toContain('bpm');
  });
});

describe('menu des colonnes — branchement', () => {
  const liste = lire('src/components/v2/ListePistesV2.svelte');
  it('le tableau écrit dans le même réglage que les Réglages (v2Colonnes du mode courant)', () => {
    expect(liste).toContain('v2Colonnes: { ...pr.v2Colonnes, [mode]:');
    expect(liste).toContain('choixAvecColonne(');
  });
  it('clic droit, Maj+F10 et touche Menu sur un en-tête ouvrent le menu', () => {
    expect(liste).toContain('oncontextmenu={menuColonnesSouris}');
    expect(liste).toMatch(/e\.key === 'ContextMenu' \|\| \(e\.shiftKey && e\.key === 'F10'\)/);
  });
});
