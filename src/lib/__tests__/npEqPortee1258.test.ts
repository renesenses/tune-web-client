import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * #1258 — le préréglage choisi depuis le lecteur dit s'il a atteint le son.
 *
 * `POST /zones/{id}/eq` répond `applied_live` : vrai quand la courbe vient de
 * toucher le flux EN COURS. `setEqPreset` faisait `await api.setEq(…)` et
 * jetait cette réponse. L'auditeur choisissait « Rock », n'entendait rien
 * changer, et concluait que l'égaliseur ne marchait pas — le défaut de
 * #1710/#1725/#1786, revenu par le seul écrivain DSP que la garde
 * `dspAppliedLiveGuard` ne lisait pas.
 *
 * Même motif que le crossfeed du même fichier (`cfPorteeLive`), à une nuance
 * près, tenue par le troisième test : `false` hors lecture veut seulement dire
 * « rien ne joue » (voir `EqSetResult` dans `api.ts`), donc la note ne
 * s'affiche qu'en lecture — comme dans `EqualizerV2` et `ProfilerV2`.
 *
 * Garde de SOURCE, comme `eqRefusPremium` : monter `NowPlaying` demanderait la
 * moitié de l'application.
 */
const NP = readFileSync(
  resolve(process.cwd(), 'src/components/partages/NowPlaying.svelte'),
  'utf-8',
);

function corpsDe(nom: string): string {
  const debut = NP.indexOf(`async function ${nom}(`);
  expect(debut, `fonction introuvable : ${nom}`).toBeGreaterThan(-1);
  const fin = NP.indexOf('\n  }\n', debut);
  expect(fin, `fin de ${nom} introuvable`).toBeGreaterThan(debut);
  return NP.slice(debut, fin);
}

describe('#1258 — le préréglage du lecteur rapporte sa portée', () => {
  it('la réponse de setEq est capturée, puis lue', () => {
    const corps = corpsDe('setEqPreset');
    const jetes = corps.split('\n').filter((l) => {
      const t = l.trim();
      return t.startsWith('await api.setEq(') || t.startsWith('void api.setEq(');
    });
    expect(jetes, 'réponse de setEq jetée : le serveur dit si la courbe a atteint le son').toEqual([]);
    expect(corps, 'applied_live n’est pas lu dans setEqPreset').toMatch(
      /eqPorteeLive\s*=\s*(?:atteintLeSon\()?res\?\.applied_live[,)\s]/,
    );
  });

  it('« faux » est distingué d’« absent » : la note ne s’allume que sur false', () => {
    // Un serveur antérieur à #1725 omet le champ. Un `!eqPorteeLive` ferait
    // annoncer « la piste suivante » à tout ce parc.
    expect(NP).not.toMatch(/!\s*eqPorteeLive\b/);
    expect(NP).toMatch(/\{#if eqPorteeLive === false\b/);
  });

  it('la note vit dans le panneau égaliseur, dit la piste suivante, et seulement en lecture', () => {
    const ouverture = NP.indexOf('{#if showEq}');
    expect(ouverture, 'bloc du panneau égaliseur introuvable').toBeGreaterThan(-1);
    const fermeture = NP.indexOf('{/if}', NP.indexOf('{#if eqPorteeLive', ouverture));
    const bloc = NP.slice(ouverture, fermeture);
    expect(bloc, 'la note de portée n’est pas dans le panneau égaliseur').toContain(
      "$t('eq.effectNextTrack')",
    );
    expect(bloc, 'la note s’afficherait aussi quand rien ne joue').toMatch(
      /eqPorteeLive === false && playState === 'playing'/,
    );
  });

  it('changer de zone oublie ce que le serveur disait de la précédente', () => {
    // L'effet qui relit l'égaliseur à chaque zone doit remettre la portée à
    // zéro AVANT la relecture — sinon la note de la zone A s'affiche sur B.
    // Ancré sur la relecture elle-même : `const id = zone?.id;` existe dans
    // plusieurs effets du fichier, `api.getEq(id)` dans un seul.
    const lecture = NP.indexOf('api.getEq(id)');
    expect(lecture, 'relecture de l’égaliseur introuvable').toBeGreaterThan(-1);
    expect(NP.indexOf('api.getEq(id)', lecture + 1), 'deux relectures : ancre ambiguë').toBe(-1);
    const debut = NP.lastIndexOf('$effect(', lecture);
    const avantLecture = NP.slice(debut, lecture);
    expect(avantLecture, 'la portée survit au changement de zone').toContain(
      'eqPorteeLive = null',
    );
  });
});
