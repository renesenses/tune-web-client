// @vitest-environment jsdom
/**
 * tune-web-client#2417 — une erreur du serveur ne s'affiche plus BRUTE.
 *
 * Testeur Alex, 26/10/2026, interface en anglais : « Server error: Tune
 * démarre : configuration », « (delai) ». Le client recopiait à l'écran le
 * texte du serveur, composé en français en dur. Désormais :
 *
 *  - le code traduit par le client (`erreursServeur.<code>`) ;
 *  - ou la phrase que le serveur dit avoir traduite (`message_key`,
 *    tune-server-rust#7077) ;
 *  - sinon le message générique traduit ;
 *  - le texte brut, lui, va au « Détails » replié du bandeau.
 *
 * Contre-épreuve : remettre dans `apiError` (api.ts) la lecture d'avant
 * (`if (body.detail) detail = body.detail; else if (body.message) …; else
 * if (typeof body.error === 'string' …) detail = body.error;`) fait rougir
 * « un 500 en français … » : le message vaut « réglage non enregistré … ».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { locale, t } from '../i18n';
import { notifications } from '../stores/notifications';
import * as api from '../api';
import { signalerErreurServeur } from '../echecLecture';
import { lireMessageServeur } from '../messageServeur';
import ToastContainer from '../../components/partages/ToastContainer.svelte';

const FRANCAIS = 'réglage non enregistré : disque plein';

function repond(status: number, corps: unknown) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(typeof corps === 'string' ? corps : JSON.stringify(corps), {
      status,
      headers: { 'content-type': typeof corps === 'string' ? 'text/plain' : 'application/json' },
    }),
  );
}

const vider = () => { for (const n of get(notifications)) notifications.dismiss(n.id); };

beforeEach(() => { locale.set('en'); vider(); });
afterEach(() => { vi.restoreAllMocks(); vider(); locale.set('fr'); });

describe('#2417 — un refus serveur', () => {
  it('🔴 un 500 en français : message générique traduit, le brut au détail', async () => {
    repond(500, { error: FRANCAIS });
    const err: any = await api.getZones().catch((e) => e);
    const generique = get(t)('erreursServeur.generique');
    expect(err.message, 'du français brut à l’écran d’un anglophone').toBe(generique);
    expect(err.detail).toContain(FRANCAIS);

    const bandeau = get(notifications).at(-1);
    expect(bandeau?.message).toBe(generique);
    expect(bandeau?.message).not.toContain('Server error');
    expect(bandeau?.detail).toContain(FRANCAIS);
  });

  it('un corps text/plain suit la même règle', async () => {
    repond(500, 'Tune démarre : configuration');
    const err: any = await api.getZones().catch((e) => e);
    expect(err.message).toBe(get(t)('erreursServeur.generique'));
    expect(err.detail).toContain('Tune démarre : configuration');
  });

  it('la phrase que le serveur a traduite (`message_key`) s’affiche telle quelle', () => {
    const lu = lireMessageServeur({
      error: 'queue_empty', code: 'queue_empty',
      message: 'The queue is empty: there is nothing to save.',
      message_key: 'api.playback.queueEmptyNothingToSave',
    });
    expect(lu.message).toBe('The queue is empty: there is nothing to save.');
    expect(lu.code).toBe('queue_empty');
  });

  it('sans `message_key`, la même phrase n’est pas crue', () => {
    const lu = lireMessageServeur({ error: 'queue_empty', message: 'La file est vide.' });
    expect(lu.message).toBe(get(t)('erreursServeur.generique'));
    expect(lu.detail).toContain('La file est vide.');
  });

  it('un code que le client connaît se traduit dans CHAQUE langue', () => {
    const vus = new Set<string>();
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu', 'vi', 'el', 'nb', 'pl'] as const) {
      locale.set(l);
      const lu = lireMessageServeur({ code: 'track_decode_failed', error: 'Impossible de décoder la piste' });
      expect(lu.message, l).not.toBe('erreursServeur.track_decode_failed');
      vus.add(lu.message);
    }
    expect(vus.size).toBe(15);
  });
});

describe('#2417 — `zone.playback_error`', () => {
  it('le code `track_decode_failed` se dit dans la langue de l’interface', () => {
    signalerErreurServeur({ code: 'track_decode_failed', error: 'The track could not be decoded.', cause: 'symphonia: eof' } as any);
    const n = get(notifications).at(-1);
    expect(n?.message).toBe(get(t)('erreursServeur.track_decode_failed'));
    expect(n?.detail).toContain('symphonia: eof');
  });

  it('un texte non traduit : l’échec générique de lecture, le texte au détail', () => {
    signalerErreurServeur({ error: 'Endpoint WASAPI demandé introuvable' });
    const n = get(notifications).at(-1);
    expect(n?.message).toBe(get(t)('library.playbackError'));
    expect(n?.detail).toContain('Endpoint WASAPI demandé introuvable');
  });
});

describe('#2417 — le bandeau', () => {
  it('range le détail dans un « Détails » replié', () => {
    const cible = document.createElement('div');
    document.body.appendChild(cible);
    const c = mount(ToastContainer, { target: cible });
    notifications.error('Message', 0, FRANCAIS);
    flushSync();
    const details = cible.querySelector('details.toast-detail');
    expect(details, 'aucun « Détails »').not.toBeNull();
    expect((details as HTMLDetailsElement).open, 'le détail doit être replié').toBe(false);
    expect(details!.querySelector('summary')!.textContent).toBe(get(t)('erreursServeur.details'));
    expect(details!.textContent).toContain(FRANCAIS);
    unmount(c);
    cible.remove();
  });
});
