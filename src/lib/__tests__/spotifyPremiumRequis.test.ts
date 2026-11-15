// @vitest-environment jsdom
//
// Compte Spotify GRATUIT. Spotify n'autorise l'écoute dans une application
// tierce qu'avec Premium : librespot est refusé (« Premium account required »)
// et l'API Web répond `PREMIUM_REQUIRED`. Le serveur rend un 409 au code
// stable `spotify_premium_required` (tune-server-rust, branche
// fix/spotify-premium-requis-pr49). L'écran doit le dire dans la langue de
// l'interface, et rappeler que la navigation reste possible — pas une
// « Erreur de lecture » ni le texte technique du refus.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import * as api from '../api';
import { locale } from '../i18n';
import { notifications } from '../stores/notifications';
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

const CLE = 'playback.errorSpotifyPremium';

const REFUS = {
  error: 'spotify_premium_required',
  code: 'spotify_premium_required',
  message_key: 'spotify.playback.premiumRequired',
  message: "Spotify n'autorise l'écoute dans une application tierce comme Tune qu'avec un compte Spotify Premium.",
  cause: 'librespot : « Login failed with reason: Premium account required »',
};

function derniere(): string | undefined {
  const l = get(notifications);
  return l[l.length - 1]?.message;
}

function repondre(corps: unknown, status = 409) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(corps), {
    status, statusText: 'Conflict', headers: { 'Content-Type': 'application/json' },
  })));
}

beforeEach(() => {
  for (const n of get(notifications)) notifications.dismiss(n.id);
  locale.set('fr');
});

afterEach(() => {
  vi.unstubAllGlobals();
  locale.set('fr');
});

describe('Spotify — compte gratuit : Premium exigé', () => {
  it('🔴 le refus s’affiche traduit, sans la cause technique', async () => {
    repondre(REFUS);
    const err = await api.play(7, { source: 'spotify', source_id: 'x' } as any).catch((e) => e);
    expect(derniere()).toBe(fr[CLE]);
    expect(derniere()).not.toContain('Login failed');
    expect(err.message).toBe(fr[CLE]);
    expect(err.dejaAnnonce).toBe(true);
  });

  it('🔴 dans la langue de l’interface', async () => {
    locale.set('en');
    repondre(REFUS);
    await api.play(7, { source: 'spotify', source_id: 'x' } as any).catch(() => {});
    expect(derniere()).toBe(en[CLE]);
  });

  it('🔴 contre-épreuve : un autre 409 Spotify ne prend pas cette phrase', async () => {
    repondre({ error: 'spotify_playback_disabled', code: 'spotify_playback_disabled', message: 'x' });
    await api.play(7, { source: 'spotify', source_id: 'x' } as any).catch(() => {});
    expect(derniere()).not.toBe(fr[CLE]);
  });

  it('🔴 la phrase existe dans les 15 langues, nomme Premium et la navigation', () => {
    for (const [lang, table] of Object.entries(LANGUES)) {
      expect(table[CLE], `${lang} : ${CLE}`).toBeTruthy();
      expect(table[CLE], `${lang} nomme Premium`).toContain('Premium');
      expect(table[CLE], `${lang} nomme Tune`).toContain('Tune');
    }
  });
});
