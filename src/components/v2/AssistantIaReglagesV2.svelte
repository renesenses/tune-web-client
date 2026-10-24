<script lang="ts">
  /**
   * Réglages ▸ Assistant IA (tune-server-rust, chantier « assistant-ia »,
   * étapes 1 et 2).
   *
   * Étape 2 : les réglages sont réservés aux administrateurs. Le serveur le
   * dit (`modifiable`) et refuse de toute façon (`403 admin_requis`) ; un
   * profil ordinaire ne voit ici que l'état et la consommation du mois.
   *
   * La clé se SAISIT ici et ne revient jamais : le serveur la scelle et ne
   * rend que ses quatre derniers caractères. Le champ reste vide après
   * l'enregistrement ; le laisser vide ne touche pas à la clé posée.
   *
   * Étape 3 : la consommation du mois se détaille par usage, une alerte
   * prévient à 80 % du plafond, et le tarif appliqué est daté (avec sa
   * source, et le changement de prix annoncé par le fournisseur).
   */
  import { onMount } from 'svelte';
  import { t, locale } from '../../lib/i18n';
  import { noterReglagesIa } from '../../lib/assistantIaDialogue';
  import AlertePlafondIaV2 from './AlertePlafondIaV2.svelte';
  import { transcriptionDesReglages } from '../../lib/assistantIaRc8';
  import {
    lireReglagesIa, changerReglagesIa, testerCleIa, estEchec, estReglages, messageDEchec, peutModifier,
    lignesParUsage, cleDUsage, plafondDesReglages, dateLisible,
    type ReglagesIa, type FournisseurIa, type ModificationIa,
  } from '../../lib/assistantIa';

  const FOURNISSEURS: FournisseurIa[] = ['anthropic', 'gemini', 'compatible_openai', 'ollama'];

  let r = $state<ReglagesIa | null>(null);
  let fournisseur = $state<FournisseurIa | ''>('');
  let modele = $state('');
  let classique = $state(false);
  let url = $state('');
  let plafond = $state('2');
  let prixEntree = $state('');
  let prixSortie = $state('');
  let cle = $state('');
  /** La clé de transcription (Whisper), scellée au coffre (tune-server-rust, 23/10/2026). */
  let cleTranscription = $state('');
  let occupe = $state(false);
  let message = $state<string | null>(null);
  let erreur = $state<string | null>(null);

  function remplir(v: ReglagesIa) {
    noterReglagesIa(v);
    r = v;
    fournisseur = v.fournisseur ?? '';
    modele = v.modele ?? '';
    classique = !!v.modele_classique;
    url = v.url_base ?? '';
    plafond = String(v.plafond_eur ?? 2);
    prixEntree = v.prix_entree_usd_mtok == null ? '' : String(v.prix_entree_usd_mtok);
    prixSortie = v.prix_sortie_usd_mtok == null ? '' : String(v.prix_sortie_usd_mtok);
  }

  async function charger() {
    try {
      const v = await lireReglagesIa();
      if (estEchec(v)) erreur = messageDEchec(v, (k) => $t(k as any));
      else if (estReglages(v)) remplir(v);
    } catch (e) {
      erreur = (e as Error)?.message ?? $t('assistantIa.err.generique' as any);
    }
  }
  onMount(charger);

  const defaut = $derived(
    fournisseur === 'anthropic' ? (r?.modele_anthropic_par_defaut ?? '')
      : fournisseur === 'gemini' ? (r?.modele_gemini_par_defaut ?? '')
      : '',
  );
  const urlDefaut = $derived(
    fournisseur === 'anthropic' ? 'https://api.anthropic.com'
      : fournisseur === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta/openai'
      : fournisseur === 'compatible_openai' ? 'https://api.openai.com/v1'
      : fournisseur === 'ollama' ? 'http://127.0.0.1:11434'
      : '',
  );
  // Les prix se saisissent quand la table du serveur ne les connaît pas :
  // tout point d'accès compatible, et un modèle choisi hors de la table.
  const prixAffiches = $derived(fournisseur === 'compatible_openai'
    || (fournisseur !== '' && fournisseur !== 'ollama' && r != null && !r.tarif_connu && r.fournisseur === fournisseur));

  async function enregistrer() {
    occupe = true; message = null; erreur = null;
    const m: ModificationIa = {
      fournisseur,
      modele: modele.trim(),
      modele_classique: fournisseur === 'anthropic' && classique ? (r?.modele_anthropic_classique ?? '') : '',
      url_base: url.trim(),
      plafond_eur: plafond,
      prix_entree_usd_mtok: prixEntree.trim(),
      prix_sortie_usd_mtok: prixSortie.trim(),
    };
    if (cle.trim()) m.cle = cle.trim();
    if (cleTranscription.trim()) m.cle_transcription = cleTranscription.trim();
    try {
      const v = await changerReglagesIa(m);
      if (estEchec(v)) erreur = messageDEchec(v, (k) => $t(k as any));
      else if (estReglages(v)) { remplir(v); cle = ''; cleTranscription = ''; message = $t('assistantIa.saved' as any); }
    } catch (e) {
      erreur = (e as Error)?.message ?? $t('assistantIa.err.generique' as any);
    } finally { occupe = false; }
  }

  async function effacerCle() {
    occupe = true; message = null; erreur = null;
    try {
      const v = await changerReglagesIa({ cle: '' });
      if (estEchec(v)) erreur = messageDEchec(v, (k) => $t(k as any));
      else if (estReglages(v)) remplir(v);
    } finally { occupe = false; }
  }

  async function tester() {
    occupe = true; message = null; erreur = null;
    try {
      const v = await testerCleIa();
      if (estEchec(v)) erreur = messageDEchec(v, (k) => $t(k as any));
      else message = $t('assistantIa.testOk' as any);
      await charger();
    } catch (e) {
      erreur = (e as Error)?.message ?? $t('assistantIa.err.generique' as any);
    } finally { occupe = false; }
  }

  const resume = $derived(r ? $t('assistantIa.usage' as any)
    .replace('{mois}', r.consommation.mois)
    .replace('{cout}', r.consommation.cout_eur.toFixed(4))
    .replace('{plafond}', r.plafond_eur.toFixed(2))
    .replace('{appels}', String(r.consommation.appels))
    .replace('{cache}', String(r.consommation.depuis_cache)) : '');

  const usages = $derived(lignesParUsage(r?.consommation));
  const transcription = $derived(transcriptionDesReglages(r));
  const plafondEtat = $derived(plafondDesReglages(r));
  const prix = (v: number | null | undefined) => (v == null ? '?' : String(v));
  const tarifTexte = $derived.by(() => {
    const ta = r?.tarif;
    if (!ta || !ta.origine) return '';
    if (ta.origine === 'local') return $t('assistantIa.price.local' as any);
    const base = $t((ta.origine === 'saisi' ? 'assistantIa.price.saisi' : 'assistantIa.price.table') as any)
      .replace('{entree}', prix(ta.entree_usd_mtok))
      .replace('{sortie}', prix(ta.sortie_usd_mtok));
    return base.replace('{date}', dateLisible(ta.releve_le, $locale));
  });
