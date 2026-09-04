/**
 * Toute section déclarée dans `V2_SETTINGS` doit avoir sa branche de rendu dans
 * `SettingsV2.svelte`.
 *
 * ## Pourquoi ce garde-fou existe
 *
 * L'écran se terminait par un filet de sécurité :
 *
 * ```svelte
 * {:else}
 *   <div class="todo">
 *     <span>Contenu repris depuis l'écran actuel — pas encore porté ici.</span>
 *     <button>Ouvrir dans l'écran actuel</button>
 *   </div>
 * {/if}
 * ```
 *
 * Une note de développement, visible par l'utilisateur. Mesuré le 01/09/2026 :
 * les 41 sections déclarées avaient TOUTES leur branche, donc ce `{:else}`
 * était du code mort — il ne s'affichait jamais. Il a été retiré.
 *
 * Mais retirer un filet sans rien mettre à la place déplace le risque au lieu
 * de le supprimer : une section déclarée sans branche ne dirait plus rien du
 * tout, elle rendrait une carte VIDE, avec son titre et rien dedans. Un défaut
 * plus discret que celui qu'on vient d'enlever.
 *
 * Ce test est donc la contrepartie exacte de cette suppression : il fait tenir
 * l'invariant qui rendait le filet inutile.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { V2_SETTINGS } from '../v2Settings';

const ECRAN = fileURLToPath(
  new URL('../../components/v2/SettingsV2.svelte', import.meta.url),
);

/** Le source de l'écran, module de style exclu — une classe CSS nommée comme
 *  une section ne doit pas passer pour une branche de rendu. */
function codeDeRendu(): string {
  const src = readFileSync(ECRAN, 'utf8');
  const style = src.lastIndexOf('<style>');
  return style === -1 ? src : src.slice(0, style);
}

describe('Réglages v2 — sections déclarées et sections rendues', () => {
  it('chaque section déclarée a sa branche de rendu', () => {
    const code = codeDeRendu();
    const orphelines = V2_SETTINGS.flatMap((tab) => tab.sections)
      .map((s) => s.id)
      .filter((id) => !code.includes(`s.id === '${id}'`));

    expect(
      orphelines,
      `section(s) déclarée(s) sans branche de rendu : ${orphelines.join(', ')}.\n` +
        `Elles afficheraient une carte VIDE — un titre, et rien dedans. ` +
        `Ajoutez la branche, ou retirez la section de V2_SETTINGS.`,
    ).toEqual([]);
  });

  it("l'écran ne rend aucune branche qui ne soit pas déclarée", () => {
    // Le sens inverse : une branche sans déclaration est du code mort, jamais
    // atteint, qui survit aux relectures parce qu'il A L'AIR utile.
    const declarees = new Set(
      V2_SETTINGS.flatMap((tab) => tab.sections).map((s) => s.id),
    );
    const rendues = [
      ...codeDeRendu().matchAll(/s\.id === '([A-Za-z0-9]+)'/g),
    ].map((m) => m[1]);
    const mortes = [...new Set(rendues)].filter((id) => !declarees.has(id));

    expect(
      mortes,
      `branche(s) de rendu sans déclaration : ${mortes.join(', ')} — code mort.`,
    ).toEqual([]);
  });

  it("la note « pas encore porté ici » n'est pas revenue", () => {
    // Elle disait à l'utilisateur que le client est inachevé. Si une section
    // manque vraiment, c'est le premier test qui doit le dire, à nous — pas
    // l'écran qui doit s'en excuser auprès de l'utilisateur.
    const code = codeDeRendu();
    for (const motif of ['followMeNotPortedYet', 'openInCurrentScreen', 'class="todo"']) {
      expect(
        code.includes(motif),
        `« ${motif} » est réapparu dans l'écran : la note de développement est de retour.`,
      ).toBe(false);
    }
  });
});
