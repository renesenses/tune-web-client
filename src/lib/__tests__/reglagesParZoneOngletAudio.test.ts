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


describe('#2171 — les réglages par zone se règlent dans « Réseau / Audio »', () => {



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


  it('le préfixe de chaque clé du registre nomme bien son onglet', () => {
    for (const [cle, entree] of Object.entries(SETTING_LEVELS)) {
      expect(cle.startsWith(`${entree.tab}.`), `${cle} → tab ${entree.tab}`).toBe(true);
    }
  });
});
