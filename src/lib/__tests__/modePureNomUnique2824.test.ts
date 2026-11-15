/**
 * web#2824 (fil 2767, rc11 macOS) — l'interface nommait le même mode tantôt
 * « PURE », tantôt « Audiophile ». Décision de Bertrand (11/11) : « Pure »
 * partout, dans les quinze langues. Seuls les TEXTES AFFICHÉS changent : les
 * clés (`audiophile.*`), les magasins, l'API (`/zones/:id/audiophile`) et les
 * composants gardent leur nom.
 *
 * Cette garde échoue si une traduction remet « Audiophile » (ou sa
 * traduction : Audiophil, audiófilo, audiofila, audiofil, audiofilski,
 * オーディオファイルモード, 오디오파일 모드, 发烧（友）模式…) sur ce mode.
 */
import { describe, expect, it } from 'vitest';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

/** Le nom de l'ancien mode, dans toutes les écritures qu'il a eues. */
const ANCIEN_NOM = /audiophil|audiófil|audiofil|オーディオファイルモード|오디오파일\s*모드|发烧友?模式/i;

/**
 * Les SEULES chaînes où le mot reste, parce qu'elles ne nomment PAS le mode :
 * - la collection intelligente « 💎 Audiophile » (enregistrements haute
 *   résolution) ;
 * - l'aide HQPlayer (« filtres audiophiles ») — un adjectif sur des filtres.
 * Toute autre clé qui porte le mot est un retour de l'ancien nom.
 */
const HORS_DU_MODE = new Set([
  'smartCollection.default.audiophile',
  'smartCollection.default.audiophile.description',
  'settings.hqplayerHint',
]);

describe('#2824 — un seul nom pour le mode : PURE', () => {
  it('les quinze langues sont toutes vérifiées', () => {
    expect(ONZE_LANGUES).toHaveLength(15);
  });

  for (const lang of ONZE_LANGUES) {
    it(`${lang} : aucune chaîne affichée ne nomme le mode « Audiophile »`, () => {
      const fautifs = Object.entries(dictionnaire(lang))
        .filter(([cle, v]) => typeof v === 'string' && !HORS_DU_MODE.has(cle) && ANCIEN_NOM.test(v))
        .map(([cle, v]) => `${cle} = ${v}`);
      expect(fautifs, `${lang} : l'ancien nom est revenu`).toEqual([]);
    });

    it(`${lang} : le titre et l'état du mode disent PURE`, () => {
      const d = dictionnaire(lang);
      for (const cle of ['audiophile.title', 'audiophile.enabled', 'audiophile.disabled']) {
        expect(d[cle], `${lang} ${cle}`).toMatch(/PURE/);
      }
    });
  }
});
