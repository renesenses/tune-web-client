<script lang="ts">
  /**
   * « Pourquoi ma zone ne joue pas ? » — le diagnostic de l'assistant, en
   * LECTURE SEULE (tune-server-rust, décisions de Bertrand du 23/10/2026).
   *
   * Deux temps, à CHAQUE envoi : « Préparer » rend le texte EXACT qui partirait
   * (pseudonymisé : adresses, noms de zones et d'appareils, titres, chemins,
   * jetons) et son coût estimé ; seul « Envoyer » le fait partir, une fois.
   * La réponse ne fait AUCUNE action : des causes probables, appuyées sur des
   * extraits vérifiés, et des gestes à essayer.
   *
   * Le résumé (marqué IA, resté pseudonymisé) remonte au parent par
   * `onResume` : le rapport de bug ne le joint que si l'utilisateur coche.
   */
  import { t, locale } from '../../lib/i18n';
  import { estEchec, messageDEchec } from '../../lib/assistantIa';
  import {
    apercuDiagnosticIa, envoyerDiagnosticIa, coutLisible,
    type ApercuDiagnosticIa, type DiagnosticIa,
  } from '../../lib/assistantIaRc8';

  interface Props {
    zones: { id: number; name: string }[];
    zoneParDefaut?: number | null;
    onResume?: (resume: string | null) => void;
  }
  let { zones, zoneParDefaut = null, onResume }: Props = $props();

  let zoneId = $state<number | null>(null);
  $effect(() => { if (zoneId == null && zoneParDefaut != null) zoneId = zoneParDefaut; });
  let question = $state('');
  let secondAvis = $state(false);
  let apercu = $state<ApercuDiagnosticIa | null>(null);
  let diag = $state<DiagnosticIa | null>(null);
  let occupe = $state(false);
  let erreur = $state<string | null>(null);

  async function preparer() {
    occupe = true; erreur = null; diag = null; apercu = null; onResume?.(null);
    try {
      const v = await apercuDiagnosticIa({ zone_id: zoneId, question: question.trim(), langue: $locale, second_avis: secondAvis });
      if (estEchec(v)) erreur = messageDEchec(v, (k) => $t(k as any));
      else if (v && (v as ApercuDiagnosticIa).apercu_id) apercu = v as ApercuDiagnosticIa;
      else erreur = $t('assistantIa.diag.unavailable' as any);
    } catch (e) {
      erreur = (e as Error)?.message ?? $t('assistantIa.err.generique' as any);
    } finally { occupe = false; }
  }

  async function envoyer() {
    if (!apercu) return;
    const id = apercu.apercu_id;
    occupe = true; erreur = null;
    try {
      const v = await envoyerDiagnosticIa(id);
      // L'aperçu a servi : le suivant devra être montré à nouveau.
      apercu = null;
      if (estEchec(v)) erreur = messageDEchec(v, (k) => $t(k as any));
      else { diag = v as DiagnosticIa; onResume?.(diag.resume_pour_le_rapport || null); }
    } catch (e) {
      erreur = (e as Error)?.message ?? $t('assistantIa.err.generique' as any);
    } finally { occupe = false; }
  }
</script>

<section class="diag-ia" data-diagnostic-ia>
  <h3>{$t('assistantIa.diag.title' as any)}</h3>
  <p class="sub">{$t('assistantIa.diag.intro' as any)}</p>
  <div class="ligne">
    <select bind:value={zoneId} aria-label={$t('assistantIa.diag.zone' as any)}>
      <option value={null}>{$t('assistantIa.diag.noZone' as any)}</option>
      {#each zones as z (z.id)}<option value={z.id}>{z.name}</option>{/each}
    </select>
    <label class="case"><input type="checkbox" bind:checked={secondAvis} /> {$t('assistantIa.secondOpinion' as any)}</label>
  </div>
  <textarea bind:value={question} rows="2" maxlength="500" placeholder={$t('assistantIa.diag.placeholder' as any)}></textarea>
  <div class="actions">
    <button class="go" onclick={preparer} disabled={occupe} data-diag-preparer>{$t('assistantIa.diag.prepare' as any)}</button>
  </div>

  {#if apercu}
    <div class="apercu" data-diag-apercu>
      <p class="sub">
        {apercu.local ? $t('assistantIa.diag.local' as any) : $t('assistantIa.diag.leaves' as any).replace('{fournisseur}', apercu.fournisseur ?? '?')}
        · {apercu.modele} · {coutLisible(apercu.cout_estime_eur, $locale)}
        · {$t('assistantIa.diag.replaced' as any).replace('{n}', String(apercu.remplacements))}
      </p>
      <details open={!apercu.local}>
        <summary>{$t('assistantIa.preview.what' as any)}</summary>
        <pre>{apercu.envoye.message}</pre>
      </details>
      <button class="go" onclick={envoyer} disabled={occupe} data-diag-envoyer>
        {$t('assistantIa.diag.send' as any).replace('{fournisseur}', apercu.fournisseur ?? '?')}
      </button>
    </div>
  {/if}

  {#if erreur}<p class="err" role="alert">{erreur}</p>{/if}

  {#if diag}
    <div class="res" data-diag-resultat>
      <p class="bandeau">{$t('assistantIa.diag.banner' as any)}</p>
      <p>{diag.constat}</p>
      {#if diag.causes_probables.length}
        <h4>{$t('assistantIa.diag.causes' as any)}</h4>
        <ul>
          {#each diag.causes_probables as c, i (i)}
            <li>
              <b>{c.cause}</b> <em>({$t(`assistantIa.diag.conf.${c.confiance}` as any)})</em>
              {#each c.indices as x, j (j)}<code class="indice">{x}</code>{/each}
            </li>
          {/each}
        </ul>
      {/if}
      {#if diag.a_essayer.length}
        <h4>{$t('assistantIa.diag.try' as any)}</h4>
        <ul>{#each diag.a_essayer as g, i (i)}<li>{g.geste}{#if g.ou} — <em>{g.ou}</em>{/if}</li>{/each}</ul>
      {/if}
    </div>
  {/if}
</section>

<style>
  .diag-ia { border: 1px solid var(--v2-line2); border-radius: var(--v2-r-card, 10px); padding: 12px 14px; margin-bottom: 14px; }
  h3 { font-size: 14px; margin: 0 0 6px; }
  h4 { font-size: 13px; margin: 10px 0 4px; }
  .sub { font-size: 12.5px; color: var(--v2-txt3); margin: 4px 0; }
  .ligne { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 6px 0; }
  textarea { width: 100%; box-sizing: border-box; background: var(--v2-bg); border: 1px solid var(--v2-line2); border-radius: 8px; color: var(--v2-txt); padding: 8px 10px; font: inherit; }
  .actions { display: flex; justify-content: flex-end; margin-top: 8px; }
  .go { border-radius: 8px; padding: 6px 12px; border: 1px solid var(--v2-acc1); color: var(--v2-acc1); background: transparent; cursor: pointer; }
  .go:disabled { opacity: 0.45; cursor: default; }
  .apercu, .res { border-top: 1px solid var(--v2-line); margin-top: 10px; padding-top: 6px; }
  pre { white-space: pre-wrap; font-size: 11.5px; max-height: 280px; overflow: auto; background: var(--v2-bg); padding: 8px; border-radius: 6px; }
  .bandeau { font-size: 12px; color: var(--v2-acc1); margin: 0 0 4px; }
  .indice { display: block; font-size: 11.5px; margin: 2px 0 0 12px; color: var(--v2-txt3); }
  .err { font-size: 12.5px; color: var(--v2-danger); }
  .case { font-size: 12.5px; }
</style>
