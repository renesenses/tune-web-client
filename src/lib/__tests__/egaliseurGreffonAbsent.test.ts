// Le bouton EQ n'a de sens que si le greffon est INSTALLÉ.
//
// Bertrand, 20/09/2026, capture de Lecture en cours à l'appui : « Je n'ai pas
// d'Equaliseur. Pourquoi cette mention de EQ ici ? ».
//
// Depuis la v0.9.156, l'égaliseur est un greffon FACULTATIF : la migration ne
// pose plus `plugin_equalizer_installed`, et le réglage ne passe à `true`
// qu'après un `POST /plugins/equalizer/install` explicite
// (`tune-core/src/audio/premium_plugins.rs`). Or le client ne posait la
// question NULLE PART — zéro occurrence de `plugin_equalizer_installed` dans
// tout le dépôt web — et offrait le bouton à tout le monde.
import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  egaliseurReglable,
  greffonEgaliseur,
  rafraichirGreffonEgaliseur,
} from '../stores/egaliseur';
import * as api from '../api';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

beforeEach(() => {
  greffonEgaliseur.set(null);
  vi.restoreAllMocks();
});

describe('quand le bouton EQ a-t-il un sens ?', () => {
  it('🔴 greffon absent du serveur : PAS de bouton', () => {
    greffonEgaliseur.set('absent');
    expect(get(egaliseurReglable)).toBe(false);
  });

  it('🔴 greffon connu mais NON installé : pas de bouton non plus', () => {
    // C'est le cas de Bertrand : le catalogue le propose, il ne l'a pas pris.
    greffonEgaliseur.set({ name: 'equalizer', installed: false });
    expect(get(egaliseurReglable)).toBe(false);
  });

  it('installé : le bouton revient', () => {
    greffonEgaliseur.set({ name: 'equalizer', installed: true });
    expect(get(egaliseurReglable)).toBe(true);
  });

  it('🔴 installé mais serveur pas encore redémarré : le bouton RESTE', () => {
    // `enabled` dit que les routes sont montées ; `installed` dit que
    // l'utilisateur le possède. Masquer ici lui ferait croire que son
    // installation a échoué.
    greffonEgaliseur.set({ name: 'equalizer', installed: true, enabled: false });
    expect(get(egaliseurReglable)).toBe(true);
  });

  it('🔴 INDÉTERMINÉ vaut OUI — on ne retire rien à un serveur d’hier', () => {
    // L'inverse du choix fait pour Concerts, et c'est délibéré : un serveur
    // antérieur à la v0.9.156 n'expose pas cet état. Masquer là retirerait
    // une fonction qui marche, à quelqu'un qui s'en sert.
    expect(get(egaliseurReglable)).toBe(true);
  });
});

describe('interroger le serveur', () => {
  it('trouve le greffon et le range', async () => {
    vi.spyOn(api, 'getInstalledPlugins').mockResolvedValue(
      [{ name: 'equalizer', installed: true }] as any,
    );
    await rafraichirGreffonEgaliseur();
    expect(get(egaliseurReglable)).toBe(true);
  });

  it('🔴 une liste SANS égaliseur vaut « absent »', async () => {
    vi.spyOn(api, 'getInstalledPlugins').mockResolvedValue(
      [{ name: 'concerts', installed: true }] as any,
    );
    await rafraichirGreffonEgaliseur();
    expect(get(greffonEgaliseur)).toBe('absent');
    expect(get(egaliseurReglable)).toBe(false);
  });

  it('🔴 une erreur réseau laisse l’INDÉTERMINÉ, donc le bouton', async () => {
    vi.spyOn(api, 'getInstalledPlugins').mockRejectedValue(new Error('hors ligne'));
    await rafraichirGreffonEgaliseur();
    expect(get(greffonEgaliseur)).toBeNull();
    expect(get(egaliseurReglable)).toBe(true);
  });
});

describe('l’écran le fait vraiment', () => {
  const np = lire('src/components/partages/NowPlaying.svelte');
  const eq = lire('src/components/v2/EqualizerV2.svelte');
  const barre = lire('src/components/v2/Sidebar.svelte');

  it('🔴 le bouton EQ est sous condition', () => {
    expect(np).toContain('{#if $egaliseurReglable}');
    const i = np.indexOf('{#if $egaliseurReglable}');
    // La condition enveloppe BIEN le bouton EQ, et pas autre chose.
    expect(np.slice(i, i + 700)).toMatch(/class:active=\{showEq\}/);
  });

  it('l’écran interroge le serveur au montage', () => {
    expect(np).toContain('rafraichirGreffonEgaliseur()');
  });

  it('🔴 le bouton REVIENT dès l’installation, sans rechargement', () => {
    // Sans ce rafraîchissement, on installerait l'égaliseur sans le voir
    // apparaître : il ne reviendrait qu'au prochain chargement de la page.
    const i = eq.indexOf('async function installerGreffon');
    expect(eq.slice(i, eq.indexOf('}', eq.indexOf('finally', i))))
      .toContain('rafraichirGreffonEgaliseur()');
  });

  it('🔴 l’entrée de la BARRE reste, elle : c’est par là qu’on installe', () => {
    // Doctrine de `stores/concerts` : on ne masque que ce sur quoi
    // l'utilisateur ne peut rien. L'écran Égaliseur, lui, PROPOSE
    // l'installation — le masquer fermerait la seule porte.
    expect(barre).toContain("view: 'equalizer'");
    expect(barre).not.toContain('egaliseurReglable');
  });
});
