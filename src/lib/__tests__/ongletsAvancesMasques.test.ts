import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Bertrand, 22/09/2026 : « Masque tout cela en attendant Tune Circle et que je
 * réfléchisse ».
 *
 * Les quatre onglets avancés du gestionnaire de playlists — Transferts,
 * Synchro, Sauvegarde, Collaboratives — fonctionnent (routes mesurées sur le
 * .18), mais leur place n'est pas arrêtée : la sauvegarde recoupe les
 * instantanés du futur greffon Playlists converter, et les collaboratives
 * relèvent de Tune Circle. On les masque SANS rien supprimer.
 */
describe('Gestionnaire de playlists : les onglets avancés sont masqués', () => {
  const vue = readFileSync(
    resolve(__dirname, '../../components/v2-heritage/PlaylistManagerView.svelte'),
    'utf-8',
  );

  it('un seul interrupteur les gouverne, et il est à faux', () => {
    expect(vue).toMatch(/const ONGLETS_AVANCES = false;/);
  });

  it('les quatre boutons vivent derrière cet interrupteur', () => {
    const barre = vue.slice(vue.indexOf('<div class="pm-tabs">'), vue.indexOf('<div class="pm-header-right">'));
    expect(barre).toContain('{#if ONGLETS_AVANCES}');
    for (const cle of ['tabTransfers', 'tabSync', 'tabBackup', 'tabCollab']) {
      const i = barre.indexOf(cle);
      expect(i, `${cle} introuvable dans la barre d'onglets`).toBeGreaterThan(-1);
      expect(i, `${cle} est hors du bloc masqué`).toBeGreaterThan(barre.indexOf('{#if ONGLETS_AVANCES}'));
    }
    // L'onglet Playlists, lui, reste toujours visible.
    expect(barre.indexOf('tabPlaylists')).toBeLessThan(barre.indexOf('{#if ONGLETS_AVANCES}'));
  });

  it('rien n’est supprimé : le contenu des onglets et leurs appels restent', () => {
    for (const appel of ['getTransferHistory(', 'getPlaylistLinks(', 'listPlaylistSnapshots(', 'loadCollabPlaylists(']) {
      expect(vue, `${appel} a été supprimé au lieu d'être masqué`).toContain(appel);
    }
  });

  it('un état ancien ne bloque pas sur un onglet sans bouton', () => {
    const corps = vue.slice(vue.indexOf('async function loadManagerData()'));
    expect(corps.slice(0, 400)).toContain("managerTab = 'playlists'");
  });
});
