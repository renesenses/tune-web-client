// tune-web-client#2441 (go de Bertrand, 12/11 : rc12) — les Réglages YouTube
// montrent la version installée du module de lecture ET la dernière publiée,
// disent « à jour » ou « une mise à jour existe », et, quand la dernière
// version n'a pas pu être lue, le disent avec la raison au lieu d'afficher
// « à jour » à tort. Champs serveur : tune-server-rust#7166.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ligneModuleYoutube } from '../moduleYoutube';

const base = { installed: true, version: '2026.10.01' };

describe('web#2441 — la ligne du module YouTube', () => {
  it('à jour : la dernière version est dite', () => {
    expect(ligneModuleYoutube({ ...base, latest_version: '2026.10.01', up_to_date: true, latest_error: null }))
      .toEqual({ etat: 'a_jour', cle: 'settings.youtubeModuleUpToDate', params: { latest: '2026.10.01' } });
  });

  it('en retard : une mise à jour existe, avec son numéro', () => {
    expect(ligneModuleYoutube({ ...base, latest_version: '2026.11.05', up_to_date: false, latest_error: null }))
      .toEqual({ etat: 'mise_a_jour', cle: 'settings.youtubeModuleUpdateAvailable', params: { latest: '2026.11.05' } });
  });

  it('🔴 dernière version illisible : jamais « à jour », la raison est dite', () => {
    const l = ligneModuleYoutube({ ...base, latest_version: null, up_to_date: null, latest_error: 'GitHub injoignable' });
    expect(l).toEqual({ etat: 'inconnue', cle: 'settings.youtubeModuleLatestUnknown', params: { reason: 'GitHub injoignable' } });
    // Même un `up_to_date: true` sans dernière version ne vaut pas « à jour ».
    expect(ligneModuleYoutube({ ...base, latest_version: null, up_to_date: true })?.etat).toBe('inconnue');
  });

  it('module absent, ou serveur antérieur sans les champs : rien', () => {
    expect(ligneModuleYoutube({ installed: false, version: null, latest_version: '2026.11.05', up_to_date: null })).toBeNull();
    expect(ligneModuleYoutube({ ...base })).toBeNull();
    expect(ligneModuleYoutube(null)).toBeNull();
  });

  it('l’écran branche la ligne sous « Lecture YouTube »', () => {
    const src = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
    expect(src).toContain('ytLigne = ligneModuleYoutube(s);');
    expect(src).toContain('data-module-youtube={ytLigne.etat}');
  });

  it('les trois phrases existent dans toutes les langues, avec leur paramètre', () => {
    for (const l of ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'vi', 'el', 'nb', 'pl']) {
      const src = readFileSync(`src/lib/locales/${l}.ts`, 'utf8');
      expect(src, l).toMatch(/"settings\.youtubeModuleUpToDate": "[^"]*\{latest\}[^"]*"/);
      expect(src, l).toMatch(/"settings\.youtubeModuleUpdateAvailable": "[^"]*\{latest\}[^"]*"/);
      expect(src, l).toMatch(/"settings\.youtubeModuleLatestUnknown": "[^"]*\{reason\}[^"]*"/);
    }
  });
});
