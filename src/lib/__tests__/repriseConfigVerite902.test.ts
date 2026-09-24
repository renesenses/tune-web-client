/**
 * #902 — « Reprendre ses personnalisations sur une nouvelle machine ».
 *
 * Tades monte une machine TuneOS à côté de sa machine Windows et demande qu'on
 * lui propose de reprendre ses personnalisations. L'assistant le propose
 * depuis la v0.9.161 (`OnboardingWizard`, commit 76287508) — mais les deux
 * écrans qui décrivent cette reprise DISENT FAUX, et ils disent faux
 * exactement là où l'utilisateur décide de refaire, ou non, un réglage à la
 * main.
 *
 * ## Ce que le chemin câblé emporte VRAIMENT
 *
 * L'interface n'appelle qu'un seul mécanisme : `api.exportConfig()` /
 * `api.importConfig()` → `GET`/`POST /system/config/export|import`. Sur
 * `tune-server-rust@origin/main`, `export_config`
 * (`tune-server/src/routes/system/config.rs:1650`) fait exactement ceci :
 *
 *     let all = settings.all().unwrap_or_default();   // la table `settings`
 *     …
 *     if !q.include_secrets { tune_core::secrets::retirer_les_secrets(&mut config); }
 *
 * C'est un dump PLAT de la table `settings`, moins les clés dont le NOM
 * désigne un secret. Il s'ensuit, par lecture de code et sans aucune mesure :
 *
 * 1. 🔴 **Les ZONES ne suivent pas.** Elles vivent dans leur propre table —
 *    `export_zones` fait `FROM zones` (`tune-core/src/config_backup.rs:354`),
 *    et cette fonction n'est atteinte que par `/system/config-backup/export`,
 *    que le client web n'appelle NULLE PART (`git grep config-backup src/` ne
 *    rend que l'étiquette d'aide elle-même). Or l'assistant ET l'aide des
 *    Réglages promettent les zones tous les deux.
 * 2. 🔴 **Le jeton Discogs ne suit pas**, et personne ne le dit.
 *    `est_secret("discogs_token")` est VRAI — le nom porte le fragment
 *    `token` (`tune-core/src/secrets.rs:35`) — donc `retirer_les_secrets` le
 *    retire. Tades nomme Discogs mot pour mot dans sa demande ; la liste des
 *    manques, elle, ne parle que de « comptes de services de streaming », ce
 *    qui ne le couvre pas : Discogs n'est pas un service de streaming.
 * 3. 🔴 **Les profils d'égaliseur, eux, SUIVENT** — et la liste des manques
 *    affirme le contraire. Ils sont rangés sous la clé de réglage `eq_presets`
 *    (`tune-server/src/routes/eq_pro.rs:103` et `:113`), un nom qui ne porte
 *    aucun fragment secret : le dump l'emporte comme n'importe quel réglage.
 *
 * Trois affirmations fausses, dont deux font refaire à la main un travail
 * déjà repris, et une fait croire repris un travail qui ne l'est pas — celle
 * des zones, la plus coûteuse des trois.
 *
 * ## Ce que cette garde tient
 *
 * Elle porte sur les ONZE dictionnaires, pas sur le seul français : c'est un
 * texte, et un texte se corrige langue par langue ou pas du tout.
 *
 * ## Ce qu'elle ne tient PAS
 *
 * Elle ne fait pas voyager les zones ni le jeton Discogs. Le mécanisme qui
 * saurait le faire existe côté serveur — `/system/config-backup/*`, dont le
 * `ConfigSnapshot` porte `zones`, `eq_presets`, `room_profiles`,
 * `radio_stations` et les jetons scellés — mais il est réservé à
 * l'administrateur ET adossé à `Feature::CloudConfigBackup`, c'est-à-dire
 * PREMIUM (`tune-server/src/routes/system/config_backup.rs`). Le brancher
 * dans l'assistant de première installation ferait de « reprendre sa
 * machine » une fonction payante : c'est un arbitrage produit, pas un
 * correctif, et il n'est pas pris ici.
 */
