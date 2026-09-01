import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as locales from '../locales';

/**
 * #1360 — « Smart AI » ne fait appel à AUCUNE IA.
 *
 * Vérifié dans tune-server-rust au tag v0.9.127, `routes/smart_ai.rs` : les six
 * gestionnaires n'importent que `axum`, `serde` et `tune_core::db` ; une
 * recherche insensible à la casse de `anthropic|openai|api_key|llm|claude|
 * embedding|model` sur le fichier ne rend rien. `generate_smart_playlist` teste
 * `prompt.contains(...)` contre une liste FIGÉE de 22 genres, cinq familles
 * d'ambiance, quatre décennies et « hi-res », puis assemble des conditions SQL.
 * Sans mot reconnu, il retombe sur `ORDER BY RANDOM()`.
 *
 * Le titre de l'onglet avait déjà été renommé (PR #384, 09/08). Le reste de la
 * vue, lui, parlait toujours le vocabulaire de l'IA — « Prompt », « Describe
 * your ideal playlist… » — et vivait EN DUR, donc jamais traduit dans les dix
 * autres langues. Ce test tient la moitié qui manquait.
 */

const LANGUES: Record<string, Record<string, string>> = {
  fr: locales.fr,
  en: locales.en,
  de: locales.de,
  es: locales.es,
  it: locales.it,
  zh: locales.zh,
  ja: locales.ja,
  ko: locales.ko,
  ro: locales.ro,
  sv: locales.sv,
  hu: locales.hu,
};

const vue = readFileSync(resolve(__dirname, '../../components/SmartAIView.svelte'), 'utf-8');

/** Le vocabulaire réel du moteur, relevé dans routes/smart_ai.rs @ v0.9.127. */
const GENRES = [
  'jazz', 'classical', 'rock', 'pop', 'electronic', 'ambient', 'blues', 'soul',
  'funk', 'hip hop', 'hip-hop', 'r&b', 'country', 'folk', 'metal', 'punk',
  'reggae', 'disco', 'latin', 'world', 'chanson', 'variété',
];
const AMBIANCES = [
  'relax', 'calm', 'chill', 'evening', 'night', 'soir', 'morning', 'matin',
  'energi', 'workout', 'sport', 'focus', 'study', 'concentr',
];
const DECENNIES = ['80s', 'eighties', '90s', 'nineties', '70s', '60s', 'recent', 'new', 'modern'];
const QUALITE = ['hi-res', 'hires', 'high res'];
const CONNUS = [...GENRES, ...AMBIANCES, ...DECENNIES, ...QUALITE];

