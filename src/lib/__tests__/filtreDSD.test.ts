/**
 * Le filtre DSD, et le multiple annoncé.
 *
 * Bertrand, 09/09/2026 : « le filtre DSD oublie cet album », avec la copie
 * d'écran de « In My World (Remastered) » — badge « LOCAL DSF 5644.8/1 » sur
 * l'album, et puce « **CD** DSF 5644.8/1 » sur chacune de ses pistes.
 *
 * ## Ce que la mesure a donné
 *
 * `GET /library/albums?limit=5000` sur le .18, 4 255 albums :
 *
 *     dsf   47 albums     ← ignorés
 *     dsd    2 albums     ← les seuls reconnus
 *
 * La règle testait `fmt === 'dsd' || fmt.startsWith('dsd')`. Or « dsd » n'est
 * presque jamais ce que le scanner écrit : les fichiers DSD s'appellent `.dsf`
 * (Sony) ou `.dff` (Philips). `types.ts` déclarait pourtant les trois depuis
 * toujours. 47 albums sur 49 — 96 % — passaient à côté.
 *
 * Et ils ne tombaient pas n'importe où : un DSF porte `bit_depth: 1` et
 * `sample_rate: 2 822 400`. La fréquence le faisait passer pour sans perte, la
 * profondeur de 1 bit échouait à `bd > 16`… et il retombait sur **CD**.
 *
 * ## Le second défaut, trouvé en mesurant le premier
 *
 * Fréquences réelles des 49 albums DSD :
 *
 *      2 822 400  ×39   DSD64
 *      5 644 800  ×2    DSD128
 *     11 289 600  ×6    DSD256    ← annoncés « DSD128 »
 *     22 579 200  ×1    DSD512    ← annoncé « DSD128 »
 *
 * Le libellé valait `sample_rate >= 5000000 ? 'DSD128' : 'DSD64'` : deux cases
 * pour cinq multiples. Sept albums portaient un multiple faux, et toujours par
 * DÉFAUT — un DSD512 annoncé en DSD128 fait croire à quatre fois moins.
 *
 * ## Une régression contre le client actuel
 *
 * `LibraryView.svelte` (v1) testait déjà `dsf`, `dff`, et jusqu'à l'extension
 * du fichier. Le v2 a réécrit la règle en la rétrécissant.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { estDuDSD, multipleDSD, getQualityTier } from '../utils';

/** Les albums DSD tels que le .18 les rend, mesurés le 09/09/2026. */
const MESURE = [
  { format: 'dsf', sample_rate: 2822400, bit_depth: 1, titre: 'Getz / Gilberto' },
  { format: 'dsf', sample_rate: 2822400, bit_depth: 1, titre: 'Dark Side Of The Moon' },
  { format: 'dsd', sample_rate: 2822400, bit_depth: 1, titre: 'Wish You Were Here' },
  { format: 'dsf', sample_rate: 5644800, bit_depth: 1, titre: 'In My World (Remastered)' },
  { format: 'dsf', sample_rate: 11289600, bit_depth: 1, titre: 'un DSD256' },
  { format: 'dsf', sample_rate: 22579200, bit_depth: 1, titre: 'un DSD512' },
];

describe('estDuDSD', () => {
  it('🔴 reconnaît dsf et dff, pas seulement dsd', () => {
    expect(estDuDSD('dsf')).toBe(true);
    expect(estDuDSD('dff')).toBe(true);
    expect(estDuDSD('dsd')).toBe(true);
  });

  it('accepte les types MIME et la casse', () => {
    expect(estDuDSD('audio/x-dsf')).toBe(true);
    expect(estDuDSD('audio/dff')).toBe(true);
    expect(estDuDSD('DSF')).toBe(true);
    expect(estDuDSD(' dsf ')).toBe(true);
  });

  it('ne prend pas pour du DSD ce qui n’en est pas', () => {
    for (const f of ['flac', 'wav', 'alac', 'aiff', 'mp3', 'aac', '', null, undefined]) {
      expect(estDuDSD(f), String(f)).toBe(false);
    }
  });
});

describe('🔴 le palier de qualité — le défaut signalé', () => {
  it('les 6 albums mesurés tombent TOUS sur « dsd »', () => {
    for (const a of MESURE) expect(getQualityTier(a), a.titre).toBe('dsd');
  });

  it('l’album de la copie d’écran n’est plus classé « CD »', () => {
    // « CD DSF 5644.8/1 » : c'est exactement ce que Bertrand voyait.
    const album = MESURE.find((a) => a.titre === 'In My World (Remastered)')!;
    expect(getQualityTier(album)).not.toBe('cd');
    expect(getQualityTier(album)).toBe('dsd');
  });

  it('TÉMOIN — un FLAC 16/44,1 reste « cd », un 24/96 reste « hires »', () => {
    // Élargir le DSD ne doit pas déplacer le reste.
    expect(getQualityTier({ format: 'flac', sample_rate: 44100, bit_depth: 16 })).toBe('cd');
    expect(getQualityTier({ format: 'flac', sample_rate: 96000, bit_depth: 24 })).toBe('hires');
    expect(getQualityTier({ format: 'mp3', sample_rate: 44100, bit_depth: 0 })).toBe('lossy');
  });
});

describe('🔴 le multiple annoncé', () => {
  it('les quatre multiples de la bibliothèque sont nommés justes', () => {
    expect(multipleDSD(2822400)).toBe('DSD64');
    expect(multipleDSD(5644800)).toBe('DSD128');
    expect(multipleDSD(11289600)).toBe('DSD256');
    expect(multipleDSD(22579200)).toBe('DSD512');
  });

  it('un DSD256 n’est plus annoncé « DSD128 » — 6 albums le sont sur le .18', () => {
    const ancienLibelle = (sr: number) => (sr >= 5000000 ? 'DSD128' : 'DSD64');
    expect(ancienLibelle(11289600)).toBe('DSD128');   // ce qu'on affichait
    expect(multipleDSD(11289600)).toBe('DSD256');     // ce que c'est
  });

  it('une fréquence inattendue ne fabrique pas un nom', () => {
    // Mieux vaut « DSD » tout court qu'un multiple inventé.
    expect(multipleDSD(96000)).toBeNull();
    expect(multipleDSD(0)).toBeNull();
    expect(multipleDSD(null)).toBeNull();
    expect(multipleDSD(undefined)).toBeNull();
  });
});

describe('les écrans APPELLENT la règle', () => {
  const lire = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');

  it('la Bibliothèque n’a plus son seuil à 5 MHz', () => {
    const lib = lire('components/v2/LibraryV2.svelte');
    expect(lib).toContain('multipleDSD(a.sample_rate)');
    expect(lib).not.toContain(">= 5000000 ? 'DSD128' : 'DSD64'");
  });

  it('l’animation reconnaît le DSD par sa vraie extension', () => {
    const vis = lire('components/AudioVisualizer.svelte');
    expect(vis).toContain('estDuDSD(format)');
    expect(vis).not.toContain("if (format === 'dsd')");
  });

  it('la règle n’est plus écrite en dur dans le calcul de palier', () => {
    const u = lire('lib/utils.ts');
    expect(u).toContain('if (estDuDSD(fmt)) return \'dsd\';');
    expect(u).not.toContain("if (fmt === 'dsd' || fmt.startsWith('dsd')) return 'dsd';");
  });
});
