/**
 * Le bouton Stop de la barre de transport (Bertrand, 08/09/2026).
 *
 * Il avait été retiré le 05/09 au profit du double-clic sur Lecture. Cette
 * garde tient les deux moitiés de son retour :
 *
 *  1. la RÈGLE — `arretPossible`, appelée, pas relue ;
 *  2. le BRANCHEMENT — le bouton existe dans la barre, il est gardé par cette
 *     règle, et il appelle le même `arreter` que le double-clic. « Écrit mais
 *     pas branché » est le défaut dominant de ce client : une règle verte
 *     au-dessus d'un bouton absent ne vaut rien.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { arretPossible } from '../arretTransport';

const barre = readFileSync(resolve(__dirname, '../../components/TransportBar.svelte'), 'utf-8');

describe('arretPossible', () => {
  it('arrête une piste locale d’une zone', () => {
    expect(arretPossible(10, 'local')).toBe(true);
  });

  it('n’arrête pas une radio : un direct ne se reprend pas où on l’a laissé', () => {
    expect(arretPossible(10, 'radio')).toBe(false);
  });

  it('n’arrête rien sans zone : il n’y a pas d’appareil à libérer', () => {
    expect(arretPossible(null, 'local')).toBe(false);
    expect(arretPossible(undefined, 'qobuz')).toBe(false);
  });

  it('une source absente ou inconnue reste arrêtable', () => {
    // Une piste locale sans champ `source` ne doit pas perdre son bouton.
    expect(arretPossible(10, undefined)).toBe(true);
    expect(arretPossible(10, null)).toBe(true);
    expect(arretPossible(10, 'tidal')).toBe(true);
  });
});

describe('le bouton est réellement dans la barre', () => {
  it('la barre appelle la règle au lieu de la réécrire', () => {
    expect(barre).toContain("import { arretPossible } from '../lib/arretTransport'");
    expect(barre).toContain('arretPossible(zone?.id, displayTrack?.source)');
    // La condition en dur qu'elle remplace ne doit pas revenir en douce.
    expect(barre).not.toContain("!!zone?.id && displayTrack?.source !== 'radio'");
  });

  it('un bouton Stop existe, gardé par la règle', () => {
    const bloc = barre.slice(barre.indexOf('{#if stopPossible}'));
    expect(bloc.startsWith('{#if stopPossible}')).toBe(true);
    // Le bouton et son libellé sont DANS ce bloc, avant sa fermeture.
    const fin = bloc.indexOf('{/if}');
    expect(fin).toBeGreaterThan(0);
    const dedans = bloc.slice(0, fin);
    expect(dedans).toContain("transport.stop");
    expect(dedans).toContain('onclick={arreter}');
  });

  it('le double-clic et le bouton passent par le même arrêt', () => {
    expect(barre).toContain('async function arreter()');
    expect(barre).toContain('await stopAndSync(zone.id)');
    // Une seule occurrence de l'appel : pas de seconde implémentation.
    expect(barre.split('stopAndSync(zone.id)').length - 1).toBe(1);
  });
});
