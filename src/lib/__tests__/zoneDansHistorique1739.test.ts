/**
 * FabienM, fil forum 1739, point 8 : « Menu historique : il manque
 * l'information de la zone jouée pour chaque titre dans la V1. Dans
 * l'interface actuelle la zone apparaît. »
 *
 * Deux choses manquaient, pas une.
 *
 *  1. L'écran v2 ne RENDAIT pas `zoneName`. L'écran actuel l'affiche depuis
 *     toujours (`HistoryView.svelte:149`) ; le portage l'avait perdu.
 *  2. `entreesDepuisServeur` fabriquait « Zone 3 » à partir du seul numéro,
 *     le serveur ne rendant que `zone_id`. Afficher « Zone 3 » quand la zone
 *     s'appelle « Salon » ne répond pas à la question posée.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { entreesDepuisServeur, nomDeZone } from '../historiqueLecture';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const ZONES = [
  { id: 3, name: 'Salon' },
  { id: 7, name: 'Cet ordinateur' },
];

describe('point 8 — la zone d’écoute', () => {
  it('🔴 le NUMÉRO du serveur devient le NOM de la zone', () => {
    const [e] = entreesDepuisServeur([
      { title: 'Troie', zone_id: 3, listened_at: '2026-09-09T10:00:00Z' },
    ]);
    expect(e.zoneId, 'le numéro n’est pas conservé : rien à résoudre').toBe(3);
    expect(nomDeZone(e, ZONES)).toBe('Salon');
  });

  it('une zone INCONNUE retombe sur le libellé fabriqué, jamais sur le vide', () => {
    // Zone renommée ou supprimée depuis l'écoute. « Zone 9 » est pauvre, mais
    // une ligne muette serait pire — et c'est le dernier recours, pas le
    // chemin normal.
    const [e] = entreesDepuisServeur([{ title: 'x', zone_id: 9 }]);
    expect(nomDeZone(e, ZONES)).toBe('Zone 9');
  });

  it('une écoute LOCALE garde le vrai nom écrit au moment de la lecture', () => {
    // `playbackHistory.add(track, zoneName)` connaît déjà le nom : on ne doit
    // pas l'écraser par une résolution qui échouerait.
    expect(nomDeZone({ zoneName: 'Chambre' }, ZONES)).toBe('Chambre');
  });

  it('sans zone du tout, rien n’est inventé', () => {
    expect(nomDeZone({}, ZONES)).toBe('');
  });

  it('🔴 l’écran v2 REND la zone — c’est ce qui manquait', () => {
    const src = lire('src/components/v2/HistoriqueV2.svelte')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src, 'la zone n’est toujours pas résolue').toContain('nomDeZone(e, $zones)');
    expect(src, 'la zone est résolue mais jamais affichée').toMatch(
      /<span class="zone"[^>]*>\{zn\}<\/span>/,
    );
  });

  it('l’écran ACTUEL l’affichait déjà — c’est la référence de Fabien', () => {
    // Contre-épreuve du constat : si cette ligne disparaissait, le point 8
    // n'aurait plus de point de comparaison et ce fichier perdrait son sens.
    expect(lire('src/components/HistoryView.svelte')).toContain('{entry.zoneName}');
  });
});