</script>

<div class="ia" data-assistant-ia-reglages>
  <p class="hint">{$t('assistantIa.intro' as any)}</p>
  <p class="hint">{$t('assistantIa.privacy' as any)}</p>

  {#if r && !peutModifier(r)}
    <p class="hint" data-ia-admin-requis>{$t('assistantIa.adminOnly' as any)}</p>
    <p class="hint">{r.fournisseur ? $t('assistantIa.configured' as any).replace('{fournisseur}', $t(`assistantIa.provider.${r.fournisseur}` as any)) : $t('assistantIa.err.non_configure' as any)}</p>
  {:else}

  <label class="champ">
    <span>{$t('assistantIa.provider' as any)}</span>
    <select bind:value={fournisseur} onchange={() => { url = ''; modele = ''; }} data-ia-fournisseur>
      <option value="">{$t('assistantIa.provider.none' as any)}</option>
      {#each FOURNISSEURS as f (f)}
        <option value={f}>{$t(`assistantIa.provider.${f}` as any)}</option>
      {/each}
    </select>
  </label>

  {#if fournisseur === 'gemini'}<p class="hint">{$t('assistantIa.geminiHint' as any)}</p>{/if}
  {#if fournisseur === 'ollama'}<p class="hint">{$t('assistantIa.ollamaHint' as any)}</p>{/if}

  {#if fournisseur}
    <label class="champ">
      <span>{$t('assistantIa.model' as any)}</span>
      <input type="text" bind:value={modele} placeholder={defaut} list="ia-modeles" data-ia-modele />
      {#if defaut}
        <small class="hint">{$t('assistantIa.modelHint' as any).replace('{model}', defaut)}</small>
      {:else}
        <small class="hint">{$t('assistantIa.modelRequired' as any)}</small>
      {/if}
      <datalist id="ia-modeles">
        {#each (fournisseur === 'anthropic' ? r?.modeles_anthropic : fournisseur === 'gemini' ? r?.modeles_gemini : []) ?? [] as m (m)}
          <option value={m}></option>
        {/each}
      </datalist>
    </label>

    {#if fournisseur === 'anthropic' && r}
      <label class="case">
        <input type="checkbox" bind:checked={classique} />
        <span>{$t('assistantIa.classical' as any).replace('{model}', r.modele_anthropic_classique)}</span>
      </label>
    {/if}

    {#if fournisseur !== 'gemini'}
      <label class="champ">
        <span>{$t('assistantIa.url' as any)}</span>
        <input type="url" bind:value={url} placeholder={urlDefaut} />
        <small class="hint">{$t('assistantIa.urlHint' as any).replace('{url}', urlDefaut)}</small>
      </label>
    {/if}

    {#if fournisseur !== 'ollama'}
      <label class="champ">
        <span>{$t('assistantIa.key' as any)}</span>
        <input type="password" autocomplete="off" bind:value={cle}
          placeholder={$t('assistantIa.keyPlaceholder' as any)} data-ia-cle />
        {#if r?.cle_illisible}
          <small class="errline">{$t('assistantIa.keyUnreadable' as any)}</small>
        {:else if r?.cle_definie}
          <small class="hint" data-ia-cle-fin>{$t('assistantIa.keySet' as any).replace('{fin}', r.cle_fin ?? '')}</small>
        {:else}
          <small class="hint">{$t('assistantIa.keyNone' as any)}</small>
        {/if}
      </label>
    {/if}

    {#if prixAffiches}
      <div class="deux">
        <label class="champ">
          <span>{$t('assistantIa.priceIn' as any)}</span>
          <input type="text" inputmode="decimal" bind:value={prixEntree} />
        </label>
        <label class="champ">
          <span>{$t('assistantIa.priceOut' as any)}</span>
          <input type="text" inputmode="decimal" bind:value={prixSortie} />
        </label>
      </div>
      <p class="hint">{$t('assistantIa.priceHint' as any)}</p>
    {/if}

    {#if transcription}
      <label class="champ" data-ia-transcription>
        <span>{$t('assistantIa.transcription.key' as any)}</span>
        <input type="password" autocomplete="off" bind:value={cleTranscription}
          placeholder={$t('assistantIa.keyPlaceholder' as any)} />
        <small class="hint">
          {transcription.source
            ? $t(`assistantIa.transcription.source.${transcription.source}` as any).replace('{fin}', transcription.cle_fin ?? '')
            : $t('assistantIa.transcription.none' as any)}
          · {$t('assistantIa.transcription.price' as any).replace('{prix}', String(transcription.prix_usd_minute)).replace('{date}', transcription.releve_le)}
        </small>
      </label>
    {/if}
    {#if r?.modele_second_avis}
      <p class="hint">{$t('assistantIa.secondOpinion.model' as any).replace('{model}', r.modele_second_avis)}</p>
    {/if}

    <label class="champ">
      <span>{$t('assistantIa.cap' as any)}</span>
      <input type="text" inputmode="decimal" bind:value={plafond} data-ia-plafond />
      <small class="hint">{$t('assistantIa.capHint' as any)}</small>
    </label>
  {/if}

  <div class="inline">
    <button class="lnk primaire" disabled={occupe} onclick={enregistrer}>{$t('assistantIa.save' as any)}</button>
    {#if r?.fournisseur}
      <button class="lnk" disabled={occupe} onclick={tester} data-ia-tester>
        {occupe ? $t('assistantIa.testing' as any) : $t('assistantIa.test' as any)}
      </button>
    {/if}
    {#if r?.cle_definie}
      <button class="lnk" disabled={occupe} onclick={effacerCle}>{$t('assistantIa.keyDelete' as any)}</button>
    {/if}
  </div>

  {/if}

  {#if message}<p class="ok" role="status">{message}</p>{/if}
  {#if erreur}<p class="errline" role="alert">{erreur}</p>{/if}
  {#if r}
    <p class="hint" data-ia-conso>{resume}</p>
    {#if r.consommation.plafond_atteint}<p class="errline">{$t('assistantIa.capReached' as any)}</p>{/if}
    <AlertePlafondIaV2 plafond={plafondEtat} />
    {#if usages.length}
      <details class="usages" data-ia-par-usage>
        <summary>{$t('assistantIa.byUsage' as any)}</summary>
        <ul>
          {#each usages as u (u.usage)}
            <li>{$t('assistantIa.usageLine' as any)
              .replace('{usage}', cleDUsage(u.usage) ? $t(cleDUsage(u.usage) as any) : u.usage)
              .replace('{cout}', u.cout_eur.toFixed(4))
              .replace('{appels}', String(u.appels))
              .replace('{cache}', String(u.depuis_cache))}</li>
          {/each}
        </ul>
      </details>
    {/if}
    {#if tarifTexte}
      <p class="hint" data-ia-tarif>
        {tarifTexte}
        {#if r.tarif?.source_url}
          <a href={r.tarif.source_url} target="_blank" rel="noopener noreferrer">{$t('assistantIa.price.source' as any)}</a>
        {/if}
      </p>
      {#if r.tarif?.a_relever}
        <p class="errline" data-ia-tarif-a-relever>{$t('assistantIa.price.toCheck' as any).replace('{date}', dateLisible(r.tarif.a_relever_avant, $locale))}</p>
      {:else if r.tarif?.a_relever_avant}
        <p class="hint">{$t('assistantIa.price.announced' as any).replace('{date}', dateLisible(r.tarif.a_relever_avant, $locale))}</p>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .ia { display: flex; flex-direction: column; gap: 10px; }
  .inline { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  .deux { display: flex; flex-wrap: wrap; gap: 12px; }
  .hint { margin: 0; font-size: 12.5px; line-height: 1.45; color: var(--v2-txt3); }
  .ok { margin: 0; font-size: 12.5px; color: var(--v2-txt); }
  .errline { margin: 0; font-size: 12.5px; color: var(--v2-danger); }
  .champ { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--v2-txt2); }
  .case { display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; color: var(--v2-txt2); }
  input[type='text'], input[type='url'], input[type='password'], select {
    max-width: 420px; padding: 6px 8px; border-radius: 6px;
    border: 1px solid var(--v2-line); background: transparent; color: var(--v2-txt);
  }
  /* La liste déroulée native reprend le fond du <select> : un jeton de thème,
     jamais `transparent` (gris sur blanc sous Windows, #5074). */
  select, select option { background: var(--v2-surface); color: var(--v2-txt); }
  .lnk {
    background: none; border: 1px solid var(--v2-line); border-radius: 6px;
    padding: 5px 10px; color: var(--v2-txt); font-size: 13px; cursor: pointer;
  }
  .lnk:hover:not(:disabled) { border-color: var(--v2-acc1); color: var(--v2-acc1); }
  .lnk:disabled { opacity: 0.45; cursor: default; }
  .lnk.primaire { border-color: var(--v2-acc1); color: var(--v2-acc1); }
  .usages { font-size: 12.5px; color: var(--v2-txt3); }
  .usages summary { cursor: pointer; }
  .usages ul { margin: 6px 0 0; padding-left: 18px; }
  .hint a { color: var(--v2-acc1); }
</style>
