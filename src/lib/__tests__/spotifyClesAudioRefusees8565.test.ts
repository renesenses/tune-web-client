// @vitest-environment jsdom
//
// tune-server-rust#8565 (fil 2778, Jon) — décision de Bertrand du 13/11 :
// « message clair seulement ». Quand Spotify refuse les clés audio du compte
// (librespot #1649, `error audio key 0 1`), le serveur rend un 409 au code
// stable `spotify_audio_key_refused` (lecture lancée depuis Tune) et le
// statut du récepteur porte `receiver_error_code: spotify_audio_key_refused`.
// L'écran dit « Spotify a refusé les clés audio de ce compte » au lieu de
// sauter les titres en silence.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import * as api from '../api';
import { locale } from '../i18n';
import { notifications } from '../stores/notifications';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';
import fr from '../locales/fr';
import en from '../locales/en';

const CLE = 'playback.errorSpotifyAudioKeyRefused';

const REFUS = {
  error: 'spotify_audio_key_refused',
  code: 'spotify_audio_key_refused',
  message_key: 'spotify.playback.audioKeyRefused',
  message: 'Spotify a refusé les clés audio de ce compte : ses titres ne peuvent pas être lus dans Tune.',
  cause: 'Spotify a refusé les clés audio de ce compte (librespot : « error audio key »)',
};

function derniere(): string | undefined {
  const l = get(notifications);
  return l[l.length - 1]?.message;
}

beforeEach(() => {
  for (const n of get(notifications)) notifications.dismiss(n.id);
  locale.set('fr');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(REFUS), {
    status: 409, statusText: 'Conflict', headers: { 'Content-Type': 'application/json' },
  })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  locale.set('fr');
});

describe('#8565 — Spotify a refusé les clés audio de ce compte', () => {
  it('🔴 la lecture refusée le dit, traduit, sans la cause technique', async () => {
    const err = await api.play(7, { source: 'spotify', source_id: 'x' } as any).catch((e) => e);
    expect(fr[CLE]).toContain('Spotify a refusé les clés audio de ce compte');
    expect(derniere()).toBe(fr[CLE]);
    expect(derniere()).not.toContain('error audio key');
    expect(err.dejaAnnonce).toBe(true);
  });

  it('dans la langue de l’interface', async () => {
    locale.set('en');
    await api.play(7, { source: 'spotify', source_id: 'x' } as any).catch(() => {});
    expect(derniere()).toBe(en[CLE]);
  });

  it('la phrase existe dans les quinze langues', () => {
    for (const langue of ONZE_LANGUES) {
      expect(dictionnaire(langue)[CLE], `${CLE} en ${langue}`).toBeTruthy();
    }
  });

  it('🔴 Réglages › Spotify Connect affiche le refus du récepteur', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/v2/SettingsV2.svelte'), 'utf-8')
      .replace(/<!--[\s\S]*?-->/g, '');
    expect(source).toContain("spc?.receiver_error_code === 'spotify_audio_key_refused'");
    expect(source).toContain(`$t('${CLE}' as any)`);
  });
});
