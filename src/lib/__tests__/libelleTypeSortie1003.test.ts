/**
 * #1003 — « oaat à remplacer par OAAT pour Tune Endpoint dans les zones »
 * (Bertrand, 13/09/2026, capture de l’écran Zones à l’appui).
 *
 * ## Ce que la mesure a montré
 *
 * Sur la .18, zone 1 « Tune Endpoint » :
 *
 * ```text
 * output_type      = "oaat"
 * output_device_id = "oaat:1081bb7a-ad6e-485e-a33b-c0596e3c8154"
 * ```
 *
 * 🔴 Et `OutputType` ne contenait PAS `'oaat'`. Le type mentait sur ce que le
 * serveur envoie, et les SEPT tables de libellés du client — `zoneIdentity`,
 * `ZonesV2`, `Sidebar`, `ZoneManagerView`, `BottomTabBar`, `SettingsView`,
 * `SettingsV2` — l’ignoraient toutes. La carte affichait donc la valeur brute,
 * en minuscules, au milieu de « DLNA » et « AirPlay ».
 *
 * ## Ce que cette garde tient
 *
 * Que **chaque** type de sortie énuméré a un libellé, et que le prochain
 * protocole ajouté sans être nommé sera rouge. C’est la vraie leçon : le
 * défaut n’est pas qu’on ait oublié OAAT, c’est que rien ne pouvait le dire.
 *
 * ## Ce qu’elle ne tient PAS
 *
 * Les cinq autres tables, qui restent des copies. Les réunir est un chantier à
 * part — celui-ci répare le type, la table partagée et l’écran signalé.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TYPES_DE_SORTIE, type OutputType } from '../types';
import { zoneTypeLabel, humaniserTypeSortie } from '../zoneIdentity';
import lFr from '../locales/fr';
import lEn from '../locales/en';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

describe('#1003 — chaque type de sortie porte un nom', () => {
  it('le serveur envoie `oaat`, et le type le connaît', () => {
    expect(TYPES_DE_SORTIE).toContain('oaat');
  });

  it('OAAT s’écrit en capitales, comme DLNA', () => {
    expect(zoneTypeLabel('oaat')).toBe('OAAT');
  });

  /**
   * 🔴 LA GARDE QUI MANQUAIT. `local` est la seule exception assumée — le
   * commentaire de `zoneTypeLabel` le dit : « DLNA informe, Local répète le
   * pictogramme ».
   */
  it('aucun type énuméré ne reste sans libellé', () => {
    const muets = TYPES_DE_SORTIE.filter(
      (t) => t !== 'local' && zoneTypeLabel(t as OutputType) === '',
    );
    expect(muets, `types sans libellé : ${muets.join(', ')}`).toEqual([]);
  });

  it('aucun libellé n’est rendu en minuscules brutes', () => {
    for (const t of TYPES_DE_SORTIE) {
      const l = zoneTypeLabel(t as OutputType);
      if (!l) continue;
      expect(l, `« ${t} » rendu tel quel`).not.toBe(t);
    }
  });

  it('l’écran Zones connaît OAAT lui aussi', () => {
    const src = lire('src/components/v2/ZonesV2.svelte');
    const i = src.indexOf('const OUTPUTS');
    expect(i).toBeGreaterThan(-1);
    const table = src.slice(i, src.indexOf('};', i));
    expect(table).toMatch(/oaat:\s*'OAAT'/);
  });

  /**
   * La table de l’écran doit couvrir ce que le type énumère — c’est elle que
   * la carte lit, et un trou s’y voit en minuscules à l’écran.
   */
  it('la table de l’écran Zones couvre tous les types énumérés', () => {
    const src = lire('src/components/v2/ZonesV2.svelte');
    const i = src.indexOf('const OUTPUTS');
    const table = src.slice(i, src.indexOf('};', i));
    const manquants = TYPES_DE_SORTIE.filter((t) => !table.includes(t + ':'));
    expect(manquants, `absents de OUTPUTS : ${manquants.join(', ')}`).toEqual([]);
  });

  /**
   * Contre-épreuve du DÉTECTEUR : sur une table témoin amputée, il doit voir
   * le trou — sinon la garde serait verte parce qu’elle ne regarde rien.
   */
  it('le détecteur voit un type absent de la table', () => {
    const temoin = "const OUTPUTS = {\n  local: 'x', dlna: 'DLNA',\n};";
    const table = temoin.slice(0, temoin.indexOf('};'));
    const manquants = TYPES_DE_SORTIE.filter((t) => !table.includes(t + ':'));
    expect(manquants).toContain('oaat');
    expect(manquants).toContain('airplay');
    /**
     * 🔴 ET il ne doit pas tout déclarer manquant. Première version de cette
     * garde : l'échappement du gabarit produisait `\\b` — un antislash
     * littéral — donc AUCUN type ne correspondait, les douze ressortaient
     * « absents », et ce cas-ci passait pour cette raison même. Un détecteur
     * aveugle satisfait sa propre contre-épreuve.
     */
    expect(manquants).not.toContain('local');
    expect(manquants).not.toContain('dlna');
  });
});

// Itération 7 (thème Roon-like) — capture 21-zones : « tune_agent » et
// « DEVIALET AIR » sortaient bruts. Aucun type ne doit plus s'afficher tel
// que le serveur l'écrit, ni en sous-titre ni en étiquette.
describe('écran Zones : aucun type de sortie brut (itération 7)', () => {
  const src = lire('src/components/v2/ZonesV2.svelte');
  const i = src.indexOf('const OUTPUTS');
  const table = src.slice(i, src.indexOf('};', i));
  const valeur = (t: string) => table.match(new RegExp(`\\b${t}:\\s*'([^']*)'`))?.[1];
  it('agent Tune, Devialet, Bridge, Sendspin : nommés', () => {
    expect(valeur('tune_agent')).toBe('v2.zone.sortie.agentTune');
    expect(valeur('devialet_air')).toBe('Devialet');
    expect(valeur('airplay2')).toBe('AirPlay 2');
    expect(valeur('bridge')).toBe('Tune Bridge');
    expect(valeur('sendspin')).toBe('Sendspin');
  });
  it('les libellés à traduire existent en français et en anglais', () => {
    const fr = lFr as unknown as Record<string, string>;
    const en = lEn as unknown as Record<string, string>;
    for (const k of ['v2.zone.sortie.local', 'v2.zone.sortie.navigateur', 'v2.zone.sortie.agentTune']) {
      expect(table).toContain(`'${k}'`);
      expect(fr[k], k).toBeTruthy();
      expect(en[k], k).toBeTruthy();
    }
    expect(fr['v2.zone.sortie.agentTune']).toBe('Agent Tune');
  });
  it('aucune valeur de la table n’est un identifiant brut (minuscules avec souligné)', () => {
    for (const [, v] of table.matchAll(/:\s*'([^']*)'/g)) expect(v).not.toMatch(/^[a-z0-9]+_[a-z0-9_]+$/);
  });
  it('le repli d’un type inconnu n’est jamais brut, et l’écran ne l’affiche plus tel quel', () => {
    expect(humaniserTypeSortie('tune_agent')).toBe('Tune Agent');
    expect(humaniserTypeSortie('devialet_air')).toBe('Devialet Air');
    expect(humaniserTypeSortie(null)).toBe('');
    expect(src).not.toMatch(/\?\? z\.output_type\}|String\(z\.output_type/);
    expect(lire('src/components/v2/ZonesSupprimees.svelte')).not.toContain('<em>{z.output_type}</em>');
  });
});
