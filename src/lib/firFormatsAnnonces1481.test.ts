import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * #1481 — « Concernant les fichiers FIR, que prend en compte Tune ? Fichier
 * unique G/D ? ou fichier stéréo avec correction independante de chaque
 * canal ? » (GgB, fil 1895, 23/09/2026).
 *
 * L'écran ne répondait pas : `zoneConfig.firDesc` nommait REW, ARTA, Dirac et
 * l'extension `.wav`, et s'arrêtait là. La réponse est pourtant arrêtée côté
 * serveur depuis longtemps (`ConvolverConfig::build_for`) — elle n'était
 * simplement écrite nulle part dans l'interface.
 *
 * Ce contrôle garde les trois choses qui se perdent en silence :
 *   1. le bloc FIR affiche bien la phrase, et pas seulement le catalogue des
 *      logiciels de mesure ;
 *   2. les DOUZE dictionnaires la portent — `check-i18n` exige la clé, pas
 *      qu'elle soit traduite, et une clé recopiée du français retombe en
 *      français dans une interface anglaise ;
 *   3. le français dit les DEUX cas — mono et stéréo —, faute de quoi la
 *      moitié de la question de GgB resterait sans réponse.
 */

const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'hu'];
const CLE = '"zoneConfig.firFormats"';

/** La valeur brute de la clé, telle qu'elle est écrite dans le dictionnaire. */
function valeur(langue: string): string | null {
  const src = readFileSync(`src/lib/locales/${langue}.ts`, 'utf8');
  const ligne = src.split('\n').find((l) => l.includes(`${CLE}:`));
  if (!ligne) return null;
  const m = ligne.match(/:\s*"((?:[^"\\]|\\.)*)"/);
  return m ? m[1] : null;
}

describe("#1481 — l'écran de correction acoustique dit ce qu'il accepte", () => {
  const bloc = readFileSync('src/components/partages/CorrectionAcoustiqueZone.svelte', 'utf8');

  it('le bloc FIR rend la phrase des formats, à côté de la description', () => {
    expect(bloc).toContain("$t('zoneConfig.firFormats')");
    expect(bloc).toContain("$t('zoneConfig.firDesc')");
  });

  it('les douze dictionnaires portent la clé, et aucun n’est vide', () => {
    for (const langue of LANGUES) {
      const v = valeur(langue);
      expect(v, `${langue} : clé absente`).not.toBeNull();
      expect(v!.trim().length, `${langue} : clé vide`).toBeGreaterThan(20);
    }
  });

  it('aucune langue ne recopie le français — sauf le français', () => {
    const ref = valeur('fr');
    for (const langue of LANGUES.filter((l) => l !== 'fr')) {
      expect(valeur(langue), `${langue} : texte français non traduit`).not.toBe(ref);
    }
  });

  it('le français répond aux DEUX cas posés par GgB : mono, et stéréo', () => {
    const v = (valeur('fr') ?? '').toLowerCase();
    expect(v).toContain('mono');
    expect(v).toContain('stéréo');
  });

  it("le français dit que la cadence n'est pas rattrapée", () => {
    // `build_for` : « Aucun rééchantillonnage silencieux ». Sur une zone
    // réseau, le refus ne se voit qu'à la lecture : l'écran doit prévenir.
    expect((valeur('fr') ?? '').toLowerCase()).toContain('cadence');
  });
});
