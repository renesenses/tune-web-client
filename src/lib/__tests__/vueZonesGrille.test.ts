/**
 * La vue grille des Zones (Bertrand, 08/09/2026) :
 * « vue grille avec des grosses cards présentant aussi l'appareil de la zone
 *   et le badge Tune tested. grille du genre 4 colonnes ».
 *
 * Trois choses à garder, et la troisième est la seule qui compte vraiment :
 *
 *  1. la RÈGLE d'identité — jamais un mélange choisi / détecté ;
 *  2. le CHOIX de vue — persisté, et par défaut la grille ;
 *  3. le BRANCHEMENT — la grille existe dans l'écran, elle a bien quatre
 *     colonnes, elle porte l'appareil ET le badge. « Écrit mais pas branché »
 *     est le défaut dominant de ce client.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { appareilDeLaZone, lireVueZones, ecrireVueZones, CLE_VUE_ZONES } from '../vueZones';

const ecran = readFileSync(resolve(__dirname, '../../components/v2/ZonesV2.svelte'), 'utf-8');

function faussStorage(depart: Record<string, string> = {}) {
  const m = new Map(Object.entries(depart));
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    lu: m,
  };
}

describe('appareilDeLaZone — mesuré sur les 14 zones du .18', () => {
  it('l’identité CHOISIE l’emporte, sans jamais se mélanger à la détectée', () => {
    // La zone Eversolo, telle que `GET /zones` la rend : choisie « Eversolo /
    // DMP-A8 », détectée « EVERSOLO / AV Renderer Device ». Croiser les deux
    // fabriquerait « Eversolo AV Renderer Device », qui ne désigne rien.
    expect(appareilDeLaZone({
      brand: 'Eversolo', model: 'DMP-A8',
      detected_manufacturer: 'EVERSOLO', detected_model: 'AV Renderer Device',
    })).toBe('Eversolo DMP-A8');
  });

  it('retombe sur la détection quand rien n’a été choisi', () => {
    expect(appareilDeLaZone({
      brand: null, model: null,
      detected_manufacturer: 'SoftAtHome', detected_model: 'SoftAtHome Media Renderer',
    })).toBe('SoftAtHome Media Renderer');
  });

  it('n’écrit pas la marque deux fois — « Sonos, Inc. » + « Sonos Play:1 »', () => {
    expect(appareilDeLaZone({
      detected_manufacturer: 'Sonos, Inc.', detected_model: 'Sonos Play:1',
    })).toBe('Sonos Play:1');
  });

  it('🔴 rend null quand la zone n’a aucune identité — 9 zones sur 14 sur le .18', () => {
    // Les AirPlay, le navigateur, la sortie locale : la carte doit alors
    // retomber sur le type de sortie, et non afficher un trou.
    expect(appareilDeLaZone({})).toBeNull();
    expect(appareilDeLaZone({ brand: '  ', model: null, detected_manufacturer: '' })).toBeNull();
  });

  it('une marque seule ou un modèle seul est rendu tel quel', () => {
    expect(appareilDeLaZone({ detected_manufacturer: 'MozAIk Labs', detected_model: 'Tune' }))
      .toBe('MozAIk Labs Tune');
    expect(appareilDeLaZone({ brand: 'Lindemann' })).toBe('Lindemann');
    expect(appareilDeLaZone({ model: 'Play:5' })).toBe('Play:5');
  });
});

describe('le choix de vue', () => {
  it('la grille est le défaut', () => {
    expect(lireVueZones(faussStorage())).toBe('grille');
  });

  it('la liste est retenue quand on l’a choisie', () => {
    const s = faussStorage();
    ecrireVueZones('liste', s);
    expect(s.lu.get(CLE_VUE_ZONES)).toBe('liste');
    expect(lireVueZones(s)).toBe('liste');
  });

  it('une valeur abîmée retombe sur la grille, sans écran vide', () => {
    expect(lireVueZones(faussStorage({ [CLE_VUE_ZONES]: 'mosaique' }))).toBe('grille');
  });

  it('un stockage qui refuse ne casse pas l’écran', () => {
    const casse = { getItem() { throw new Error('refus'); }, setItem() { throw new Error('refus'); } };
    expect(lireVueZones(casse)).toBe('grille');
    expect(() => ecrireVueZones('liste', casse)).not.toThrow();
  });
});

describe('la grille est branchée dans l’écran Zones', () => {
  it('l’écran appelle la règle au lieu de la réécrire', () => {
    expect(ecran).toContain("from '../../lib/vueZones'");
    expect(ecran).toContain('appareilDeLaZone');
    expect(ecran).toContain('lireVueZones');
  });

  it('🔴 quatre colonnes, littéralement', () => {
    expect(ecran).toMatch(/\.grille\{[^}]*grid-template-columns:\s*repeat\(4,/);
    // Et elle redescend sur les fenêtres étroites plutôt que d'écraser les cartes.
    expect(ecran).toMatch(/max-width:1200px\)\{\s*\.grille\{grid-template-columns:repeat\(3,/);
  });

  it('🔴 la carte porte l’appareil ET le badge Tune tested', () => {
    const debut = ecran.indexOf('<div class="grille">');
    const fin = ecran.indexOf('{:else}', debut);
    expect(debut).toBeGreaterThan(0);
    const carte = ecran.slice(debut, fin);
    expect(carte).toContain('appareilOuSortie(z)');
    expect(carte).toContain('<BadgeTuneTested');
    expect(carte).toContain('{#if teste}');
  });

  it('les gestes destructifs restent à la liste', () => {
    // Une carte qu'on clique pour ACTIVER une zone ne porte pas de corbeille.
    const debut = ecran.indexOf('<div class="grille">');
    const carte = ecran.slice(debut, ecran.indexOf('{:else}', debut));
    expect(carte).not.toContain('askDelete');
    expect(carte).not.toContain('startRename');
  });

  it('🔴 les paires stéréo survivent au changement de vue', () => {
    // Elles vivaient DANS la branche « liste ». Si elles y étaient restées,
    // la vue par défaut les aurait fait disparaître en silence.
    const finDuIf = ecran.indexOf('{/if}\n\n    <!--\n      Les paires stéréo valent pour LES DEUX vues');
    expect(finDuIf).toBeGreaterThan(0);
  });

  it('le badge n’a qu’une définition, partagée avec les Réglages', () => {
    const reglages = readFileSync(resolve(__dirname, '../../components/v2/SettingsV2.svelte'), 'utf-8');
    expect(reglages).toContain('BadgeTuneTested');
    // L'ancienne copie en dur du badge ne doit pas subsister.
    expect(reglages).not.toContain('URL_PAGE_PUBLIQUE');
  });
});
