// @vitest-environment jsdom
//
// #4601 / #4580 — LE REFUS QUI NE DISAIT RIEN, ET LA ZONE SUPPRIMÉE POUR RIEN.
//
// Deux testeurs ont **supprimé et recréé une zone** pour la faire
// refonctionner. Rien ne les en dissuadait : le serveur refusait la lecture
// par un 409 `zone_output_unavailable`, et le client le jetait **sans un
// mot** — ce code ne figure pas dans `PLAY_ERROR_KEYS`, la seule table que
// `fetchJSON` consultait pour parler sur un 4xx.
//
// Or supprimer la zone est exactement le geste à éviter : elle se rattache
// seule dès que l'appareil réapparaît, et la recréer perd son volume, sa file
// et ses réglages.
//
// 🔴 UNE CLÉ i18n STATIQUE N'AURAIT PAS SUFFI. Le serveur nomme l'appareil et
// la cause probable — un renderer DLNA qui a changé d'identifiant, un bail
// DHCP renouvelé. Aucune constante du client ne connaît ces faits. On affiche
// donc SA phrase, qu'il rend déjà dans la langue de l'interface.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import * as api from '../api';
import { locale } from '../i18n';
import { notifications } from '../stores/notifications';

/** Le refus exact du contrat serveur (#4632). */
const PHRASE_SERVEUR =
  'La sortie « Salon (Eversolo A8) » de cette zone est introuvable sur le réseau. '
  + 'Elle a probablement changé d’identifiant en redémarrant, ou d’adresse après un renouvellement DHCP. '
  + 'Inutile de supprimer la zone puis de la recréer : elle se rattache seule dès que l’appareil '
  + 'réapparaît, et la recréer perdrait son volume, sa file et ses réglages.';

const REFUS = { error: 'zone_output_unavailable', message: PHRASE_SERVEUR };

function derniere(): string | undefined {
  const l = get(notifications);
  return l[l.length - 1]?.message;
}

function stub(corps: unknown, statut = 409) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(corps), {
    status: statut, statusText: 'Conflict', headers: { 'Content-Type': 'application/json' },
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

describe('#4601 — le 409 `zone_output_unavailable` PARLE', () => {
  it('🔴 la phrase du serveur est posée TELLE QUELLE', async () => {
    stub(REFUS);
    const err: any = await api.play(7, { track_id: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(derniere(), 'le refus est resté muet — c’est le défaut de #4601').toBe(PHRASE_SERVEUR);
  });

  it('elle dit de NE PAS supprimer la zone', async () => {
    // Le cœur du sujet : ce qui a coûté deux zones à deux testeurs.
    stub(REFUS);
    await api.play(7, { track_id: 1 }).catch(() => {});
    expect(derniere()).toContain('Inutile de supprimer la zone');
  });

  it('l’appelant sait que c’est dit, et ne double pas le message', async () => {
    stub(REFUS);
    const err: any = await api.play(7, { track_id: 1 }).catch((e) => e);
    expect(err.dejaAnnonce, 'un écran à bandeau va en empiler un second').toBe(true);
  });

  it('🔴 rien n’est inventé quand le serveur se tait', async () => {
    // Un corps sans phrase ne doit pas produire un toast vide : mieux vaut le
    // silence d'avant qu'une bulle qui ne dit rien.
    stub({ error: 'zone_output_unavailable', message: '   ' });
    await api.play(7, { track_id: 1 }).catch(() => {});
    expect(derniere()).toBeUndefined();
  });

  it('un code INCONNU reste muet — la porte n’est pas grande ouverte', async () => {
    // Contre-épreuve du périmètre : on n'affiche pas `message` pour tout 4xx,
    // seulement pour les codes dont le serveur rend une phrase prête.
    stub({ error: 'quelque_chose_dautre', message: 'fuite technique' });
    await api.play(7, { track_id: 1 }).catch(() => {});
    expect(derniere()).toBeUndefined();
  });

  it('les codes à clé i18n gardent leur chemin', async () => {
    stub({ error: 'zone_no_output_device', message: 'phrase serveur ignorée ici' }, 400);
    await api.play(7, { track_id: 1 }).catch(() => {});
    const m = derniere() ?? '';
    expect(m).not.toBe('phrase serveur ignorée ici');
    expect(m.length, 'la clé i18n ne rend rien').toBeGreaterThan(0);
  });
});
