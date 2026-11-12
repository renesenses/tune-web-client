// @vitest-environment jsdom
//
// tune-server-rust#8579 — un favori Spotify refusé faute d'autorisation
// d'écriture (compte relié avant le changement) : 409
// `spotify_reconnexion_favoris`. Décision de Bertrand (12/11/2026) : le
// message « Reconnectez Spotify une fois pour gérer vos favoris », avec le
// bouton qui mène à la connexion.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import * as api from '../api';
import { locale } from '../i18n';
import { notifications } from '../stores/notifications';
import { activeView } from '../stores/navigation';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { signalerRecopieManquee } from '../streamingFavorites';
import { CLE_BOUTON, CLE_MESSAGE } from '../spotifyReconnexionFavoris';
import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import zh from '../locales/zh';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import hu from '../locales/hu';
import viLocale from '../locales/vi';
import elLocale from '../locales/el';
import nbLocale from '../locales/nb';
import plLocale from '../locales/pl';

const LANGUES: Record<string, Record<string, string>> = {
  fr, en, de, es, it: it_, zh, ja, ko, ro, sv, hu, vi: viLocale, el: elLocale, nb: nbLocale, pl: plLocale,
} as any;

function repondre(statut: number, corps: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(corps), {
    status: statut, headers: { 'Content-Type': 'application/json' },
  })));
}

beforeEach(() => {
  for (const n of get(notifications)) notifications.dismiss(n.id);
  locale.set('fr');
  activeView.set('streaming' as any);
  v2SettingsTarget.set(null);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('#8579 — reconnecter Spotify pour gérer ses favoris', () => {
  it('🔴 le refus dit la phrase, avec le bouton qui mène à la connexion', async () => {
    repondre(409, { code: 'spotify_reconnexion_favoris', error: 'spotify_reconnexion_favoris', message: 'portee manquante' });
    const err = await api.addStreamingFavorite('spotify', 'tracks' as any, 't1').catch((e) => e);
    expect(err.dejaAnnonce).toBe(true);
    const l = get(notifications);
    const n = l[l.length - 1];
    expect(n.message).toBe(fr[CLE_MESSAGE]);
    expect(n.action?.label).toBe(fr[CLE_BOUTON]);
    n.action!.run();
    expect(get(activeView)).toBe('settings');
    expect(get(v2SettingsTarget)).toEqual({ tab: 'access', section: 'streaming' });
    // La recopie manquée ne crie pas une seconde fois.
    const avant = get(notifications).length;
    signalerRecopieManquee('spotify', err);
    expect(get(notifications).length).toBe(avant);
  });

  it('🔴 contre-épreuve : un autre refus garde le message « le service n’a pas suivi »', async () => {
    repondre(409, { code: 'autre_chose', error: 'autre_chose', message: 'x' });
    const err = await api.addStreamingFavorite('spotify', 'tracks' as any, 't1').catch((e) => e);
    const avant = get(notifications).length;
    signalerRecopieManquee('spotify', err);
    const l = get(notifications);
    expect(l.length).toBe(avant + 1);
    expect(l[l.length - 1].message).not.toBe(fr[CLE_MESSAGE]);
  });

  it('🔴 la phrase et le bouton existent dans les 15 langues', () => {
    for (const [lang, table] of Object.entries(LANGUES)) {
      expect(table[CLE_MESSAGE], lang).toContain('Spotify');
      expect(table[CLE_BOUTON], lang).toContain('Spotify');
    }
    expect(fr[CLE_MESSAGE]).toBe('Reconnectez Spotify une fois pour gérer vos favoris.');
  });
});
