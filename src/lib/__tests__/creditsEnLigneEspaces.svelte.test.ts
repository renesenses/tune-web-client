// @vitest-environment jsdom
//
// Recette du 14/11 (Bertrand, .18, « Lecture en cours » sur « El niño » de
// DjeuhDjoah & Lieutenant Nicholson) : la ligne des crédits se lisait
//
//   « Compositeur: Georges-Olivier Mondo,Nicolas Voulzy-Musicien: Alexis
//     Valet(vibraphone),Antoine Berjeaut(trumpet),Aurélie Bouix(vocals), … »
//
// ## LA CAUSE
//
// Pas une balise brute : `track_credits` porte des lignes propres (deux
// compositeurs, dix-huit musiciens avec leur instrument). Le balisage de la
// ligne écrivait ses séparateurs EN TEXTE au bord des blocs —
// `{#if mi > 0}, {/if}`, `{#if m.instrument} ({m.instrument}){/if}`,
// `<span> · </span>` — et Svelte 5 retire les espaces au début et à la fin
// d'un bloc et d'un élément. Les noms se collaient.
//
// ## LE TÉMOIN
//
// On monte la VRAIE ligne avec les crédits de la base du .18 et on lit le
// texte rendu. Contre-épreuve : avec les séparateurs d'avant, le texte est
// celui de la capture.
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import CreditsEnLigne from '../../components/partages/CreditsEnLigne.svelte';
import type { TrackCredit } from '../types';

const LIBELLES: Record<string, string> = { composer: 'Compositeur', performer: 'Musicien' };

function credit(artist_name: string, role: string, instrument: string | null = null): TrackCredit {
  return { artist_name, role, instrument } as unknown as TrackCredit;
}

let monte: Record<string, unknown> | null = null;
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  document.body.innerHTML = '';
});

function texteDe(groupes: unknown[]): string {
  const hote = document.createElement('p');
  document.body.appendChild(hote);
  monte = mount(CreditsEnLigne, {
    target: hote,
    props: { groupes: groupes as any, libelle: (r: string) => LIBELLES[r] ?? r },
  });
  flushSync();
  return hote.textContent ?? '';
}

describe('Lecture en cours — la ligne des crédits garde ses espaces', () => {
  it('🔴 « El niño » : compositeurs et musiciens séparés, instruments espacés', () => {
    const texte = texteDe([
      {
        role: 'composer',
        membres: [credit('Georges-Olivier Mondo', 'composer'), credit('Nicolas Voulzy', 'composer')],
        reste: false,
      },
      {
        role: 'performer',
        membres: [
          credit('Alexis Valet', 'performer', 'vibraphone'),
          credit('Antoine Berjeaut', 'performer', 'trumpet'),
          credit('Aurélie Bouix', 'performer', 'vocals'),
        ],
        reste: true,
      },
    ]);
    expect(texte).not.toContain('Mondo,Nicolas');
    expect(texte).not.toContain('Valet(vibraphone)');
    expect(texte).toBe(
      'Compositeur: Georges-Olivier Mondo, Nicolas Voulzy · Musicien: Alexis Valet (vibraphone), '
        + 'Antoine Berjeaut (trumpet), Aurélie Bouix (vocals), …',
    );
  });

  it('un seul groupe, un seul nom : ni séparateur ni points de suite', () => {
    expect(texteDe([{ role: 'composer', membres: [credit('Georges-Olivier Mondo', 'composer')], reste: false }]))
      .toBe('Compositeur: Georges-Olivier Mondo');
  });
});
