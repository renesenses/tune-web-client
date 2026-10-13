<script lang="ts">
  /**
   * tune-server-rust#5593, étape 2 (décision de Bertrand du 13/10) — le
   * périmètre PROPRE à chaque analyse de fond. Par défaut, chaque analyse
   * suit le périmètre commun (les empreintes suivent le ReplayGain) ;
   * décocher « Comme… » ouvre un champ à elle. Une liste vide n'exclut rien
   * pour cette analyse. Étape 3 : chaque entrée propre affiche combien de
   * pistes elle retire, quand le serveur l'a compté.
   */
  import { t } from '../../lib/i18n';
  import { bulleTexte } from '../../lib/infobulleTexte';
  import { afficherGenres, lireSaisieDeGenres } from '../../lib/genresClap';
  import {
    PASSES,
    avecChamp,
    champEffectif,
    champPropre,
    compteDe,
    heritee,
    lireSaisieDeDossiers,
    type Champ,
    type ComptesPerimetre,
    type ParPasse,
    type Passe,
  } from '../../lib/perimetreAnalyses';

  let {
    parPasse,
    commun,
    comptes,
    disabled = false,
    onchange,
  }: {
    parPasse: ParPasse;
    commun: Record<Champ, string[]>;
    comptes: ComptesPerimetre | null;
    disabled?: boolean;
    onchange: (suivant: ParPasse) => void;
  } = $props();

  const CHAMPS: Champ[] = ['excluded_roots', 'excluded_genres'];

  function libelleHeritage(passe: Passe): string {
    return heritee(passe) === 'replaygain'
      ? $t('settings.analysisPerPassInheritReplaygain' as any)
      : $t('settings.analysisPerPassInheritCommon' as any);
  }

  function basculer(passe: Passe, champ: Champ, herite: boolean) {
    // Décocher « Comme… » part de la valeur en vigueur : rien ne change tant
    // que l'utilisateur n'a pas modifié le champ.
    onchange(avecChamp(parPasse, passe, champ, herite ? null : champEffectif(parPasse, commun, passe, champ)));
  }

  function saisir(passe: Passe, champ: Champ, texte: string) {
    const liste = champ === 'excluded_roots' ? lireSaisieDeDossiers(texte) : lireSaisieDeGenres(texte);
    onchange(avecChamp(parPasse, passe, champ, liste));
  }

  function texteDe(champ: Champ, liste: string[]): string {
    return champ === 'excluded_roots' ? liste.join('\n') : afficherGenres(liste);
  }
</script>

<div class="clap-genres perimetre-par-passe">
  <span class="clap-genres-titre">{$t('settings.analysisPerPassTitle' as any)}</span>
  <p class="hint">{$t('settings.analysisPerPassHint' as any)}</p>
  {#each PASSES as passe (passe)}
    <fieldset class="passe" data-passe={passe}>
      <legend>{$t(`settings.analysisPass_${passe}` as any)}</legend>
      {#each CHAMPS as champ (champ)}
        {@const propre = champPropre(parPasse, passe, champ)}
        {@const effectif = champEffectif(parPasse, commun, passe, champ)}
        <div class="champ">
          <span>{$t(champ === 'excluded_roots' ? 'settings.analysisPerPassFolders' as any : 'settings.analysisPerPassGenres' as any)}</span>
          <label class="heritage">
            <input type="checkbox" checked={propre === null} {disabled}
              onchange={(e) => basculer(passe, champ, (e.currentTarget as HTMLInputElement).checked)} />
            <span>{libelleHeritage(passe)}</span>
          </label>
          {#if propre === null}
            <p class="hint herite">{effectif.length ? texteDe('excluded_genres', effectif) : '—'}</p>
          {:else if champ === 'excluded_roots'}
            <textarea rows="2" {disabled} value={texteDe(champ, propre)}
              onchange={(e) => saisir(passe, champ, (e.currentTarget as HTMLTextAreaElement).value)}></textarea>
          {:else}
            <input type="text" {disabled} value={texteDe(champ, propre)}
              onchange={(e) => saisir(passe, champ, (e.currentTarget as HTMLInputElement).value)} />
          {/if}
          {#if propre !== null && propre.length}
            <ul class="retraits">
              {#each propre as entree (entree)}
                {@const n = compteDe(comptes, passe, champ, entree)}
                <li><span class="dn" use:bulleTexte>{entree}</span>{#if n !== null} <span class="hint">{$t('settings.analysisScopeTracks' as any).replace('{n}', String(n))}</span>{/if}</li>
              {/each}
            </ul>
          {/if}
          {#if passe === 'replaygain' && champ === 'excluded_genres' && propre !== null && propre.length}
            <p class="avertissement" role="note">{$t('settings.analysisNoNormalizationWarning' as any)}</p>
          {/if}
        </div>
      {/each}
    </fieldset>
  {/each}
</div>

<style>
  .passe { border: 1px solid var(--border, #8884); border-radius: 6px; padding: 6px 10px; margin: 6px 0; }
  .passe legend { font-weight: 600; padding: 0 4px; }
  .champ { display: flex; flex-direction: column; gap: 4px; margin: 4px 0; }
  .heritage { display: flex; align-items: center; gap: 6px; }
  .retraits { list-style: none; margin: 0; padding: 0; }
  .avertissement { color: var(--warning, #b26b00); font-weight: 600; margin: 2px 0; }
  textarea { width: 100%; font: inherit; }
</style>
