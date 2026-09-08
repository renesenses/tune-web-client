/**
 * Six zones « This computer » identiques — Alex Campbell, 08/09/2026.
 *
 * « The button should detect if Tune can already play music out of the local
 * computer so it does not create multiple instances of the same device. »
 *
 * ## Pourquoi il a cliqué six fois
 *
 * Deux défauts, et le second explique le premier : le bouton ne détectait pas
 * la zone déjà là, et il ne montrait pas ce qu'il venait de faire — la
 * nouvelle zone apparaît PLUS BAS dans la liste des sorties, hors du champ du
 * bouton. Devant un écran qui ne change pas, on reclique.
 *
 * ## Pourquoi UNE seule suffit
 *
 * Une zone navigateur n'appartient à aucune machine : `output_type: 'browser'`
 * et `output_device_id: null`. Le serveur ne peut pas distinguer celle de
 * l'ordinateur d'Alex de celle de sa tablette. Six zones identiques ne donnent
 * pas six destinations : elles donnent six façons de se tromper.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { zoneNavigateurExistante, zonesNavigateurEnDouble } from '../zoneNavigateur';

/** Les zones d'Alex, telles que sa capture les montre. */
const CHEZ_ALEX = [
  { id: 3, name: 'Bathroom', output_type: 'airplay', output_device_id: 'airplay-1' },
  { id: 4, name: 'Dining Room', output_type: 'airplay', output_device_id: 'airplay-2' },
  { id: 11, name: 'This computer', output_type: 'browser', output_device_id: null },
  { id: 12, name: 'This computer', output_type: 'browser', output_device_id: null },
  { id: 13, name: 'This computer', output_type: 'browser', output_device_id: null },
  { id: 14, name: 'This computer', output_type: 'browser', output_device_id: null },
  { id: 15, name: 'This computer', output_type: 'browser', output_device_id: null },
  { id: 16, name: 'This computer', output_type: 'browser', output_device_id: null },
];

describe('La zone navigateur déjà présente', () => {
  it('🔴 est reconnue — c’est ce qui manquait', () => {
    expect(zoneNavigateurExistante(CHEZ_ALEX)?.id).toBe(11);
  });

  it('🔴 la PLUS ANCIENNE l’emporte', () => {
    // C'est sur elle que les réglages, l'égaliseur et les raccourcis ont eu le
    // temps de s'accumuler. Rendre la dernière créée les abandonnerait.
    const desordre = [...CHEZ_ALEX].reverse();
    expect(zoneNavigateurExistante(desordre)?.id).toBe(11);
  });

  it('🔴 ne se fie PAS au nom', () => {
    // « This computer », « Cet ordinateur », « Mon Mac » désignent la même
    // chose, et renommer sa zone ne doit pas en faire apparaître une seconde.
    const renommee = [{ id: 7, name: 'Mon Mac', output_type: 'browser', output_device_id: null }];
    expect(zoneNavigateurExistante(renommee)?.id).toBe(7);
  });

  it('ignore les zones qui ne sont pas des zones navigateur', () => {
    const sansNavigateur = CHEZ_ALEX.filter((z) => z.output_type !== 'browser');
    expect(zoneNavigateurExistante(sansNavigateur)).toBeNull();
    expect(zoneNavigateurExistante([])).toBeNull();
  });

  it('une zone sans identifiant n’en est pas une', () => {
    // Elle n'est pas enregistrée au serveur : la sélectionner ne mènerait
    // nulle part.
    expect(zoneNavigateurExistante([{ id: null, output_type: 'browser' }])).toBeNull();
  });
});

describe('Le compte des doublons', () => {
  it('dit combien sont en trop', () => {
    expect(zonesNavigateurEnDouble(CHEZ_ALEX)).toBe(5);
  });

  it('une seule zone n’est pas un doublon', () => {
    expect(zonesNavigateurEnDouble([{ id: 1, output_type: 'browser' }])).toBe(0);
    expect(zonesNavigateurEnDouble([])).toBe(0);
  });
});

describe('🔴 Le câblage — la règle ne sert à rien si l’écran ne l’appelle pas', () => {
  const ECRAN = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
  const bloc = ECRAN.slice(
    ECRAN.indexOf('async function createBrowserZoneHere'),
    ECRAN.indexOf('async function createBrowserZoneHere') + 1400,
  );

  it('le bouton consulte les zones AVANT de créer', () => {
    expect(bloc).toContain('zoneNavigateurExistante($zones)');
  });

  it('🔴 et il ne crée PAS quand il en trouve une', () => {
    // Le `return` est tout le correctif : sans lui, la détection ne servirait
    // qu'à afficher un message avant de créer la septième.
    expect(bloc).toMatch(/if \(deja\?\.id != null\)[\s\S]{0,320}return;/);
  });

  it('🔴 la LISTE se rafraîchit après création', () => {
    // Deuxième moitié du défaut : l'écran restait identique, et le bouton
    // semblait n'avoir rien fait.
    expect(bloc).toContain('zones.set(await api.getZones())');
  });

  it('et l’écran dit combien de zones navigateur existent déjà', () => {
    expect(ECRAN).toContain('zonesNavigateurEnDouble($zones)');
  });
});
