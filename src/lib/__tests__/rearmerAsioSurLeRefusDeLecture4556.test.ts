// @vitest-environment jsdom
//
// 🔴 renesenses/tune-server-rust#4556 — LE BOUTON EST LÀ, MAIS PAS SUR LE
// CHEMIN QUE L'UTILISATEUR EMPRUNTE.
//
// Marco Polo appuie sur **Lire**. Le serveur refuse en 409 et dit, depuis la
// 0.9.161, tout ce qu'il faut pour agir :
//
//     { "error": "zone_output_unavailable",
//       "reason": "asio_scan_blocked_after_crash",
//       "can_rearm": true,
//       "rearm_endpoint": "/api/v1/system/audio/asio-warm-scan/rearm" }
//
// `offreDeRearmement` sait lire ce corps, et `signalerErreurServeur` accroche
// le bouton dessus — mais **seulement sur l'échec qui arrive par WebSocket**
// (`zone.playback_error`).
//
// Le 409 du `POST /play`, lui, ne passe jamais par là : `fetchJSON` le traite
// lui-même (`MESSAGES_RENDUS_PAR_LE_SERVEUR`, #4601), pose un toast SANS
// bouton, et marque `dejaAnnonce = true` — ce qui fait sortir tous les
// `signalerEchecLecture` des dix-sept écrans avant même qu'ils regardent.
//
// Résultat : le geste qui lève la panne — effacer le témoin de plantage ASIO —
// reste enterré dans l'écran Diagnostics, qu'un auditeur n'ouvre jamais de
// lui-même. C'est le point 2 du commentaire de reste du 21/09, mot pour mot.
//
// ⛔ Deux promesses ont déjà été manquées sur ce ticket (0.9.86, 0.9.87). Ces
// témoins ne promettent rien : ils clouent que le bouton est atteignable là où
// le refus s'affiche, rien de plus.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import * as api from '../api';
import { locale } from '../i18n';
import { notifications } from '../stores/notifications';
import { MOTIF_ASIO_BLOQUE } from '../rearmementAsio';

const ROUTE = '/api/v1/system/audio/asio-warm-scan/rearm';

/** La phrase que le serveur rend depuis `refus_de_zone_hors_ligne` (#4556). */
const PHRASE_SERVEUR =
  'Tune n’a pas ouvert ASIO au démarrage : un balayage précédent a emporté le serveur, '
  + 'et le témoin « asio-warm.pending » suspend l’énumération. '
  + 'Réarmez le balayage puis redémarrez Tune.';

const REFUS_ASIO = {
  error: 'zone_output_unavailable',
  reason: MOTIF_ASIO_BLOQUE,
  message: PHRASE_SERVEUR,
  can_rearm: true,
  rearm_endpoint: ROUTE,
};

/** Un refus ORDINAIRE : la même famille, sans aucun des trois champs. */
const REFUS_ORDINAIRE = {
  error: 'zone_output_unavailable',
  message: 'La sortie de cette zone n’est plus disponible.',
};

function derniere() {
  const l = get(notifications);
  return l[l.length - 1];
}

function stub(corps: unknown, statut = 409) {
  const appels: Array<{ url: string; methode?: string }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any, init?: any) => {
      appels.push({ url: String(url), methode: init?.method });
      // La route de réarmement répond, elle, un 200.
      if (String(url).includes('asio-warm-scan/rearm')) {
        return new Response(JSON.stringify({ status: 'rearmed', retry: 'next_restart', message: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(corps), {
        status: statut,
        statusText: 'Conflict',
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  return appels;
}

beforeEach(() => {
  for (const n of get(notifications)) notifications.dismiss(n.id);
  locale.set('fr');
});

afterEach(() => {
  vi.unstubAllGlobals();
  locale.set('fr');
});

describe('#4556 — le refus de LECTURE porte le bouton « Réarmer »', () => {
  it('🔴 le 409 du POST /play offre le réarmement', async () => {
    stub(REFUS_ASIO);
    await api.play(7, { track_id: 1 }).catch(() => {});

    const toast = derniere();
    expect(toast?.message, 'la phrase du serveur doit rester intacte').toBe(PHRASE_SERVEUR);
    expect(
      toast?.action,
      'le refus s’affiche SANS le geste qui le lève — le bouton reste enterré dans Diagnostics',
    ).toBeTruthy();
    expect(toast?.action?.label.length).toBeGreaterThan(0);
  });

  it('le bouton poste sur la route QUE LE SERVEUR ANNONCE', async () => {
    const appels = stub(REFUS_ASIO);
    await api.play(7, { track_id: 1 }).catch(() => {});

    derniere()?.action?.run();
    await vi.waitFor(() => {
      expect(appels.some((a) => a.url.includes(ROUTE) && a.methode === 'POST')).toBe(true);
    });
  });

  it('⚠️ le réarmement ne prend effet qu’au PROCHAIN DÉMARRAGE, et le dit', async () => {
    // Le taire ferait croire à une réparation immédiate, et l’utilisateur
    // rappuierait sur Lire pour rien. Le serveur n’ouvre AUCUN pilote dans le
    // processus courant.
    stub(REFUS_ASIO);
    await api.play(7, { track_id: 1 }).catch(() => {});
    derniere()?.action?.run();

    await vi.waitFor(() => {
      const toast = derniere();
      expect(toast?.level).toBe('success');
      expect(toast?.message ?? '').toMatch(/prochain démarrage/i);
    });
  });

  it('l’appelant sait que c’est dit, et n’empile pas un second bandeau', async () => {
    stub(REFUS_ASIO);
    const err: any = await api.play(7, { track_id: 1 }).catch((e) => e);
    expect(err.dejaAnnonce).toBe(true);
  });

  it('🔴 contre-épreuve : un refus ORDINAIRE n’a pas de bouton', async () => {
    // La porte ne s’ouvre que sur les trois champs ensemble. Un refus qui ne
    // les porte pas garde exactement la conduite de #4601.
    stub(REFUS_ORDINAIRE);
    await api.play(7, { track_id: 1 }).catch(() => {});

    const toast = derniere();
    expect(toast?.message).toBe(REFUS_ORDINAIRE.message);
    expect(toast?.action, 'aucune cause ASIO n’est mesurée ici : pas de bouton').toBeFalsy();
  });

  it('🔴 contre-épreuve : `can_rearm: false` ferme la porte', async () => {
    // Le coupe-circuit posé par l’EXPLOITANT (`TUNE_DISABLE_ASIO_SCAN`) n’a
    // délibérément aucun bouton : un geste d’interface ne contourne pas une
    // décision d’exploitation.
    stub({ ...REFUS_ASIO, can_rearm: false });
    await api.play(7, { track_id: 1 }).catch(() => {});
    expect(derniere()?.action).toBeFalsy();
  });
});
