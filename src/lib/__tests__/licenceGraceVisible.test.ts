import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import { licenseState, offlineGrace } from '../stores/license';
import * as locales from '../locales';

/**
 * #1999 — la grâce hors ligne doit se VOIR.
 *
 * Le serveur accorde 14 jours de tolérance quand la vérification de licence ne
 * peut pas aboutir (`tune-core/src/license.rs`, `GRACE_PERIOD_DAYS`). Didier
 * (fil forum 1491) posait la question avant d'acheter : rien à l'écran n'y
 * répondait, et le jour de la retombée les fonctions Premium disparaissaient
 * sans un mot.
 *
 * Ces tests fixent trois choses : ce que le magasin expose, quand l'interface
 * doit se taire, et que le message est bien traduit dans les onze langues.
 */

const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu'] as const;

const CLES = [
  'settings.licenseGraceTitle',
  'settings.licenseGraceBody',
  'settings.licenseGraceLapsedTitle',
  'settings.licenseGraceLapsedBody',
  'settings.licenseGraceNeverTitle',
  'settings.licenseGraceNeverBody',
  'settings.licenseGraceDayOne',
  'settings.licenseGraceDayOther',
  'settings.licenseOfflineRule',
] as const;

function poser(grace: unknown) {
  licenseState.update((s) => ({ ...s, loaded: true, offlineGrace: grace as never }));
}

describe('grâce hors ligne — ce que le magasin annonce', () => {
  it('se tait quand la vérification est fraîche', () => {
    // Un serveur qui a manqué un battement va très bien. Afficher une bannière
    // là serait du bruit — et transformerait une tolérance en inquiétude.
    poser({
      phase: 'ok',
      source: 'key',
      since: '2026-08-27T10:00:00Z',
      until: '2026-09-10T10:00:00Z',
      days_remaining: 14,
      total_days: 14,
      days_since_validation: 0,
    });
    expect(get(offlineGrace)).toBeNull();
  });

  it('annonce la fenêtre en cours, avec ses deux bornes', () => {
    poser({
      phase: 'grace',
      source: 'key',
      since: '2026-08-15T10:00:00Z',
      until: '2026-08-29T10:00:00Z',
      days_remaining: 3,
      total_days: 14,
      days_since_validation: 11,
    });
    const g = get(offlineGrace);
    expect(g?.phase).toBe('grace');
    expect(g?.since).toBe('2026-08-15T10:00:00Z');
    expect(g?.until).toBe('2026-08-29T10:00:00Z');
    expect(g?.days_remaining).toBe(3);
    expect(g?.total_days).toBe(14);
  });

  it('annonce la retombée une fois la fenêtre écoulée', () => {
    poser({
      phase: 'expired',
      source: 'account',
      since: '2026-08-01T10:00:00Z',
      until: '2026-08-15T10:00:00Z',
      days_remaining: 0,
      total_days: 14,
      days_since_validation: 27,
    });
    expect(get(offlineGrace)?.phase).toBe('expired');
  });

  it('reste muet face à un serveur qui ne connaît pas le champ', () => {
    // Compatibilité descendante : sur une version antérieure du serveur le
    // champ est absent. L'interface doit se taire, pas afficher un compte à
    // rebours inventé.
    poser(null);
    expect(get(offlineGrace)).toBeNull();
  });
});

describe('grâce hors ligne — le message', () => {
  const dicts = locales as unknown as Record<string, Record<string, string>>;

  it('est traduit dans les onze langues', () => {
    for (const langue of LANGUES) {
      const dict = dicts[langue];
      expect(dict, `dictionnaire ${langue} absent`).toBeTruthy();
      for (const cle of CLES) {
        expect(dict[cle], `${langue} → ${cle}`).toBeTruthy();
      }
    }
  });

  it('garde les substitutions attendues dans chaque langue', () => {
    // Une traduction qui perd `{until}` affiche une phrase tronquée : le
    // testeur lit « actives jusqu'au . » et n'apprend rien.
    for (const langue of LANGUES) {
      const dict = dicts[langue];
      for (const jeton of ['{since}', '{until}', '{remaining}']) {
        expect(
          dict['settings.licenseGraceBody'].includes(jeton),
          `${langue} : ${jeton} manquant dans licenseGraceBody`,
        ).toBe(true);
      }
      for (const jeton of ['{since}', '{days}']) {
        expect(
          dict['settings.licenseGraceLapsedBody'].includes(jeton),
          `${langue} : ${jeton} manquant dans licenseGraceLapsedBody`,
        ).toBe(true);
      }
      expect(dict['settings.licenseOfflineRule'].includes('{days}')).toBe(true);
      expect(dict['settings.licenseGraceDayOther'].includes('{days}')).toBe(true);
    }
  });

  it("n'écrit jamais la durée en dur : le chiffre vient du serveur", () => {
    // La grâce est passée de 30 à 14 jours une fois déjà. Un « 14 » recopié
    // dans une traduction survivrait au prochain changement et mentirait.
    for (const langue of LANGUES) {
      const dict = dicts[langue];
      for (const cle of ['settings.licenseOfflineRule', 'settings.licenseGraceLapsedBody']) {
        expect(/\b14\b/.test(dict[cle]), `${langue} → ${cle} contient un 14 en dur`).toBe(false);
      }
    }
  });

  it('reste factuel : aucune formule alarmiste sur la fenêtre en cours', () => {
    // La tolérance existe justement pour couvrir une coupure réseau. Le
    // message qui l'annonce ne doit pas se lire comme une panne.
    const fr = dicts.fr;
    expect(fr['settings.licenseGraceTitle']).toBe('Hors ligne — votre Premium reste actif');
    expect(fr['settings.licenseGraceBody']).toContain('restent actives');
    expect(fr['settings.licenseGraceBody']).toContain("Vous n'avez rien à faire");
    for (const mot of ['erreur', 'échec', 'invalide', 'attention', 'urgent']) {
      expect(fr['settings.licenseGraceTitle'].toLowerCase()).not.toContain(mot);
    }
  });
});

describe('grâce hors ligne — la vue', () => {
  const vue = readFileSync(
    resolve(__dirname, '../../components/SettingsView.svelte'),
    'utf8',
  );

  it('affiche la bannière et la règle chiffrée', () => {
    expect(vue).toContain('license-grace-banner');
    expect(vue).toContain("settings.licenseGraceTitle");
    expect(vue).toContain("settings.licenseOfflineRule");
  });

  it('réserve le ton d’avertissement à la fenêtre réellement écoulée', () => {
    // `lapsed` ne doit s'appliquer que sur `expired` : peindre en orange un
    // serveur encore parfaitement Premium serait un contresens.
    expect(vue).toContain("class:lapsed={$offlineGrace.phase === 'expired'}");
  });

  it("n'affiche aucune donnée de licence dans la bannière", () => {
    // Le bloc de grâce ne porte que des dates et des compteurs ; la clé n'a
    // rien à y faire.
    const debut = vue.indexOf('license-grace-banner');
    const fin = vue.indexOf('license-grace-rule');
    expect(debut).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(debut);
    const bloc = vue.slice(debut, fin);
    expect(bloc).not.toContain('licenseKey');
    expect(bloc).not.toContain('hardwareFingerprint');
  });
});
