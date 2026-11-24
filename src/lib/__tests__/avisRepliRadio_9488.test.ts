// @vitest-environment jsdom
//
// tune-server-rust#9488 (PR #9503, rc15) — le flux lancé d'une radio ne
// démarre pas : le serveur joue un autre flux de la station et le dit par un
// `zone.playback_error` NON fatal, code `radio_stream_fallback`, paramètres
// `title`, `failed_kbps`, `playing_kbps`. L'annonce part au premier son, donc
// DANS la fenêtre de grâce de 30 s qui suit « Lire » : sans branche dédiée,
// l'écran montrait « Chargement... » et jamais l'annonce.
//
// Contre-épreuve : un autre avis non fatal reçu dans la même fenêtre reste
// masqué par « Chargement... », comme avant.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { demarrerTransportV2 } from '../v2Live';
import { currentZoneId, zones, playPendingUntil } from '../stores/zones';
import { notifications } from '../stores/notifications';
import { locale, preparerLocale } from '../i18n';
import { texteAvisRepliRadio } from '../avisRepliRadio';
import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import nl from '../locales/nl';
import pl from '../locales/pl';
import nb from '../locales/nb';
import sv from '../locales/sv';
import ro from '../locales/ro';
import hu from '../locales/hu';
import el from '../locales/el';
import ru from '../locales/ru';
import uk from '../locales/uk';
import tr from '../locales/tr';
import ja from '../locales/ja';
import ko from '../locales/ko';
import zh from '../locales/zh';
import zhHant from '../locales/zh-Hant';
import vi_ from '../locales/vi';

let pousser: (e: unknown) => void = () => {};
vi.mock('../websocket', () => ({
  tuneWS: {
    connect: () => {},
    setCurrentZoneId: () => {},
    get isPolling() {
      return false;
    },
    onEvent: (h: (e: unknown) => void) => {
      pousser = h;
      return () => {};
    },
  },
}));

const zone = { id: 4, name: 'Salon', state: 'playing', volume: 0.3, position_ms: 0,
  current_track: { id: 0, title: 'FIP', duration_ms: 0 } };

beforeEach(async () => {
  await preparerLocale('fr');
  locale.set('fr');
  playPendingUntil.clear();
  for (const n of get(notifications)) notifications.dismiss(n.id);
  vi.stubGlobal('fetch', (url: string) => {
    const u = String(url);
    const corps = /\/zones(\?|$)/.test(u) ? [zone] : /\/queue/.test(u) ? { tracks: [], position: 0, length: 0 } : {};
    return Promise.resolve(new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  locale.set('fr');
});

const respirer = () => new Promise((r) => setTimeout(r, 0));

async function recevoir(data: Record<string, unknown>, enGrace: boolean) {
  zones.set([zone as never]);
  currentZoneId.set(4);
  const arreter = demarrerTransportV2();
  await respirer();
  if (enGrace) playPendingUntil.set(4, Date.now() + 30_000);
  pousser({ type: 'zone.playback_error', data });
  await respirer();
  arreter();
  return get(notifications);
}

// La charge exacte de `RepliRadio::charge_utile` (PR #9503).
const avis = {
  zone_id: 4,
  code: 'radio_stream_fallback',
  params: { title: 'FIP', failed_kbps: 256, playing_kbps: 128 },
  error: '« FIP » : Flux 256 kbps indisponible, lecture du flux 128 kbps.',
  fatal: false,
};

describe('#9488 — repli de flux radio : dit, en information, même pendant le chargement', () => {
  it('reçu dans les 30 s qui suivent « Lire » : l’info est affichée, pas « Chargement... »', async () => {
    const recues = await recevoir(avis, true);
    const n = recues.find((x) => x.message === 'Flux 256 kbps indisponible, lecture du flux 128 kbps.');
    expect(n, JSON.stringify(recues)).toBeTruthy();
    expect(n!.level).toBe('info');
    expect(recues.some((x) => x.message === fr['common.loading']), JSON.stringify(recues)).toBe(false);
  });

  it('hors fenêtre de grâce : la même info, jamais en erreur', async () => {
    const recues = await recevoir(avis, false);
    const n = recues.find((x) => x.message.includes('lecture du flux 128 kbps'));
    expect(n, JSON.stringify(recues)).toBeTruthy();
    expect(n!.level).toBe('info');
    expect(recues.some((x) => x.level === 'error'), JSON.stringify(recues)).toBe(false);
  });

  it('contre-épreuve : un autre avis non fatal reste masqué par « Chargement... » dans la fenêtre', async () => {
    const autre = { zone_id: 4, code: 'transcode_pending', error: 'Pré-transcodage en cours', fatal: false };
    const recues = await recevoir(autre, true);
    expect(recues.some((x) => x.message === fr['common.loading']), JSON.stringify(recues)).toBe(true);
    expect(recues.some((x) => x.message.includes('Pré-transcodage')), JSON.stringify(recues)).toBe(false);
  });

  it('le texte vient des champs, pas de la phrase française du serveur', async () => {
    await preparerLocale('en');
    locale.set('en');
    const recues = await recevoir(avis, true);
    expect(recues.some((x) => x.message === '256 kbps stream unavailable, playing the 128 kbps stream.'), JSON.stringify(recues)).toBe(true);
    expect(recues.some((x) => x.message.includes('indisponible')), JSON.stringify(recues)).toBe(false);
  });

  it('débits inconnus (`null`) : la phrase sans chiffre, jamais « null »', () => {
    const p = (failed_kbps: unknown, playing_kbps: unknown) =>
      texteAvisRepliRadio({ ...avis, params: { title: 'FIP', failed_kbps, playing_kbps } });
    expect(p(256, null)).toBe("Flux 256 kbps indisponible, lecture d'un autre flux de la station.");
    expect(p(null, 128)).toBe('Flux indisponible, lecture du flux 128 kbps.');
    expect(p(null, null)).toBe("Flux indisponible, lecture d'un autre flux de la station.");
    expect(texteAvisRepliRadio({ ...avis, params: undefined })).toBe("Flux indisponible, lecture d'un autre flux de la station.");
  });

  it('les quatre clés existent dans les 20 langues, avec leurs paramètres', () => {
    const langues = { fr, en, de, es, it: it_, nl, pl, nb, sv, ro, hu, el, ru, uk, tr, ja, ko, zh, 'zh-Hant': zhHant, vi: vi_ } as Record<string, Record<string, string>>;
    expect(Object.keys(langues)).toHaveLength(20);
    const attendus: Record<string, string[]> = {
      'erreursServeur.radio_stream_fallback': ['{failed_kbps}', '{playing_kbps}'],
      'erreursServeur.radio_stream_fallback_failed': ['{failed_kbps}'],
      'erreursServeur.radio_stream_fallback_playing': ['{playing_kbps}'],
      'erreursServeur.radio_stream_fallback_unknown': [],
    };
    for (const [code, dico] of Object.entries(langues)) {
      for (const [cle, params] of Object.entries(attendus)) {
        const phrase = dico[cle];
        expect(phrase, `${code} ${cle}`).toBeTruthy();
        expect(phrase, `${code} ${cle}`).not.toMatch(/\u00c3/);
        for (const nom of params) expect(phrase, `${code} ${cle}`).toContain(nom);
        expect(phrase.match(/\{\w+\}/g) ?? [], `${code} ${cle}`).toHaveLength(params.length);
      }
    }
  });
});
