/**
 * #203 — dix-neuf images injoignables sous `www.radiofrance.fr/s3` sur l'écran
 * Podcasts (exploration automatique du 29/07/2026).
 *
 * ## Ce qui n'est PAS corrigeable, et la mesure le dit
 *
 * L'adresse citée par le rapport, le 08/09/2026 :
 *
 *     en direct depuis le navigateur   → 403
 *     à travers le proxy du serveur    → 502
 *
 * Radio France refuse aussi bien le navigateur que le serveur. Aucun correctif
 * client ne fera revenir cette image — et le proxy, qui sauve d'ordinaire les
 * adresses externes, n'y peut rien non plus.
 *
 * ## Ce qui l'est : ce qu'on montre à la place
 *
 * L'écran du client actuel laissait une **icône cassée**. Un `{#if}` ne
 * suffisait pas : l'adresse EXISTE, elle ne répond simplement pas — la
 * condition est vraie et l'image casse. Il faut l'apprendre à l'`onerror`.
 *
 * L'écran v2 n'avait pas ce défaut : il passe par `AlbumArt`, qui gère déjà
 * l'échec de chargement et rend des initiales.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const V2 = readFileSync('src/components/v2/PodcastsV2.svelte', 'utf8');
const ART = readFileSync('src/components/partages/AlbumArt.svelte', 'utf8');

describe('Une pochette de podcast qui ne répond pas', () => {
  it('l’écran v2 s’en remet à `AlbumArt`, qui gère déjà l’échec', () => {
    expect(V2).toContain('<AlbumArt');
    expect(V2).toContain('fallbackInitials');
    expect(ART).toContain('onerror={handleError}');
    expect(ART).toContain('{#if src && !hasError}');
  });
});
