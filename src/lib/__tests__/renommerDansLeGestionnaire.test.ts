import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Bertrand, 22/09/2026 : « Comment modifier le nom d'une playlist en mode
 * édition ?? », puis « Je n'y arrive pas !! ».
 *
 * 🔴 Il ne pouvait pas. `renommerPlaylist` existait dans le gestionnaire de
 * playlists depuis la veille, avec sa traduction dans les onze langues, et
 * AUCUN appelant : le crayon de la vignette ouvre la playlist, mais l'en-tête
 * du détail n'offrait qu'Importer, Récupérer, Transférer, Comparer et Tout
 * lire. Du code écrit, jamais branché.
 *
 * Garde de code, faute de pouvoir regarder l'écran : le Chrome du poste est
 * géré par la DSI et l'extension ne peut pas être activée.
 */
describe('Gestionnaire de playlists : le détail sait renommer', () => {
  const vue = readFileSync(
    resolve(__dirname, '../../components/v2-heritage/PlaylistManagerView.svelte'),
    'utf-8',
  );

  it('un bouton appelle renommerPlaylist — la fonction n’est plus orpheline', () => {
    expect(vue).toContain('async function renommerPlaylist(');
    const appels = vue.split('renommerPlaylist(').length - 1;
    expect(appels, 'renommerPlaylist est définie mais jamais appelée').toBeGreaterThan(1);
    expect(vue).toContain("$tr('v2.pl.rename' as any)");
  });

  it('le bouton vit dans l’en-tête du détail, réservé aux playlists LOCALES', () => {
    const entete = vue.slice(vue.indexOf('<div class="detail-actions">'), vue.indexOf('class="play-all-btn"'));
    expect(entete, 'le bouton n’est pas dans l’en-tête du détail').toContain('rename-btn');
    // Une playlist de service ne se renomme nulle part : aucune route ne le
    // fait chez Tidal ou Qobuz. Le bouton doit être absent, pas grisé.
    const avant = entete.slice(0, entete.indexOf('rename-btn'));
    expect(avant.lastIndexOf('{#if selectedPlaylist?.id != null}')).toBeGreaterThan(-1);
    expect(entete).not.toContain('disabled={selectedStreamingPl');
  });

  it('le titre ouvert suit le nouveau nom, sans attendre un retour en arrière', () => {
    const corps = vue.slice(vue.indexOf('async function renommerPlaylist('));
    expect(corps.slice(0, 1200)).toContain('selectedPlaylist = { ...selectedPlaylist, name: propre }');
  });
});
