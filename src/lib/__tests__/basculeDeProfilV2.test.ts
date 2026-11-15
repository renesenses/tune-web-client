// @vitest-environment jsdom
/**
 * Changer de profil depuis la nouvelle interface.
 *
 * Chantier multi-profil, lot C. Le profil retenu était déjà honoré — il part en
 * `X-Profile-Id` sur chaque appel depuis #955 — mais **rien dans cette
 * interface ne permettait d'en changer** : `ProfileSelector` n'est monté que
 * par `Sidebar.svelte`, donc par l'interface actuelle.
 *
 * Ce fichier teste pour de vrai la MÉCANIQUE (`lib/basculeDeProfil`), et garde
 * le CÂBLAGE du panneau sur la source — un panneau Svelte ne se monte pas dans
 * un banc en `node`, et le monter à moitié prouverait moins que de lire ce
 * qu'il appelle.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { A_EFFACER, basculeNecessaire, basculerVers } from '../basculeDeProfil';

/* ─────────────────────────── La mécanique ─────────────────────────────── */

describe('basculeNecessaire — quand ça vaut un rechargement', () => {
  it('bascule vers un autre profil', () => {
    expect(basculeNecessaire(1, 2)).toBe(true);
    expect(basculeNecessaire(null, 2)).toBe(true);
  });

  it('🔴 ne bascule PAS vers le profil déjà actif', () => {
    // Un clic sans intention coûterait un rechargement complet et la perte de
    // ce qui est affiché.
    expect(basculeNecessaire(2, 2)).toBe(false);
  });

  it('refuse un identifiant absurde', () => {
    // `parseInt` d'une valeur corrompue, un profil supprimé ailleurs : rien de
    // tout cela ne doit déclencher un rechargement.
    for (const mauvais of [0, -1, NaN, Infinity]) {
      expect(basculeNecessaire(1, mauvais), `valeur : ${mauvais}`).toBe(false);
    }
  });
});

describe('basculerVers — ce qui est réellement écrit', () => {
  let recharges = 0;
  const fenetre = { location: { reload: () => { recharges += 1; } } };

  beforeEach(() => {
    recharges = 0;
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('retient le profil et recharge', () => {
    expect(basculerVers(1, 2, fenetre)).toBe(true);
    expect(localStorage.getItem('tune-profile-id')).toBe('2');
    expect(recharges).toBe(1);
  });

  it('🔴 EFFACE le blob de préférences du profil précédent', () => {
    // `syncPreferencesFromServer` fait gagner le LOCAL sur le serveur dès qu'un
    // blob local existe. Sans cet effacement, le nouveau profil hériterait du
    // thème, des colonnes et de la photo du précédent — et toute la moitié
    // serveur du chantier n'aurait aucun effet visible.
    localStorage.setItem('tune-preferences', '{"v2Theme":"a-quelqu-un-d-autre"}');
    basculerVers(1, 2, fenetre);
    expect(localStorage.getItem('tune-preferences')).toBeNull();
  });

  it('🔴 ne touche PAS au choix d’interface', () => {
    // `tune-interface` appartient à l'APPAREIL, pas à la personne : la tablette
    // du salon reste sur l'interface qu'on lui a donnée, quel que soit celui
    // qui l'utilise.
    localStorage.setItem('tune-interface', 'future');
    basculerVers(1, 2, fenetre);
    expect(localStorage.getItem('tune-interface')).toBe('future');
    expect(A_EFFACER).not.toContain('tune-interface');
    expect(A_EFFACER).not.toContain('tune-profile-id');
  });

  it('un clic sur le profil actif ne recharge rien et n’efface rien', () => {
    localStorage.setItem('tune-preferences', '{"v2Theme":"le-mien"}');
    expect(basculerVers(2, 2, fenetre)).toBe(false);
    expect(recharges).toBe(0);
    expect(localStorage.getItem('tune-preferences')).toBe('{"v2Theme":"le-mien"}');
  });

  it('recharge même si le stockage refuse', () => {
    // Navigation privée cloisonnée : l'écriture lève. Le profil ne sera pas
    // retenu, mais l'écran ne doit pas rester menteur — il affiche encore les
    // données de quelqu'un d'autre.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('stockage refusé');
    });
    expect(() => basculerVers(1, 2, fenetre)).not.toThrow();
    expect(recharges).toBe(1);
  });
});

/* ─────────────────────────── Le câblage ───────────────────────────────── */

// Levente, 15/11/2026 : la liste a quitté le menu de l'avatar. La bascule vit
// dans « Gérer les profils » (`ProfilsV2`), seul chemin restant.
const ECRAN = resolve(process.cwd(), 'src/components/v2/ProfilsV2.svelte');
const MENU = resolve(process.cwd(), 'src/components/v2/AvatarMenu.svelte');
/** La source sans ce qu'on a écrit pour l'expliquer. Bloc reconnu en DÉBUT de
 *  ligne seulement : le motif large ouvre un faux commentaire sur le `/*` d'une
 *  chaîne et mange tout ce qui suit. */
const sansCommentaires = (f: string) =>
  readFileSync(f, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*\*.*$/gm, '');
const ecran = () => sansCommentaires(ECRAN);

describe('« Gérer les profils » porte la bascule', () => {
  it('🔴 il appelle la mécanique, pas `selectProfile`', () => {
    // `selectProfile` ne fait que poser l'identifiant : rien de ce qui est déjà
    // chargé ne bouge, et l'écran continuerait d'afficher les favoris et le
    // thème de la personne précédente.
    const src = ecran();
    expect(src).toContain("import { basculerVers, basculeNecessaire } from '../../lib/basculeDeProfil'");
    expect(src).toContain('basculerVers(get(currentProfileId), id)');
    expect(src).toContain('onclick={() => basculer(p.id)}');
    expect(
      /selectProfile\s*\(/.test(src),
      'l’écran appelle `selectProfile` : la bascule serait muette',
    ).toBe(false);
  });

  it('il affiche le nom, pas l’adresse de connexion', () => {
    const src = ecran();
    expect(src).toContain('p.display_name?.trim() || p.name');
  });

  it('le profil actif est marqué, pour la vue ET pour l’assistance vocale', () => {
    expect(ecran()).toContain("aria-current={p.id === $currentProfileId ? 'true' : undefined}");
  });

  it('le rechargement est ANNONCÉ', () => {
    expect(ecran()).toContain("$t('profiles.switchHint' as any)");
  });

  it('le menu de l’avatar ne bascule plus lui-même, mais mène à l’écran', () => {
    const menu = sansCommentaires(MENU);
    expect(menu).not.toContain('basculerVers');
    expect(menu).toContain("v2SettingsTarget.set({ tab: 'general', section: 'profiles' })");
  });
});
