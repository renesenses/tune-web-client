// @vitest-environment jsdom
//
// #4556 — LE REFUS QUI ACCUSE LE MATÉRIEL, ET LE BOUTON QUI LE LÈVE.
//
// Le DAC de Marco Polo était refusé alors que Windows le voyait. Après un
// plantage de pilote ASIO, Tune pose un témoin SUR DISQUE et n'énumère plus
// ASIO au démarrage suivant : il retombe en WASAPI, ne trouve pas la zone, et
// annonce « la sortie n'est plus disponible » — **en accusant le matériel
// alors qu'il sait qu'il n'a pas regardé**. Le témoin étant un fichier,
// redémarrer n'y change rien ; seul un réarmement l'efface, et il était
// enterré dans l'écran Diagnostics.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { offreDeRearmement, MOTIF_ASIO_BLOQUE } from '../rearmementAsio';
import { notifications } from '../stores/notifications';
import { signalerErreurServeur } from '../echecLecture';
import { locale } from '../i18n';

const ROUTE = '/api/v1/system/audio/asio-warm-scan/rearm';

/** L'événement `zone.playback_error` tel que le serveur l'émet (#4556). */
const BLOQUE = {
  message: 'La sortie de cette zone est introuvable : le balayage ASIO est bloqué.',
  error: 'zone_output_unavailable',
  code: 'zone_output_unavailable',
  reason: MOTIF_ASIO_BLOQUE,
  can_rearm: true,
  rearm_endpoint: ROUTE,
};

const derniere = () => { const l = get(notifications); return l[l.length - 1]; };

beforeEach(() => {
  for (const n of get(notifications)) notifications.dismiss(n.id);
  locale.set('fr');
});
afterEach(() => vi.unstubAllGlobals());

describe('la DÉCISION : cet échec offre-t-il un réarmement ?', () => {
  it('🔴 oui quand les trois champs sont là, et la route vient du SERVEUR', () => {
    expect(offreDeRearmement(BLOQUE)).toEqual({ route: ROUTE });
  });

  it('🔴 on teste `reason`, PAS `code`', () => {
    // `code` porte l'identifiant de FAMILLE, partagé avec le refus ordinaire ;
    // le motif précis vit dans `reason`. Tester `code` proposerait le bouton
    // sur tout refus de sortie, ASIO ou non.
    expect(offreDeRearmement({ ...BLOQUE, reason: undefined })).toBeNull();
    expect(offreDeRearmement({ code: MOTIF_ASIO_BLOQUE, can_rearm: true, rearm_endpoint: ROUTE } as any))
      .toBeNull();
  });

  it('un refus ORDINAIRE ne porte pas ces champs, donc pas de bouton', () => {
    expect(offreDeRearmement({ code: 'zone_output_unavailable' } as any)).toBeNull();
    expect(offreDeRearmement(null)).toBeNull();
    expect(offreDeRearmement(undefined)).toBeNull();
  });

  it('🔴 le coupe-circuit de l’EXPLOITANT n’a JAMAIS de bouton', () => {
    // Un geste d'interface ne doit pas contourner une décision d'exploitation.
    expect(offreDeRearmement({ ...BLOQUE, reason: 'asio_scan_disabled_by_env' })).toBeNull();
  });

  it('`can_rearm: false` et une route vide ferment la porte', () => {
    expect(offreDeRearmement({ ...BLOQUE, can_rearm: false })).toBeNull();
    expect(offreDeRearmement({ ...BLOQUE, rearm_endpoint: '   ' })).toBeNull();
    expect(offreDeRearmement({ ...BLOQUE, rearm_endpoint: undefined })).toBeNull();
  });
});

describe('le GESTE : ce que voit l’utilisateur', () => {
  it('🔴 un bandeau AVEC bouton, et la phrase du serveur', () => {
    signalerErreurServeur(BLOQUE as any);
    const n = derniere();
    expect(n?.message).toContain('balayage ASIO est bloqué');
    expect(n?.action, 'aucun bouton : le réarmement reste enterré dans Diagnostics').toBeTruthy();
    expect(n?.action?.label).toBe('Réarmer le balayage ASIO');
  });

  it('un refus ordinaire garde le bandeau SANS bouton', () => {
    signalerErreurServeur({ message: 'La sortie de cette zone est introuvable.' } as any);
    expect(derniere()?.action).toBeUndefined();
  });

  it('🔴 le clic poste sur la route ANNONCÉE, et dit que ça vaut au prochain démarrage', async () => {
    // La route vient du serveur : notre propre triage l'avait écrite FAUSSE,
    // il y manquait le segment `audio`.
    const appels: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      appels.push(`${init?.method ?? 'GET'} ${url}`);
      return new Response(JSON.stringify({ status: 'rearmed', retry: 'next_restart', message: 'ok' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }));
    signalerErreurServeur(BLOQUE as any);
    derniere()!.action!.run();
    await new Promise((r) => setTimeout(r, 30));
    expect(appels.some((a) => a === `POST ${ROUTE}`), `appels : ${appels.join(', ')}`).toBe(true);
    expect(derniere()?.message).toContain('prochain démarrage');
  });

  it('🔴 un refus ADMIN retombe sur la phrase seule, sans inventer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    })));
    signalerErreurServeur(BLOQUE as any);
    derniere()!.action!.run();
    await new Promise((r) => setTimeout(r, 30));
    const n = derniere();
    expect(n?.level).toBe('error');
    expect(n?.message).toContain('balayage ASIO est bloqué');
    expect(n?.message).not.toContain('prochain démarrage');
  });
});
