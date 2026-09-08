/**
 * #798 — « 🔒 Unlimited Zones » en anglais brut dans un écran traduit en onze
 * langues.
 *
 * Relevé en instruisant le retour d'un prospect (Claudio Osorio, 08/09/2026)
 * qui a conclu que **DLNA, AirPlay 2 et BluOS étaient payants**. Ils ne le
 * sont pas.
 *
 * L'écran de licence affichait `feat.display_name`, servi tel quel par le
 * serveur : « Unlimited Zones », « Multiroom Sync », « DSP & EQ »… Vingt-cinq
 * lignes anglaises frappées d'un cadenas. Et deux d'entre elles pointent vers
 * l'écran des zones — ce qui explique précisément sa conclusion.
 *
 * Le terme stable était déjà là : `LicenseStatus.features` est indexé par le
 * CODE, qui ne bouge pas avec la langue.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { cleFonctionnalite, nomFonctionnalite } from '../nomFonctionnaliteLicence';

/** Les vingt-cinq codes servis par le .18 le 08/09/2026. */
const CODES = [
  'acoustic_analysis', 'advanced_alarms', 'ai_recommendations', 'auto_enrichment',
  'batch_converter', 'cloud_backup', 'cloud_config_backup', 'cloud_relay',
  'dac_calibration', 'declick', 'developer_api', 'dsp_eq', 'listening_stats',
  'multi_profiles', 'multi_scrobbling', 'multi_server', 'multiroom_sync',
  'playlist_transfer', 'playlists_hub', 'plugin_marketplace', 'room_correction',
  'social_sharing', 'synced_lyrics', 'unlimited_zones', 'weekly_digest',
];
const LANGUES = ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh'];

describe('Le nom d’une fonctionnalité de licence', () => {
  it('🔴 les VINGT-CINQ codes du serveur ont leur traduction, dans les ONZE langues', () => {
    const manquantes: string[] = [];
    for (const lang of LANGUES) {
      const src = readFileSync(`src/lib/locales/${lang}.ts`, 'utf8');
      for (const code of CODES) {
        if (!src.includes(`"${cleFonctionnalite(code)}"`)) manquantes.push(`${lang}/${code}`);
      }
    }
    expect(manquantes).toEqual([]);
  });

  it('préfère la traduction au nom du serveur', () => {
    const traduire = (c: string) => (c === 'licenseFeature.unlimited_zones' ? 'Zones illimitées' : c);
    expect(nomFonctionnalite('unlimited_zones', 'Unlimited Zones', traduire)).toBe('Zones illimitées');
  });

  it('🔴 mais garde `display_name` en REPLI', () => {
    // Le serveur peut livrer une fonctionnalité que ce client ne connaît pas
    // encore : mieux vaut un nom anglais qu'une ligne vide ou un code brut.
    const traduire = (c: string) => c;   // rien n'est traduit
    expect(nomFonctionnalite('feature_de_demain', 'Tomorrow Feature', traduire)).toBe('Tomorrow Feature');
  });

  it('et le code en dernier recours', () => {
    const traduire = (c: string) => c;
    expect(nomFonctionnalite('feature_de_demain', null, traduire)).toBe('feature_de_demain');
    expect(nomFonctionnalite('feature_de_demain', '   ', traduire)).toBe('feature_de_demain');
  });

  it('🔴 « unlimited_zones » ne dit plus « Unlimited Zones » en français', () => {
    // C'est la ligne exacte qui a fait conclure au prospect que ses enceintes
    // réseau étaient payantes.
    const fr = readFileSync('src/lib/locales/fr.ts', 'utf8');
    const m = fr.match(/"licenseFeature\.unlimited_zones":\s*"((?:\\.|[^"])*)"/);
    expect(m).not.toBeNull();
    expect(m![1]).toBe('Zones illimitées');
  });
});

describe('🔴 L’écran appelle bien cette règle', () => {
  const ECRAN = readFileSync('src/components/SettingsView.svelte', 'utf8');

  it('la grille de licence passe par le traducteur', () => {
    expect(ECRAN).toContain('nomFonctionnalite(key, feat.display_name');
  });

  it('et n’affiche plus `display_name` nu', () => {
    // La régression se ferait en une ligne, et se verrait seulement chez un
    // utilisateur non francophone.
    expect(ECRAN).not.toMatch(/license-feature-name">\{feat\.display_name\}/);
  });
});
