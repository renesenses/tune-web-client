<script lang="ts">
  /**
   * Réglages ▸ Enrichissement : les deux passes de lot du lot 2 MetaRust
   * (tune-server-rust#4805, d'après MetaRust de Xavier Joly ; go de Bertrand
   * du 13/10/2026). Lancées À LA MAIN, comme l'identification de la
   * bibliothèque :
   *
   * - « BPM de la bibliothèque » : Wikidata, puis le signal ;
   * - « Propositions Discogs » : albums sans identifiant MusicBrainz, par
   *   code-barres ou n° de catalogue. Rien n'est écrit sur un album avant
   *   qu'on accepte sa proposition sur la fiche.
   *
   * Suspendre / Reprendre passent par la tâche de fond `enrichment` : la
   * passe se gare entre deux albums et repart au même endroit.
   */
  import { untrack } from 'svelte';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { formatNombre } from '../../lib/formats';
  import {
    enCours,
    issueDuLancementPasse,
    ligneDEtat,
    lireEtatPasse,
    pourcentage,
    type EtatPasseLot,
    type ModePasse,
  } from '../../lib/passesMetarust';

  const PASSES: { mode: ModePasse; titre: string; aide: string }[] = [
    { mode: 'bpm', titre: 'v2.passes.bpmTitle', aide: 'v2.passes.bpmHint' },
    { mode: 'discogs', titre: 'v2.passes.discogsTitle', aide: 'v2.passes.discogsHint' },
  ];

  let etats = $state<Partial<Record<ModePasse, EtatPasseLot>>>({});
  let erreurs = $state<Partial<Record<ModePasse, string>>>({});
  let annonces = $state<Partial<Record<ModePasse, string>>>({});
  let occupe = $state<string | null>(null);
  let indisponible = $state(false);

  const tr = (k: string) => $t(k as any);
  const fmt = (x: number) => $formatNombre(x);

  async function relire() {
    for (const { mode } of PASSES) {
      try {
        // La réponse d'abord, l'écriture ensuite : lire `etats` avant l'attente
        // ferait de l'effet appelant un abonné de `etats`, qui se relancerait
        // à chaque écriture.
        const e = lireEtatPasse(await api.etatPasseMetarust(mode), mode);
        etats = { ...etats, [mode]: e };
      } catch {
        indisponible = true;
      }
    }
  }

  // Sondage tant qu'une passe tourne ; un seul minuteur.
  $effect(() => {
    untrack(() => void relire());
    const id = setInterval(() => {
      if (PASSES.some(({ mode }) => etats[mode] && enCours(etats[mode]!))) void relire();
    }, 3000);
    return () => clearInterval(id);
  });

  async function lancer(mode: ModePasse) {
    occupe = mode;
    erreurs = { ...erreurs, [mode]: '' };
    annonces = { ...annonces, [mode]: '' };
    try {
      const issue = issueDuLancementPasse(await api.lancerPasseMetarust(mode), tr);
      if (issue.genre === 'refuse') {
        erreurs = { ...erreurs, [mode]: issue.phrase };
      } else if (issue.sansCode > 0) {
        annonces = {
          ...annonces,
          [mode]: tr('v2.passes.discogsWithoutCode').replace('{n}', fmt(issue.sansCode)),
        };
      }
    } catch {
      erreurs = { ...erreurs, [mode]: tr('settings.errStartFailed') };
    } finally {
      occupe = null;
    }
    await relire();
  }

  async function suspendreOuReprendre(enPause: boolean) {
    occupe = 'pause';
    try {
      if (enPause) await api.resumeBackgroundTask('enrichment');
      else await api.pauseBackgroundTask('enrichment');
    } catch {
      // L'état relu dit ce qui s'est passé.
    } finally {
      occupe = null;
    }
    await relire();
  }
</script>

{#if !indisponible}
  {#each PASSES as p (p.mode)}
    {@const e = etats[p.mode]}
    <div class="row" data-passe={p.mode}>
      <div class="lbl">
        <span>{$t(p.titre as any)}</span>
        <span class="hint">{$t(p.aide as any)}</span>
        {#if e && ligneDEtat(e, tr, fmt)}
          <span class="hint" data-passe-etat={p.mode}>{ligneDEtat(e, tr, fmt)}</span>
        {/if}
      </div>
      <div class="inline">
        {#if e && enCours(e)}
          <button class="lnk" disabled={occupe === 'pause'} onclick={() => suspendreOuReprendre(e.en_pause)}>
            {$t((e.en_pause ? 'v2.passes.resume' : 'v2.passes.pause') as any)}
          </button>
        {:else}
          <button class="lnk" disabled={occupe === p.mode} onclick={() => lancer(p.mode)}>
            {$t((e?.status === 'interrupted' || e?.status === 'stopped' ? 'v2.passes.continue' : 'v2.set.start') as any)}
          </button>
        {/if}
      </div>
    </div>
    {#if e && enCours(e) && e.total > 0}
      <div class="bar2"><span style="width:{pourcentage(e)}%"></span></div>
    {/if}
    {#if erreurs[p.mode]}<div class="errline" data-passe-refus={p.mode}>{erreurs[p.mode]}</div>{/if}
    {#if annonces[p.mode]}<div class="hint">{annonces[p.mode]}</div>{/if}
    {#if p.mode === 'discogs'}
      <!-- Conditions de l'API Discogs : la mention, à côté des données. -->
      <p class="hint">{$t('v2.passes.discogsNotice' as any)}</p>
    {/if}
  {/each}
{/if}

<!--
  web#2324 — ce composant n'avait AUCUN bloc de styles. Les classes `row`,
  `lbl`, `hint`, `inline`, `lnk`, `bar2`, `errline` sont définies dans le
  bloc de styles de SettingsV2.svelte, à portée LOCALE : Svelte ne les applique pas à
  un composant enfant. Les lignes « BPM de la bibliothèque » et « Propositions
  Discogs » s'affichaient donc en texte brut, à la taille par défaut, avec des
  boutons « Lancer » natifs sous le libellé (Didier, fil 2390). Les règles
  reprennent, à l'identique, celles des lignes voisines de Réglages.
-->
<style>
  .row{display:flex; align-items:center; justify-content:space-between; gap:20px; margin-top:12px}
  .lbl{display:flex; flex-direction:column; gap:4px; min-width:0}
  .lbl span:first-child{font-size:13.5px; font-weight:500}
  .hint{font-size:11.5px; line-height:1.45; color:var(--v2-txt3)}
  p.hint{margin:6px 0 0}
  .inline{display:flex; align-items:center; gap:8px; flex-wrap:wrap; flex:0 0 auto}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:999px; padding:6px 13px; font:600 11.5px var(--v2-sans)}
  .lnk:hover:not(:disabled){border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .lnk:disabled{opacity:.5; cursor:default}
  .bar2{margin-top:12px; height:6px; border-radius:4px; background:var(--v2-line); overflow:hidden}
  .bar2 span{display:block; height:100%; border-radius:4px;
    background:linear-gradient(90deg,var(--v2-acc1),var(--v2-acc2)); transition:width .4s}
  .errline{margin-top:10px; font-size:12px; color:var(--v2-danger)}
</style>
