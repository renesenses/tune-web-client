// @vitest-environment jsdom
//
// tune-server-rust#8913 — recette du .18, rc12 (17/11/2026) : une piste
// YouTube, yt-dlp non activé, et à l'écran « HTTP 502 — upstream_error —
// Streaming service error: YouTube playback failed… native API and yt-dlp
// both failed ». Le serveur rend désormais un 409 au code stable
// `youtube_playback_disabled`, phrase traduite (`message_key`, #7077) ;
// l'interface la dit, avec le bouton qui mène au réglage « Lecture YouTube ».
// À la connexion du compte YouTube, elle propose de l'activer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';
import * as api from '../api';
import { locale } from '../i18n';
import { notifications } from '../stores/notifications';
import { activeView } from '../stores/navigation';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import {
  CLE_BOUTON,
  CLE_BOUTON_ACTIVER,
  CLE_MESSAGE,
  CLE_PROPOSITION,
  CODE_LECTURE_YOUTUBE_INACTIVE,
  proposerApresConnexion,
  texteLectureYoutubeInactive,
} from '../lectureYoutubeInactive';
import { reglageParId } from '../reglagesIndex';
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

/** Le corps que rend le serveur (tune-server-rust#8913, `refus_lecture_youtube_inactive`). */
const PHRASE_SERVEUR = "La lecture YouTube n'est pas activée (phrase du serveur).";
const CORPS_409 = {
  error: 'youtube_playback_disabled',
  code: 'youtube_playback_disabled',
  message: PHRASE_SERVEUR,
  message_key: 'playback.youtube_playback_disabled',
  action: 'enable_youtube_playback',
  enable_endpoint: '/api/v1/system/youtube/enable',
  cause: 'youtube_playback_disabled: YouTube playback is not enabled — turn it on in Settings',
};

function repondre(statut: number, corps: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(corps), {
    status: statut, headers: { 'Content-Type': 'application/json' },
  })));
}

const derniere = () => { const l = get(notifications); return l[l.length - 1]; };

beforeEach(() => {
  for (const n of get(notifications)) notifications.dismiss(n.id);
  locale.set('fr');
  activeView.set('streaming' as any);
  v2SettingsTarget.set(null);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('#8913 — YouTube sans yt-dlp : un message clair et le bouton du réglage', () => {
  it('🔴 le 409 dit la phrase du serveur, avec le bouton qui mène à « Lecture YouTube »', async () => {
    repondre(409, CORPS_409);
    const err = await api.play(1, { source: 'youtube' as any, source_id: '8g25GeJgxgs' }).catch((e) => e);
    expect(err.dejaAnnonce).toBe(true);
    const n = derniere();
    expect(n.message).toBe(PHRASE_SERVEUR);
    expect(n.message).not.toContain('upstream_error');
    expect(n.action?.label).toBe(fr[CLE_BOUTON]);
    n.action!.run();
    expect(get(activeView)).toBe('settings');
    expect(get(v2SettingsTarget)).toEqual({ tab: 'access', section: 'streaming', reglage: 'youtube-lecture' });
  });

  it('le bouton vise un réglage qui existe dans l’index (sinon il ne mènerait nulle part)', () => {
    expect(reglageParId('youtube-lecture')?.section).toBe('streaming');
  });

  it('sans phrase traduite du serveur, la nôtre — jamais le code brut', () => {
    expect(texteLectureYoutubeInactive(undefined)).toBe(fr[CLE_MESSAGE]);
    expect(texteLectureYoutubeInactive(
      `Impossible de lire la piste suivante : ${CODE_LECTURE_YOUTUBE_INACTIVE}: YouTube playback is not enabled`,
    )).toBe(fr[CLE_MESSAGE]);
    expect(texteLectureYoutubeInactive(PHRASE_SERVEUR)).toBe(PHRASE_SERVEUR);
  });

  it('🔴 contre-épreuve : un vrai 502 YouTube garde son chemin, sans bouton du réglage', async () => {
    repondre(502, { error: 'upstream_error', message: 'YouTube playback failed: yt-dlp failed: HTTP Error 403' });
    await api.play(1, { source: 'youtube' as any, source_id: 'x' }).catch((e) => e);
    const n = derniere();
    expect(n?.action?.label).not.toBe(fr[CLE_BOUTON]);
  });
});

describe('#8913 — proposer la lecture YouTube à la connexion du compte', () => {
  it('compte YouTube relié, lecture non activée : la proposition et le bouton qui l’active', () => {
    const activer = vi.fn();
    expect(proposerApresConnexion('youtube', false, activer)).toBe(true);
    const n = derniere();
    expect(n.message).toBe(fr[CLE_PROPOSITION]);
    expect(n.action?.label).toBe(fr[CLE_BOUTON_ACTIVER]);
    n.action!.run();
    expect(activer).toHaveBeenCalledOnce();
  });

  it('rien à proposer si la lecture est déjà activée, ou pour un autre service', () => {
    const avant = get(notifications).length;
    expect(proposerApresConnexion('youtube', true, () => {})).toBe(false);
    expect(proposerApresConnexion('qobuz', false, () => {})).toBe(false);
    expect(get(notifications).length).toBe(avant);
  });

  it('les deux chemins de connexion (Réglages, assistant d’accueil) la proposent', () => {
    const reglages = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
    expect(reglages.match(/void proposerLectureApresConnexion\(name\);/g)?.length).toBe(2);
    expect(reglages).toContain('proposerApresConnexion(name, ytInstalled');
    const accueil = readFileSync('src/components/partages/OnboardingWizard.svelte', 'utf8');
    expect(accueil.match(/proposerLectureYoutube\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(accueil).toContain('api.enableYoutubePlayback()');
  });

  it('l’événement WebSocket au code stable passe par le même message', () => {
    const live = readFileSync('src/lib/v2Live.ts', 'utf8');
    expect(live).toContain('if (estLectureYoutubeInactive(event?.data?.code))');
  });
});

describe('#8913 — les phrases dans les 15 langues', () => {
  it('🔴 chaque clé existe, non vide, et distincte du français hors de fr', () => {
    for (const cle of [CLE_MESSAGE, CLE_BOUTON, CLE_PROPOSITION]) {
      for (const [lang, table] of Object.entries(LANGUES)) {
        const v = table[cle];
        expect(typeof v, `${lang} : ${cle}`).toBe('string');
        expect(v.trim().length, `${lang} : ${cle}`).toBeGreaterThan(0);
        if (lang !== 'fr') expect(v, `${lang} : ${cle}`).not.toBe(LANGUES.fr[cle]);
      }
    }
    for (const [lang, table] of Object.entries(LANGUES)) {
      expect(table[CLE_MESSAGE], lang).toContain('yt-dlp');
      expect(table[CLE_PROPOSITION], lang).toContain('yt-dlp');
    }
  });
});
