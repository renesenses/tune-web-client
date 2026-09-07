import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { V2_SETTINGS } from '../v2Settings';
import { SETTING_LEVELS } from '../settingLevels';
import * as LOCALES from '../locales';

/**
 * #2723 — le sélecteur « Qualité streaming » est RETIRÉ tant qu'il ne pilote
 * rien.
 *
 * Mesuré côté serveur (`routes/playback.rs`) : `POST /zones/{id}/quality`
 * persiste `zone_{id}_quality` sans la valider, `GET` rend un tout autre objet
 * (`max_sample_rate`, `max_bit_depth`, `prefer_hires`), et **la clé n'a aucun
 * consommateur** — ni la résolution demandée au service, ni le transcodage, ni
 * la négociation de sortie ne la lisent. Quatre paliers offerts à l'écran,
 * aucun effet sur le son.
 *
 * Arbitrage de Bertrand : retirer le réglage. Il pourra revenir le jour où les
 * quatre paliers seront définis service par service ET appliqués au résolveur,
 * avec une contre-épreuve qui observe le format DEMANDÉ et le format LIVRÉ.
 *
 * Ce test est la garde de ce retrait. Un réglage inerte se réintroduit tout
 * seul : il suffit qu'on retrouve la fonction d'API, ou qu'on recolle un bloc
 * depuis l'écran actuel vers l'écran v2. Il tombera alors ici, et il faudra
 * répondre à la seule question qui compte — le serveur lit-il enfin la valeur ?
 */

const lire = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8');
const api = lire('../api.ts');
const settingsView = lire('../../components/SettingsView.svelte');
const settingsV2 = lire('../../components/v2/SettingsV2.svelte');

const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'hu', 'ja', 'ko', 'ro', 'sv', 'zh'] as const;
const dict = (l: string) => (LOCALES as Record<string, Record<string, string>>)[l];

/** Les cinq clés du sélecteur : son titre et ses quatre paliers. */
const CLES = [
  'settings.streamingQuality',
  'settings.qualityMax',
  'settings.qualityHires',
  'settings.qualityCd',
  'settings.qualityLow',
];

describe('#2723 — le sélecteur de qualité streaming ne revient pas', () => {
  it('l’API n’expose plus la route inerte', () => {
    // `mapStreamingQuality` reste : elle décrit la qualité RÉELLEMENT jouée,
    // lue sur la piste en cours. C'est l'écriture d'un palier jamais lu qui
    // partait, pas l'affichage de ce qui sort.
    expect(api).not.toContain('export function getStreamingQuality');
    expect(api).not.toContain('export function setStreamingQuality');
    expect(api).not.toContain('/quality`');
    expect(api, 'témoin : l’affichage de la qualité jouée doit rester').toContain(
      'function mapStreamingQuality(',
    );
  });

  it('aucun des deux écrans ne rend le sélecteur', () => {
    for (const [nom, source] of [
      ['SettingsView.svelte', settingsView],
      ['v2/SettingsV2.svelte', settingsV2],
    ] as const) {
      for (const motif of ['StreamingQuality', 'streamQuality', 'quality-select']) {
        expect(source.includes(motif), `${nom} contient encore « ${motif} »`).toBe(false);
      }
      for (const cle of CLES) {
        expect(source.includes(cle), `${nom} appelle encore la clé « ${cle} »`).toBe(false);
      }
    }
  });

  it('les registres ne déclarent plus le réglage', () => {
    const sections = V2_SETTINGS.flatMap((t) => t.sections).map((s) => s.id);
    expect(sections).not.toContain('streamQuality');
    expect(Object.keys(SETTING_LEVELS)).not.toContain('general.streamingQuality');
  });

  it('les onze locales ne portent plus les cinq clés orphelines', () => {
    // `check-i18n` exige la parité stricte des onze langues : une clé oubliée
    // dans une seule locale ferait rougir la porte, pas seulement ce test.
    const restes: string[] = [];
    for (const l of LANGUES) {
      for (const cle of CLES) {
        if (dict(l) && cle in dict(l)) restes.push(`${l} → ${cle}`);
      }
    }
    expect(restes, 'clé(s) i18n orpheline(s) :\n  ' + restes.join('\n  ')).toEqual([]);
  });
});
