// @vitest-environment jsdom
//
// #6018 — LA LECTURE SPOTIFY, OPTION EXPÉRIMENTALE.
//
// Décision de Bertrand (09/10) : la lecture Spotify par librespot est livrée
// DÉSACTIVÉE, derrière un réglage « Lecture Spotify (expérimental) » et un
// avertissement (client non officiel, conditions de Spotify, Premium requis).
// Tant qu'elle est désactivée, le serveur refuse proprement : 409
// `spotify_playback_disabled`. L'écran doit le dire dans la langue de
// l'interface, pas en « Server error » brut.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

const LANGUES: Record<string, Record<string, string>> = {
  fr, en, de, es, it: it_, zh, ja, ko, ro, sv, hu,
} as any;

const CLE_REFUS = 'playback.errorSpotifyDisabled';
const CLE_REGLAGE = 'v2.set.spotifyPlaybackExperimental';
const CLE_AVERTISSEMENT = 'v2.set.spotifyPlaybackWarning';

const REFUS = {
  error: 'spotify_playback_disabled',
  code: 'spotify_playback_disabled',
  message: 'Lecture Spotify non activée (option expérimentale dans les Réglages).',
};

function derniere(): string | undefined {
  const l = get(notifications);
  return l[l.length - 1]?.message;
}

beforeEach(() => {
  for (const n of get(notifications)) notifications.dismiss(n.id);
  locale.set('fr');
});

afterEach(() => {
  vi.unstubAllGlobals();
  locale.set('fr');
});

describe('#6018 — lecture Spotify expérimentale', () => {
  it('🔴 le refus « non activée » s’affiche traduit, pas en erreur serveur', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(REFUS), {
      status: 409, statusText: 'Conflict', headers: { 'Content-Type': 'application/json' },
    })));
    await api.play(7, { source: 'spotify', source_id: 'x' } as any).catch(() => {});
    expect(fr[CLE_REFUS]).toBeTruthy();
    expect(derniere()).toBe(fr[CLE_REFUS]);
    expect(derniere()).not.toContain('Server error');
  });

  it('🔴 réglage, avertissement et refus existent dans les 11 langues', () => {
    for (const [lang, table] of Object.entries(LANGUES)) {
      for (const cle of [CLE_REFUS, CLE_REGLAGE, CLE_AVERTISSEMENT]) {
        expect(table[cle], `${lang} : ${cle}`).toBeTruthy();
      }
      expect(table[CLE_AVERTISSEMENT], `${lang} nomme librespot`).toContain('librespot');
      expect(table[CLE_AVERTISSEMENT], `${lang} nomme Premium`).toContain('Premium');
    }
    expect(fr[CLE_AVERTISSEMENT]).toBe(
      "librespot n'est pas un client officiel ; son usage peut contrevenir aux conditions de Spotify. "
        + 'Vous l’activez sous votre responsabilité. Spotify Premium requis.',
    );
    expect(fr[CLE_REFUS]).toBe('Lecture Spotify non activée (option expérimentale dans les Réglages).');
  });

  it('🔴 le réglage se règle par la route du serveur', async () => {
    const appels: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      appels.push({ url, init });
      return new Response(JSON.stringify({ enabled: false, device_name: 'Tune', zone_id: null,
        binary_available: true, active: false, lecture_experimentale: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }));
    const st = await (api as any).setSpotifyLectureExperimentale(true);
    expect(st.lecture_experimentale).toBe(true);
    expect(appels).toHaveLength(1);
    expect(appels[0].url).toContain('/spotify-connect/lecture-experimentale');
    expect(appels[0].init?.method).toBe('POST');
    expect(JSON.parse(String(appels[0].init?.body))).toEqual({ enabled: true });
  });

  it('🔴 l’écran Spotify des Réglages porte l’interrupteur et l’avertissement', () => {
    const src = readFileSync(resolve(__dirname, '../../components/v2/SettingsV2.svelte'), 'utf8');
    expect(src).toContain(`$t('${CLE_REGLAGE}'`);
    expect(src).toContain(`$t('${CLE_AVERTISSEMENT}'`);
    expect(src).toContain('api.setSpotifyLectureExperimentale(');
    expect(src).toContain('spc?.lecture_experimentale');
  });
});
