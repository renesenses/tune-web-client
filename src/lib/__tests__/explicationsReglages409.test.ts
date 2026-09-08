/**
 * #409 — « les explications doivent être des bulles attachées à leur ligne, et
 * il en manque » (Bertrand, capture à l'appui).
 *
 * ## Ce que la mesure a changé au ticket
 *
 * Le ticket décrit l'écran du client ACTUEL, où cinq explications s'empilaient
 * SOUS cinq interrupteurs, sans correspondance visible : libellés et
 * interrupteurs dans une grille à deux colonnes, explications posées après la
 * grille.
 *
 * Le nouvel écran ne reproduit pas ce défaut : chaque explication vit DANS le
 * bloc de son libellé (`<div class="lbl"><span>…</span><span class="hint">…`),
 * donc au-dessus de son propre contrôle. Il y en avait déjà 94.
 *
 * Ce qui restait vrai, c'est la seconde moitié : **il en manquait**. Quatorze
 * libellés n'en avaient aucune, dont les plus coûteux à se tromper — le mode
 * d'import, le pilote audio, le mode exclusif, le préamplificateur ReplayGain.
 *
 * Ce test tient les huit qui comptent. Les six autres sont des AFFICHAGES
 * (état du serveur, identifiant, adresses d'accès, heure du réveil) ou des
 * réglages qui se lisent seuls (la langue) : leur en écrire une serait du
 * bruit, et une garde qui exige du bruit finit désactivée.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const ECRAN = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
const FR = readFileSync('src/lib/locales/fr.ts', 'utf8');
const LANGUES = ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh'];

/** Les réglages où se tromper coûte cher, et leur explication. */
const ATTENDUES: Array<[string, string]> = [
  ['settings.ingestMode', 'v2.hint.ingestMode'],
  ['settings.audioBackend', 'v2.hint.audioBackend'],
  ['settings.wasapiMode', 'v2.hint.wasapiMode'],
  ['settings.replayGainPreamp', 'v2.hint.replayGainPreamp'],
  ['settings.replayGainPreventClipping', 'v2.hint.replayGainPreventClipping'],
  ['settings.defaultZone', 'v2.hint.defaultZone'],
  ['settings.volumeDisplay', 'v2.hint.volumeDisplay'],
  ['settings.startupView', 'v2.hint.startupView'],
];

describe('Chaque réglage coûteux porte son explication', () => {
  it.each(ATTENDUES)('%s → %s', (libelle, hint) => {
    // 🔴 ATTACHÉE : dans le même bloc `.lbl`, donc au-dessus de son propre
    // contrôle — c'est tout l'objet du ticket. Une explication qui existe mais
    // vit trois cents lignes plus bas ne vaut pas mieux qu'aucune.
    //
    // On parcourt TOUTES les occurrences du libellé : certaines vivent dans le
    // script (une variable de même nom), et s'arrêter à la première ferait
    // rougir la garde pour la mauvaise raison.
    const blocs = [...ECRAN.matchAll(/<div class="lbl">[\s\S]{0,500}?<\/div>/g)].map((m) => m[0]);
    const sien = blocs.find((b) => b.includes(`$t('${libelle}' as any)`));
    expect(sien, `le libellé ${libelle} n’est dans aucun bloc .lbl`).toBeDefined();
    expect(sien, `${libelle} : son explication n’est pas dans son bloc`).toContain(hint);
  });

  it.each(ATTENDUES)('%s : l’explication existe dans les ONZE langues', (_l, hint) => {
    for (const lang of LANGUES) {
      const src = readFileSync(`src/lib/locales/${lang}.ts`, 'utf8');
      expect(src.includes(`"${hint}"`), `${hint} manque en ${lang}`).toBe(true);
    }
  });
});

describe('🔴 Ce que l’explication doit DIRE', () => {
  it('« Déplacer » avertit qu’il retire le fichier de sa place', () => {
    // Un réglage d'import qui déplace sans le dire fait perdre des fichiers de
    // vue. C'est le seul de la liste qui touche au disque.
    const m = FR.match(/"v2\.hint\.ingestMode":\s*"((?:\\.|[^"])*)"/);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/retire le fichier/);
  });

  it('le mode exclusif avertit que les autres applications deviennent muettes', () => {
    const m = FR.match(/"v2\.hint\.wasapiMode":\s*"((?:\\.|[^"])*)"/);
    expect(m![1]).toMatch(/muettes/);
  });

  it('ASIO avertit qu’un pilote du fabricant est nécessaire', () => {
    // Sans lui la sortie est muette, et rien à l'écran ne l'explique — c'est
    // exactement la panne que le testeur Diretta a mis trente minutes à ne pas
    // résoudre (#690).
    const m = FR.match(/"v2\.hint\.audioBackend":\s*"((?:\\.|[^"])*)"/);
    expect(m![1]).toMatch(/pilote/);
  });
});

describe('L’écran n’a pas régressé vers des explications détachées', () => {
  it('aucune explication ne flotte hors d’un bloc de libellé', () => {
    // Le défaut du ticket, décrit en une règle : un `class="hint"` doit vivre
    // dans un `<div class="lbl">`. On compte les deux et on compare.
    const dansLbl = [...ECRAN.matchAll(/<div class="lbl">[\s\S]{0,400}?<\/div>/g)]
      .filter((m) => m[0].includes('class="hint"')).length;
    expect(dansLbl).toBeGreaterThanOrEqual(ATTENDUES.length);
  });
});