import { describe, it, expect } from 'vitest';
import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';
import hu from '../locales/hu';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Le mot que CE dictionnaire emploie pour « zone » et pour « égaliseur ».
 *
 * Une garde multilingue ne peut pas chercher un mot français dans onze
 * langues. Chaque entrée est relevée dans le dictionnaire lui-même, et les
 * variantes latines sont données en minuscules — la comparaison l'est aussi.
 * `zh` et `ja` glosent certains termes en alphabet latin entre parenthèses :
 * les deux formes sont donc listées.
 */
const MOTS: Record<string, { dict: Record<string, string>; zone: string[]; eq: string[] }> = {
  fr: { dict: fr as any, zone: ['zone'], eq: ['égaliseur', 'egaliseur'] },
  en: { dict: en as any, zone: ['zone'], eq: ['equalizer', 'equaliser'] },
  de: { dict: de as any, zone: ['zone'], eq: ['equalizer'] },
  es: { dict: es as any, zone: ['zona'], eq: ['ecualizador'] },
  it: { dict: it_ as any, zone: ['zone', 'zona'], eq: ['equalizzatore'] },
  ja: { dict: ja as any, zone: ['ゾーン'], eq: ['イコライザー', 'egaliseur'] },
  ko: { dict: ko as any, zone: ['존'], eq: ['이퀄라이저'] },
  ro: { dict: ro as any, zone: ['zone'], eq: ['egalizator'] },
  sv: { dict: sv as any, zone: ['zon'], eq: ['equalizer'] },
  zh: { dict: zh as any, zone: ['区域'], eq: ['均衡器', 'egaliseur'] },
  hu: { dict: hu as any, zone: ['zóná', 'zóna'], eq: ['ekvalizer'] },
};

const LANGUES = Object.keys(MOTS);

const bas = (s: string) => s.toLocaleLowerCase();
const porte = (texte: string, mots: string[]) => mots.some((m) => bas(texte).includes(bas(m)));

const DESC = 'onboarding.restoreDesc';
const LIMITES = 'onboarding.restoreLimits';
const AIDE = 'settings.configBackupHint';
/**
 * Les deux textes qui disent où se trouve la reprise COMPLÈTE (décision de
 * Bertrand, 23/09) : elle reste Premium, et l'écran doit le dire.
 */
const PREMIUM_ASSISTANT = 'onboarding.restorePremium';
const PREMIUM_REGLAGES = 'settings.configBackupPremium';

