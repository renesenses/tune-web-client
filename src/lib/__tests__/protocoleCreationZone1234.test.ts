/**
 * #1234 — « Créer zone : manque le protocole » (Bertrand, présentation du
 * 18/09/2026).
 *
 * Un même appareil s'annonce souvent plusieurs fois, une par protocole qu'il
 * parle. La liste montrait alors deux entrées qu'aucun signe ne distinguait :
 * on en prend une au hasard, et on découvre la différence à l'usage — qualité,
 * gestion du volume et reprise après coupure ne se valent pas d'un protocole à
 * l'autre.
 *
 * Mesuré sur le .18 le 19/09/2026, `GET /devices` (dix appareils) :
 *
 *     dlna      DMP-A8
 *     dlna      DMP-A8 (Tune)
 *     dlna      Décodeur TV UHD
 *     airplay   eversolo,1
 *     airplay   Chambre
 *     oaat      Tune Endpoint
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  candidatsNouvelleZone,
  libelleCandidat,
  type CandidatZone,
} from '../appareilsNouvelleZone';

const c = (nom: string, outputType: any): CandidatZone =>
  ({ cle: `${outputType}|${nom}`, groupe: 'reseau', nom, outputType, deviceId: nom });

describe('#1234 — le libellé porte le protocole', () => {
  it('les protocoles réseau sont nommés', () => {
    expect(libelleCandidat(c('DMP-A8', 'dlna'))).toBe('DMP-A8 · DLNA');
    expect(libelleCandidat(c('eversolo,1', 'airplay'))).toBe('eversolo,1 · AirPlay');
    expect(libelleCandidat(c('Tune Endpoint', 'oaat'))).toBe('Tune Endpoint · OAAT');
    expect(libelleCandidat(c('Salon', 'bluos'))).toBe('Salon · BluOS');
  });

  it('🔴 le protocole vient de `zoneTypeLabel`, PAS d\'une seconde table', () => {
    // Une copie divergerait au premier ajout, et l'écran de création nommerait
    // un protocole autrement que les cartes de zone des Réglages (#1065).
    const src = readFileSync('src/lib/appareilsNouvelleZone.ts', 'utf8');
    expect(src).toContain("import { zoneTypeLabel } from './zoneIdentity';");
    expect(src).toContain('zoneTypeLabel(c?.outputType)');
    // Contre-épreuve : aucun nom de protocole n'est écrit en dur ici.
    expect(src).not.toMatch(/case 'dlna'/);
    expect(src).not.toContain("'AirPlay'");
  });

  it('⚠️ une sortie LOCALE garde son nom nu — le groupe le dit déjà', () => {
    // `zoneTypeLabel('local')` rend la chaîne vide, délibérément : « Local
    // répète le nom ». On n'ajoute donc ni séparateur ni vide.
    expect(libelleCandidat(c('Haut-parleurs', 'local'))).toBe('Haut-parleurs');
    expect(libelleCandidat({ ...c('Ce navigateur', 'browser'), groupe: 'navigateur' }))
      .toBe('Ce navigateur · Browser');
  });

  it('rien d\'absurde sur une entrée incomplète', () => {
    expect(libelleCandidat(null)).toBe('');
    expect(libelleCandidat(undefined)).toBe('');
    expect(libelleCandidat(c('', 'dlna'))).toBe('DLNA');
    expect(libelleCandidat(c('  Salon  ', 'dlna'))).toBe('Salon · DLNA');
  });
});

describe('#1234 — la garde demandée par l\'issue', () => {
  it('🔴 un appareil annoncé par DEUX protocoles rend DEUX entrées, chacune nommant le sien', () => {
    const decouverts = [
      { id: 'A', name: 'Eversolo', type: 'dlna', available: true },
      { id: 'A', name: 'Eversolo', type: 'airplay', available: true },
    ] as any[];
    const liste = candidatsNouvelleZone([], decouverts, [], 'Ce navigateur');
    const reseau = liste.filter((x) => x.groupe === 'reseau');
    expect(reseau).toHaveLength(2);
    const libelles = reseau.map(libelleCandidat);
    expect(libelles).toEqual(['Eversolo · DLNA', 'Eversolo · AirPlay']);
    // 🔴 Et aucune des deux n'est présentée comme un doublon de l'autre :
    // elles ont des clés distinctes et des libellés distincts.
    expect(new Set(reseau.map((x) => x.cle)).size).toBe(2);
    expect(new Set(libelles).size).toBe(2);
  });

  it('contre-épreuve : sans le protocole, les deux entrées étaient identiques', () => {
    const decouverts = [
      { id: 'A', name: 'Eversolo', type: 'dlna', available: true },
      { id: 'A', name: 'Eversolo', type: 'airplay', available: true },
    ] as any[];
    const noms = candidatsNouvelleZone([], decouverts, [], 'B')
      .filter((x) => x.groupe === 'reseau')
      .map((x) => x.nom);
    // C'est exactement ce que l'écran affichait avant.
    expect(new Set(noms).size).toBe(1);
  });
});

describe('#1234 — le branchement', () => {
  const vue = readFileSync('src/components/v2/ZonesV2.svelte', 'utf8');

  it('le sélecteur rend le libellé, plus le nom nu', () => {
    expect(vue).toContain('{libelleCandidat(c)}');
    expect(vue).not.toContain('<option value={c.cle}>{c.nom}</option>');
  });

  it('⚠️ le NOM de la zone créée reste le nom de l\'appareil', () => {
    // Le protocole aide à CHOISIR ; il n'a rien à faire dans le nom de la
    // zone, que l'utilisateur relira tous les jours.
    expect(vue).toContain('placeholder={candidatChoisi?.nom ??');
  });
});
