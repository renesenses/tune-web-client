/**
 * Bertrand, 16/09/2026 : « L'écran de gestion des profils existe-t-il ? »
 *
 * Il n'existait pas dans la v2 : `ProfilesSettings` n'est monté que par
 * `SettingsView` (interface actuelle). La v2 savait basculer (menu avatar, à
 * partir de deux profils), jamais créer. Ce test tient les trois maillons :
 * la section déclarée, sa branche de rendu, et le chemin depuis le menu.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { V2_SETTINGS } from '../v2Settings';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('gestion des profils dans la coquille v2', () => {
  it('la section « Profils » est déclarée dans l’onglet Général, dès le niveau débutant', () => {
    const general = V2_SETTINGS.find((t) => t.id === 'general')!;
    const s = general.sections.find((x) => x.id === 'profiles');
    expect(s, 'section profiles absente').toBeTruthy();
    expect(s!.min).toBe('beginner');
    expect(s!.titleKey).toBe('settings.tabProfiles');
  });

  it('la section rend ProfilsV2, qui sait créer, renommer et supprimer', () => {
    const ecran = lire('../../components/v2/SettingsV2.svelte');
    expect(ecran).toMatch(/s\.id === 'profiles'\}\s*<ProfilsV2 \/>/);
    const comp = lire('../../components/v2/ProfilsV2.svelte');
    for (const geste of ['createProfile', 'updateProfile', 'deleteProfile', 'selectProfile']) {
      expect(comp.includes(`${geste}(`), `${geste} non appelé`).toBe(true);
    }
    // On ne supprime jamais le dernier profil.
    expect(comp).toMatch(/\{#if \$profiles\.length > 1\}\s*<button class="lnk danger"/);
  });

  it('le menu avatar mène à la section, même avec un seul profil', () => {
    const menu = lire('../../components/v2/AvatarMenu.svelte');
    const i = menu.indexOf("v2SettingsTarget.set({ tab: 'general', section: 'profiles' })");
    expect(i, 'aucun lien « Gérer les profils »').toBeGreaterThan(0);
    // Le lien n'est pas sous la garde `$profiles.length > 1` : il est dans la
    // partie « items » du menu, après la fermeture de cette garde.
    const garde = menu.indexOf('{#if $profiles.length > 1}');
    const finGarde = menu.indexOf('{/if}', garde);
    expect(i).toBeGreaterThan(finGarde);
  });
});
