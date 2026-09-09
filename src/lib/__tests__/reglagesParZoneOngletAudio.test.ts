import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SETTING_LEVELS, type SettingKey } from '../settingLevels';

/**
 * #2171 — le décalage des paroles par zone se réglait dans l'onglet
 * « Services ».
 *
 * Bilou (forum #1376, 10/08) : « le réglage du décalage des paroles par zone
 * devrait mieux se trouver dans le sous-menu "réseau/audio" plutôt que dans le
 * sous-menu "services" ». Il avait raison : « Services » regroupe les comptes
 * et les connexions extérieures, alors qu'un décalage par zone agit sur la
 * RESTITUTION. Le contrôle vivait pourtant dans la même carte de zone que le
 * mode DSD, la fréquence maximale et le volume fixe — eux aussi de la
 * restitution. Déplacer le seul décalage aurait coupé la carte de zone en deux
 * onglets ; c'est donc le bloc entier « Réglages par zone » qui a rejoint
 * « Réseau / Audio ».
 *
 * Ce test garde DEUX choses, parce qu'il en faut deux pour que le déplacement
 * soit réel :
 *
 *  1. le gabarit — le bloc se rend sous `settingsTab === 'network'` ;
 *  2. le registre des niveaux — `tab` alimente le compteur « n réglages
 *     masqués » de chaque onglet (`hiddenCountByTab`). Un bloc rendu dans
 *     « Réseau / Audio » dont les clés annoncent `tab: 'services'` ferait
 *     compter ses réglages masqués sur l'onglet voisin : l'utilisateur lirait
 *     « n réglages masqués » sous Services sans rien y trouver en montant de
 *     niveau.
 */

const SOURCE = readFileSync(
  resolve(__dirname, '../../components/SettingsView.svelte'),
  'utf-8',
);

/** Ancre du bloc dans le gabarit. */
const ANCRE_SECTION = "<h3>{$t('settings.perZoneSettings')}</h3>";

/** Tous les gardes d'onglet du gabarit, dans l'ordre du fichier. */
function gardesOnglet(): { onglet: string; index: number }[] {
  const gardes: { onglet: string; index: number }[] = [];
  const motif = /\{#if settingsTab === '(\w+)'/g;
  for (let m = motif.exec(SOURCE); m; m = motif.exec(SOURCE)) {
    gardes.push({ onglet: m[1], index: m.index });
  }
  return gardes;
}

/** L'onglet sous lequel se rend la position donnée : le dernier garde ouvert
 *  avant elle. Les gardes d'onglet ne s'imbriquent jamais entre eux. */
function ongletDe(index: number): string | undefined {
  const avant = gardesOnglet().filter((g) => g.index < index);
  return avant.length ? avant[avant.length - 1].onglet : undefined;
}

describe('#2171 — les réglages par zone se règlent dans « Réseau / Audio »', () => {
  it('la recherche sait voir les deux onglets en jeu (témoin)', () => {
    // Sans ce témoin, un test vert ne prouverait rien : il pourrait l'être
    // parce que le motif ne trouve plus AUCUN garde d'onglet.
    const onglets = new Set(gardesOnglet().map((g) => g.onglet));
    expect(onglets.has('services'), 'aucun garde d\'onglet « services » trouvé').toBe(true);
    expect(onglets.has('network'), 'aucun garde d\'onglet « network » trouvé').toBe(true);
  });

  it('le bloc « Réglages par zone » se rend sous l\'onglet Réseau / Audio', () => {
    const debut = SOURCE.indexOf(ANCRE_SECTION);
    expect(debut, 'section « Réglages par zone » introuvable').toBeGreaterThanOrEqual(0);
    expect(ongletDe(debut)).toBe('network');
  });

  it('le décalage des paroles voyage avec sa carte de zone', () => {
    const appel = SOURCE.indexOf('api.updateZoneLyricsOffset');
    expect(appel, 'le sélecteur de décalage a disparu').toBeGreaterThanOrEqual(0);
    expect(ongletDe(appel)).toBe('network');
    // Toujours dans la MÊME carte que les autres réglages de restitution : le
    // ticket refusait explicitement de couper la carte de zone en deux.
    expect(ongletDe(SOURCE.indexOf('api.updateZoneDsdMode'))).toBe('network');
    expect(ongletDe(SOURCE.indexOf('api.updateZoneMaxSampleRate'))).toBe('network');
    expect(ongletDe(SOURCE.indexOf('api.updateZoneFixedVolume'))).toBe('network');
  });

  it('le registre des niveaux range les clés par-zone sous « network »', () => {
    const cles: SettingKey[] = [
      'network.perZoneLyricsOffset',
      'network.perZoneFixedVolume',
      'network.perZoneDsdMode',
      'network.perZoneMaxSampleRate',
      'network.zoneAdvanced',
    ];
    for (const cle of cles) {
      expect(SETTING_LEVELS[cle].tab, cle).toBe('network');
    }
  });

  it('plus aucune clé « services.perZone… » ne subsiste', () => {
    // Le préfixe de la clé et le champ `tab` doivent dire la même chose ; une
    // clé orpheline signalerait un déplacement fait à moitié.
    expect(SOURCE).not.toMatch(/services\.(?:perZone\w+|zoneAdvanced)/);
    for (const cle of Object.keys(SETTING_LEVELS)) {
      expect(cle).not.toMatch(/^services\.(?:perZone|zoneAdvanced)/);
    }
  });

  it('le préfixe de chaque clé du registre nomme bien son onglet', () => {
    for (const [cle, entree] of Object.entries(SETTING_LEVELS)) {
      expect(cle.startsWith(`${entree.tab}.`), `${cle} → tab ${entree.tab}`).toBe(true);
    }
  });
});
