import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleContrainteCanaux } from '../vueZones';

// Vu sur une installation ANGLAISE le 20/09/2026, dans Settings › Devices :
// « cette zone ne sort pas par une carte son locale : le renderer négocie son
// propre format ». La phrase vient du serveur (`CanauxContrainte::detail`,
// tune-core/src/audio/canaux_declares.rs) et l'écran l'affichait telle quelle.
// Le serveur envoie pourtant le code STABLE à côté, dans `reason`.

const LANGUES = ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh'];
const dico = (lg: string) => readFileSync(resolve(__dirname, `../locales/${lg}.ts`), 'utf8');

describe('la contrainte de canaux est TRADUITE, pas recopiée du serveur', () => {
  it('rend une clé pour chacun des deux codes du serveur', () => {
    expect(cleContrainteCanaux('sortie_non_locale')).toBe('zoneConfig.channelsUnavailableNonLocal');
    expect(cleContrainteCanaux('au_dela_de_l_appareil')).toBe('zoneConfig.channelsUnavailableBeyondDevice');
  });

  it('retombe sur la phrase générique pour un code INCONNU, jamais sur le code brut', () => {
    // Un serveur plus récent peut ajouter un motif : l'écran ne doit pas
    // afficher « motif_ajoute_en_0_9_180 » à l'utilisateur.
    for (const inconnu of ['motif_futur', '', null, undefined]) {
      expect(cleContrainteCanaux(inconnu)).toBe('zoneConfig.channelsUnavailable');
    }
  });

  it('les trois clés existent dans les 11 langues', () => {
    for (const lg of LANGUES) {
      const src = dico(lg);
      for (const cle of [
        'zoneConfig.channelsUnavailable',
        'zoneConfig.channelsUnavailableNonLocal',
        'zoneConfig.channelsUnavailableBeyondDevice',
      ]) {
        expect(src.includes(`'${cle}'`) || src.includes(`"${cle}"`), `${cle} absente de ${lg}`).toBe(true);
      }
    }
  });

  it('🔴 l’écran n’affiche plus `detail`, la phrase envoyée en clair', () => {
    const ecran = readFileSync(resolve(process.cwd(), 'src/components/v2/SettingsV2.svelte'), 'utf8');
    const sansCommentaires = ecran.replace(/<!--[\s\S]*?-->/g, '');
    expect(sansCommentaires).toContain('cleContrainteCanaux(z.channel_layout_status?.reason)');
    expect(sansCommentaires).not.toContain('channel_layout_status?.detail');
  });

  it('aucune des traductions ne recopie la phrase française du serveur', () => {
    // `detail` du serveur commence par « cette zone ne sort pas par une carte
    // son locale » ; une traduction identique signerait un copier-coller.
    const enDur = 'le renderer négocie son propre format';
    for (const lg of LANGUES.filter((l) => l !== 'fr')) {
      expect(dico(lg).includes(enDur), `${lg} recopie la phrase du serveur`).toBe(false);
    }
  });
});
