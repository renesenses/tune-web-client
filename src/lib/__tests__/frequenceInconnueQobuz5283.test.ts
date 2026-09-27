// @vitest-environment jsdom
//
// #5283 — UNE PISTE QOBUZ SANS FRÉQUENCE CONNUE.
//
// Le serveur (tune-server-rust, lot `batch/qobuz-frequence-nulle-20260927`)
// refuse désormais la lecture quand Qobuz n'annonce aucune fréquence
// d'échantillonnage ET que ni l'en-tête du flux ni le catalogue ne la donnent.
// Il rend un 422 nommé : `{"error": "streaming_sample_rate_unknown",
// "code": "streaming_sample_rate_unknown", "message": …}`.
//
// Avant, ce refus arrivait en 502 `upstream_error`, sa phrase technique en
// français brut dans un bandeau « Server error: … », quelle que soit la
// langue choisie. Le code passe maintenant par `PLAY_ERROR_KEYS` — le chemin
// déjà suivi par `file_not_found` — et l'écran dit la phrase TRADUITE.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import * as api from '../api';
import { locale } from '../i18n';
import { notifications } from '../stores/notifications';
import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';

const CLE = 'playback.errorSampleRateUnknown';

/** Le refus exact de `play_error_response` pour ce code. */
const REFUS = {
  error: 'streaming_sample_rate_unknown',
  code: 'streaming_sample_rate_unknown',
  message: "qobuz n'a annoncé aucune fréquence d'échantillonnage pour cette piste, "
    + "et ni l'en-tête du flux ni le catalogue ne la donnent",
};

function derniere(): string | undefined {
  const l = get(notifications);
  return l[l.length - 1]?.message;
}

function stub(corps: unknown, statut = 422) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(corps), {
    status: statut, statusText: 'Unprocessable Entity', headers: { 'Content-Type': 'application/json' },
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

describe('#5283 — `streaming_sample_rate_unknown` s’affiche traduit', () => {
  it('🔴 en français, la phrase de la clé — pas le texte du serveur', async () => {
    stub(REFUS);
    const err: any = await api.play(7, { track_id: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((fr as Record<string, string>)[CLE]).toBeTruthy();
    expect(derniere(), 'le refus est resté muet ou brut').toBe((fr as Record<string, string>)[CLE]);
    expect(derniere()).toContain('Qobuz n\'a pas indiqué la fréquence');
  });

  it('dans la langue de l’interface (anglais, allemand)', async () => {
    locale.set('en');
    stub(REFUS);
    await api.play(7, { track_id: 1 }).catch(() => {});
    expect(derniere()).toBe((en as Record<string, string>)[CLE]);

    for (const n of get(notifications)) notifications.dismiss(n.id);
    locale.set('de');
    stub(REFUS);
    await api.play(7, { track_id: 1 }).catch(() => {});
    expect(derniere()).toBe((de as Record<string, string>)[CLE]);
  });

  it('l’erreur porte la phrase traduite et se dit déjà annoncée', async () => {
    // Les écrans à bandeau (`messageEchecLecture`, StreamingV2) lisent
    // `err.message` : ils doivent dire la même chose que le toast.
    stub(REFUS);
    const err: any = await api.play(7, { track_id: 1 }).catch((e) => e);
    expect(err.dejaAnnonce, 'un second toast va s’empiler').toBe(true);
    expect(err.message).toBe((fr as Record<string, string>)[CLE]);
  });

  it('contre-épreuve : un autre code du même statut ne prend pas cette phrase', async () => {
    stub({ error: 'quelque_chose_dautre', message: 'fuite technique' });
    await api.play(7, { track_id: 1 }).catch(() => {});
    expect(derniere()).not.toBe((fr as Record<string, string>)[CLE]);
  });
});