describe("« Smart AI » : la vue ne promet plus d'IA (#1360)", () => {
  it("aucun libellé visible n'est codé en dur dans la vue", () => {
    // Les chaînes qui vivaient en dur avant ce correctif. Chacune s'affichait
    // telle quelle dans les onze langues.
    const enDur = [
      'Describe your ideal playlist',
      'Titres non ecoutes de vos genres',
      'Generation en cours',
      'Generation failed',
      'Erreur de lecture',
      'Erreur de sauvegarde',
      'Tempo Match',
      'My Mix',
      'Your Mix',
      'Discovery Mix',
      'Tout lire',
      'Sauvegarder',
      'Actions rapides',
    ];
    for (const s of enDur) expect(vue, `« ${s} » est resté en dur`).not.toContain(s);

    // Les libellés d'ambiance passaient par `label`, jamais traduit.
    expect(vue).not.toMatch(/label:\s*'(Happy|Sad|Energetic|Calm|Focus|Romantic)'/);
    expect(vue).toContain("labelKey: 'smartai.moodHappy'");
  });

  it("le champ de saisie s'annonce comme des mots-clés, pas comme une invite", () => {
    // C'était le mensonge résiduel : « Prompt », juste à côté d'un bouton
    // « Tune AI » qui, lui, appelle vraiment Claude.
    expect(vue).toContain("$t('smartai.sectionKeywords')");
    expect(vue).toContain("$t('smartai.keywordsPlaceholder')");
    expect(vue).toContain("$t('smartai.keywordsHelp')");
    expect(vue).not.toMatch(/^\s*Prompt\s*$/m);
  });

  it('les exemples proposés sont des mots que le moteur reconnaît vraiment', () => {
    const bloc = vue.slice(
      vue.indexOf('const examplePrompts'),
      vue.indexOf('];', vue.indexOf('const examplePrompts')),
    );
    const exemples = [...bloc.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(exemples.length).toBeGreaterThan(0);

    // « upbeat funk 120bpm » et « piano music for studying » suggéraient une
    // lecture du BPM et un genre « piano » qui n'existent ni l'un ni l'autre
    // dans /smart-ai/generate.
    for (const ex of exemples) {
      const mots = ex.split(/\s+/);
      for (const mot of mots) {
        expect(
          CONNUS.some((c) => mot.toLowerCase().includes(c) || c.includes(mot.toLowerCase())),
          `« ${mot} » (dans « ${ex} ») ne figure dans aucune liste de smart_ai.rs — l'exemple promet un filtre que le moteur n'appliquera pas`,
        ).toBe(true);
      }
    }
  });

  it('les onze langues portent les libellés, sans revendication d’IA', () => {
    const CLES = [
      'smartai.title', 'smartai.subtitle',
      'smartai.sectionMood', 'smartai.sectionQuick', 'smartai.sectionKeywords',
      'smartai.moodHappy', 'smartai.moodSad', 'smartai.moodEnergetic',
      'smartai.moodCalm', 'smartai.moodFocus', 'smartai.moodRomantic',
      'smartai.actionHistory', 'smartai.actionDiscovery', 'smartai.discoveryDesc',
      'smartai.actionTempo', 'smartai.go',
      'smartai.keywordsPlaceholder', 'smartai.keywordsHelp',
      'smartai.generate', 'smartai.generating', 'smartai.generateFailed',
      'smartai.playError', 'smartai.playingCount', 'smartai.savedPlaylist',
      'smartai.saveError', 'smartai.trackCount', 'smartai.playAll', 'smartai.save',
      'smartai.nameMoodMix', 'smartai.nameMyMix', 'smartai.nameDiscoveryMix',
      'smartai.nameTempoMix',
    ];

    // Une revendication d'IA, dans les formes que ces onze langues emploient.
    //
    // Le SIGLE est cherché en majuscules seulement : « ai » minuscule est une
    // préposition courante en italien (« in base ai tuoi criteri ») et en
    // roumain. Chercher sans tenir compte de la casse rendait ce test rouge sur
    // une phrase parfaitement honnête — un garde-fou qui crie à tort finit
    // désactivé.
    const SIGLE = /\bA\.?I\.?\b|\bI\.?A\.?\b/;
    const EN_TOUTES_LETTRES =
      /artificial intelligence|intelligence artificielle|künstliche intelligenz|inteligencia artificial|intelligenza artificiale|人工智能|人工知能|인공지능|mesterséges intelligencia|artificiell intelligens|inteligență artificială/i;
    const revendiqueIA = (v: string) => SIGLE.test(v) || EN_TOUTES_LETTRES.test(v);

    for (const [code, dict] of Object.entries(LANGUES)) {
      for (const cle of CLES) {
        const valeur = dict[cle];
        expect(valeur, `${code} n'a pas ${cle}`).toBeTruthy();
        expect(revendiqueIA(valeur), `${code}/${cle} revendique une IA : « ${valeur} »`).toBe(
          false,
        );
      }
      // Le mot « prompt » relève du vocabulaire des modèles de langue ; ce
      // champ n'en est pas un.
      expect(dict['smartai.sectionKeywords'].toLowerCase()).not.toContain('prompt');
    }
  });

  it('les identifiants techniques ne bougent pas', () => {
    // Renommer une de ces valeurs casserait les installations : le serveur les
    // compare telles quelles (`match mood.as_str()` dans smart_ai.rs, routes
    // épinglées dans docs/contrat-web.json).
    for (const id of ['happy', 'sad', 'energetic', 'calm', 'focus', 'romantic']) {
      expect(vue).toContain(`id: '${id}'`);
    }
    const api = readFileSync(resolve(__dirname, '../api.ts'), 'utf-8');
    for (const route of ['/smart-ai/mood', '/smart-ai/generate', '/smart-ai/history-based', '/smart-ai/discovery', '/smart-ai/tempo-match']) {
      expect(api).toContain(route);
    }
    // La vue reste atteignable par la même valeur de navigation.
    const nav = readFileSync(resolve(__dirname, '../stores/navigation.ts'), 'utf-8');
    expect(nav).toContain("'smart-ai'");
  });
});
