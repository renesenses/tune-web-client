// @vitest-environment jsdom
//
// tune-server-rust#8483 (go de Bertrand, rc12) — un fichier abîmé : la zone
// figée sur la coupure passe à la suivante, et le serveur le dit par un
// `zone.playback_error` NON fatal, code `track_file_damaged`, paramètres
// `title` et `position`. L'écran doit l'afficher traduit, titre et position
// interpolés, en information — même dans la fenêtre de grâce.
//
// Contre-épreuve : retirer la branche `estAvisFichierAbime` de `v2Live.ts`
// fait rougir le test (la grâce affiche « chargement » à la place) ; retirer
// la clé `erreursServeur.track_file_damaged` d'une locale fait rougir le
// contrôle des 15 langues.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { demarrerTransportV2 } from '../v2Live';
import { currentZoneId, zones, playPendingUntil } from '../stores/zones';
import { notifications } from '../stores/notifications';
import { preparerLocale } from '../i18n';
import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import pl from '../locales/pl';
import nb from '../locales/nb';
import sv from '../locales/sv';
import ro from '../locales/ro';
import hu from '../locales/hu';
import el from '../locales/el';
import ja from '../locales/ja';
import ko from '../locales/ko';
import zh from '../locales/zh';
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

const zone = { id: 4, name: 'Marantz', state: 'playing', volume: 0.3, position_ms: 0,
  current_track: { id: 12, title: 'La suivante', duration_ms: 214000 } };

beforeEach(async () => {
  await preparerLocale('fr');
  for (const n of get(notifications)) notifications.dismiss(n.id);
  vi.stubGlobal('fetch', (url: string) => {
    const u = String(url);
    const corps = /\/zones(\?|$)/.test(u) ? [zone] : /\/queue/.test(u) ? { tracks: [], position: 0, length: 0 } : {};
    return Promise.resolve(new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
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

const avis = {
  zone_id: 4,
  code: 'track_file_damaged',
  params: { title: 'Lecture coupée', position: '2:16' },
  track_title: 'Lecture coupée',
  position_ms: 136045,
  fatal: false,
  error: '“Lecture coupée”: the file is damaged from 2:16 on. Tune skipped the rest of the track.',
};

describe('#8483 — fichier abîmé : dit, traduit, en information', () => {
  it('titre et position interpolés, niveau information', async () => {
    const recues = await recevoir(avis, false);
    const attendu = "« Lecture coupée » : le fichier est abîmé à partir de 2:16. Tune a sauté la fin de la piste.";
    const n = recues.find((x) => x.message === attendu);
    expect(n, JSON.stringify(recues)).toBeTruthy();
    expect(n!.level).toBe('info');
  });

  it('même dans la fenêtre de grâce qui suit un Lire', async () => {
    const recues = await recevoir(avis, true);
    expect(recues.some((x) => x.message.includes('abîmé à partir de 2:16')), JSON.stringify(recues)).toBe(true);
  });

  it('la clé existe dans les 15 langues, avec ses deux paramètres', () => {
    const langues = { fr, en, de, es, it: it_, pl, nb, sv, ro, hu, el, ja, ko, zh, vi: vi_ } as Record<string, Record<string, string>>;
    expect(Object.keys(langues)).toHaveLength(15);
    for (const [code, dico] of Object.entries(langues)) {
      const phrase = dico['erreursServeur.track_file_damaged'];
      expect(phrase, code).toBeTruthy();
      expect(phrase, code).toContain('{title}');
      expect(phrase, code).toContain('{position}');
    }
  });
});