describe('#902 — la reprise ne promet que ce que le dump de `settings` emporte', () => {
  it('les trois textes existent dans les onze dictionnaires', () => {
    for (const l of LANGUES) {
      const d = MOTS[l].dict;
      for (const k of [DESC, LIMITES, AIDE]) {
        expect(typeof d[k], `${l}.${k}`).toBe('string');
        expect(d[k].trim().length, `${l}.${k} vide`).toBeGreaterThan(0);
      }
    }
  });

  it('AUCUN des deux textes de promesse ne dit que les zones reviennent', () => {
    // `export_config` ne lit que `settings.all()`. Les zones sont une TABLE :
    // `export_zones` fait `FROM zones`, et il n'est atteint que par
    // `/system/config-backup/export`, que ce client n'appelle pas.
    const fautifs: string[] = [];
    for (const l of LANGUES) {
      const { dict, zone } = MOTS[l];
      if (porte(dict[DESC], zone)) fautifs.push(`${l}.${DESC}`);
      if (porte(dict[AIDE], zone)) fautifs.push(`${l}.${AIDE}`);
    }
    expect(fautifs, 'une promesse de zones que la route ne tient pas').toEqual([]);
  });

  it('la liste des manques nomme les zones', () => {
    const muets = LANGUES.filter((l) => !porte(MOTS[l].dict[LIMITES], MOTS[l].zone));
    expect(muets, 'les zones ne reviennent pas et ne sont pas annoncées').toEqual([]);
  });

  it('la liste des manques nomme Discogs — nom propre, identique partout', () => {
    // `est_secret("discogs_token")` est vrai : le nom porte le fragment
    // `token`. Tades le nomme mot pour mot ; « comptes de services de
    // streaming » ne le couvre pas.
    const muets = LANGUES.filter((l) => !MOTS[l].dict[LIMITES].includes('Discogs'));
    expect(muets, 'le jeton Discogs est retiré du dump et personne ne le dit').toEqual([]);
  });

  it('aucune promesse ne laisse croire que Discogs revient', () => {
    const fautifs = LANGUES.filter(
      (l) => MOTS[l].dict[DESC].includes('Discogs') || MOTS[l].dict[AIDE].includes('Discogs'),
    );
    expect(fautifs).toEqual([]);
  });

  it("la liste des manques ne réclame plus les profils d'égaliseur : ils suivent", () => {
    // `eq_presets` est une clé de `settings` (`eq_pro.rs:103/113`) et son nom
    // ne porte aucun fragment secret — le dump l'emporte.
    const fautifs = LANGUES.filter((l) => porte(MOTS[l].dict[LIMITES], MOTS[l].eq));
    expect(fautifs, "on fait refaire à la main un réglage qui est déjà revenu").toEqual([]);
  });

  it('les deux textes de la reprise complète existent dans les onze dictionnaires', () => {
    for (const l of LANGUES) {
      const d = MOTS[l].dict;
      for (const k of [PREMIUM_ASSISTANT, PREMIUM_REGLAGES]) {
        expect(typeof d[k], `${l}.${k}`).toBe('string');
        expect(d[k].trim().length, `${l}.${k} vide`).toBeGreaterThan(0);
      }
    }
  });

  it('🔴 ils nomment Tune Premium — c’est le constat que Bertrand a tranché', () => {
    // La reprise complète RESTE Premium. Ce qui n'est pas admis, c'est de la
    // taire : l'utilisateur lit que ses zones ne suivent pas, et rien ne lui
    // dit que quelque chose les emporte.
    const muets = LANGUES.filter(
      (l) =>
        !MOTS[l].dict[PREMIUM_ASSISTANT].includes('Premium') ||
        !MOTS[l].dict[PREMIUM_REGLAGES].includes('Premium'),
    );
    expect(muets, 'la reprise complète est payante et l’écran ne le dit pas').toEqual([]);
  });

  it('🔴 ils nomment les ZONES — ce que l’utilisateur venait justement chercher', () => {
    // `ConfigSnapshot` porte zones, playlists, favorites, radio_stations,
    // alarms, eq_presets, room_profiles et `sealed_tokens`. La phrase ne vaut
    // que si elle nomme ce que la ligne du dessus vient de retirer.
    const muets = LANGUES.filter(
      (l) =>
        !porte(MOTS[l].dict[PREMIUM_ASSISTANT], MOTS[l].zone) ||
        !porte(MOTS[l].dict[PREMIUM_REGLAGES], MOTS[l].zone),
    );
    expect(muets, 'une reprise « complète » qui ne dit pas qu’elle emporte les zones').toEqual([]);
  });

  it('🔴 ils disent OÙ la trouver — sinon le constat est un cul-de-sac', () => {
    // L'onglet existe : `v2Settings.ts` déclare `id: 'license'`, libellé
    // `settings.tunePremiumLicense`. La phrase y renvoie, dans chaque langue,
    // par le libellé DE CETTE LANGUE.
    const muets = LANGUES.filter((l) => {
      const onglet = MOTS[l].dict['settings.tunePremiumLicense'];
      return (
        !bas(MOTS[l].dict[PREMIUM_ASSISTANT]).includes(bas(onglet)) ||
        !bas(MOTS[l].dict[PREMIUM_REGLAGES]).includes(bas(onglet))
      );
    });
    expect(muets, 'on annonce une fonction sans dire où elle se trouve').toEqual([]);
  });

  it("l'assistant rend bien les trois clés — sinon la correction serait orpheline", () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/partages/OnboardingWizard.svelte'),
      'utf-8',
    );
    expect(src).toContain(DESC);
    expect(src).toContain(LIMITES);
    const reglages = readFileSync(
      resolve(process.cwd(), 'src/components/v2/SettingsV2.svelte'),
      'utf-8',
    );
    expect(reglages).toContain(AIDE);
  });

  it('🔴 les deux écrans RENDENT la phrase — écrite mais pas branchée ne dit rien', () => {
    const assistant = readFileSync(
      resolve(process.cwd(), 'src/components/partages/OnboardingWizard.svelte'),
      'utf-8',
    );
    expect(assistant).toContain(PREMIUM_ASSISTANT);
    const reglages = readFileSync(
      resolve(process.cwd(), 'src/components/v2/SettingsV2.svelte'),
      'utf-8',
    );
    expect(reglages).toContain(PREMIUM_REGLAGES);
  });
});
