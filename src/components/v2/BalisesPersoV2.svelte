<script lang="ts">
  /**
   * Réglages › Bibliothèque › Balises personnelles → tags Tune
   * (tune-server-rust#9158, demande de Rob, go de Bertrand du 19/11).
   *
   * Les correspondances « clé de fichier → tags Tune » : chaque valeur devient
   * un tag (préfixe facultatif), ou un tag fixe dès que la balise est présente.
   * Le scan, le surveillant et la relecture les appliquent ; « Appliquer à la
   * bibliothèque » relit les fichiers déjà importés en tâche de fond.
   * L'aperçu liste les clés vues dans un échantillon de fichiers.
   *
   * Aucune écriture au chargement.
   */
  import { onDestroy, onMount } from 'svelte';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';
  import { notifierErreur } from '../../lib/notifierErreur';
  import {
    SUGGESTIONS_DEFAUT, choixDuSeparateur, copieReglage, corpsDe, memesReglages, nomDeCle, normaliserCle,
    refusDe, separateurDuChoix, type ChoixSeparateur, type ModeBalisePerso, type ReglageBalisesPerso,
  } from '../../lib/balisesPerso';
  import '../../styles/tune-v2.css';

  let chargement = $state(true);
  /** `false` : serveur d'avant le réglage (404). */
  let disponible = $state(true);
  let enregistrement = $state(false);
  let enBase = $state<ReglageBalisesPerso>({ mappings: [] });
  let form = $state<ReglageBalisesPerso>({ mappings: [] });
  let saisie = $state('');
  let suggestions = $state<string[]>([...SUGGESTIONS_DEFAUT]);
  /** Lignes dont le séparateur est « personnalisé » (même vide pendant la saisie). */
  let personnalises = $state<Record<number, boolean>>({});
  let refusSaisie = $state<string | null>(null);
  let refusLignes = $state<Record<number, string>>({});

  let apercu = $state<api.ApercuClesPerso | null>(null);
  let apercuEnCours = $state(false);
  let voirConnues = $state(false);

  let avancement = $state<api.AvancementBalisesPerso | null>(null);
  let minuterie: ReturnType<typeof setTimeout> | null = null;

  let vivant = true;
  onDestroy(() => {
    vivant = false;
    if (minuterie) clearTimeout(minuterie);
  });
  onMount(() => { void charger(); });

  const modifie = $derived(!memesReglages(form, enBase));
  const suggestionsLibres = $derived(suggestions.filter((s) => !form.mappings.some((c) => nomDeCle(c.key) === s)));

  function choix(i: number): ChoixSeparateur {
    return personnalises[i] ? 'custom' : choixDuSeparateur(form.mappings[i].separator);
  }

  function changerSeparateur(i: number, valeur: ChoixSeparateur) {
    personnalises = { ...personnalises, [i]: valeur === 'custom' };
    form.mappings[i].separator = separateurDuChoix(valeur, valeur === 'custom' ? (form.mappings[i].separator ?? '') : '');
  }
  const configurees = $derived(new Set(form.mappings.map((c) => nomDeCle(c.key))));
  const clesVisibles = $derived(
    (apercu?.keys ?? []).filter((k) => voirConnues || !k.known),
  );

  function appliquerEtat(etat: api.EtatBalisesPerso) {
    enBase = copieReglage(etat.personal_tags ?? { mappings: [] });
    form = copieReglage(enBase);
    if (etat.suggestions?.length) suggestions = [...etat.suggestions];
    personnalises = Object.fromEntries(form.mappings.map((c, i) => [i, choixDuSeparateur(c.separator) === 'custom']));
    refusLignes = {};
    if (etat.apply && (etat.apply.running || etat.apply.finished)) suivre(etat.apply);
  }

  async function charger() {
    chargement = true;
    try {
      const etat = await api.getBalisesPerso();
      if (!vivant) return;
      appliquerEtat(etat);
    } catch (e: any) {
      if (!vivant) return;
      if (e?.status === 404) disponible = false;
      else notifierErreur($t('common.error' as any), e, { motifSeul: true });
    }
    if (vivant) chargement = false;
  }

  function ajouter(cle = saisie, mode: ModeBalisePerso = 'values') {
    const r = normaliserCle(cle, form.mappings.length);
    if ('refus' in r) {
      refusSaisie = $t(`personalTags.refus.${r.refus}` as any);
      return;
    }
    form.mappings = [...form.mappings, { key: r.cle, mode }];
    if (cle === saisie) saisie = '';
    refusSaisie = null;
  }

  function retirer(i: number) {
    form.mappings = form.mappings.filter((_, j) => j !== i);
    refusLignes = {};
    personnalises = Object.fromEntries(form.mappings.map((c, j) => [j, choixDuSeparateur(c.separator) === 'custom']));
  }

  function touche(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      ajouter();
    }
  }

  async function enregistrer() {
    if (enregistrement) return;
    if (saisie.trim()) ajouter();
    if (refusSaisie) return;
    const refus: Record<number, string> = {};
    form.mappings.forEach((c, i) => {
      const r = refusDe(c);
      if (r) refus[i] = $t(`personalTags.refus.${r}` as any);
    });
    refusLignes = refus;
    if (Object.keys(refus).length) return;
    enregistrement = true;
    try {
      const etat = await api.setBalisesPerso(corpsDe(form));
      if (!vivant) return;
      appliquerEtat(etat);
      notifications.success($t('personalTags.saved' as any));
    } catch (e) {
      if (vivant) notifierErreur($t('common.error' as any), e, { motifSeul: true });
    }
    if (vivant) enregistrement = false;
  }

  async function analyser() {
    if (apercuEnCours) return;
    apercuEnCours = true;
    try {
      const a = await api.getClesBalisesPerso(200);
      if (vivant) apercu = a;
    } catch (e) {
      if (vivant) notifierErreur($t('common.error' as any), e, { motifSeul: true });
    }
    if (vivant) apercuEnCours = false;
  }

  function suivre(a: api.AvancementBalisesPerso) {
    avancement = a;
    if (minuterie) clearTimeout(minuterie);
    minuterie = null;
    if (!a.running || !vivant) return;
    minuterie = setTimeout(async () => {
      try {
        const suivant = await api.getAvancementBalisesPerso();
        if (vivant) suivre(suivant);
      } catch {
        if (vivant) suivre({ ...a, running: false });
      }
    }, 2000);
  }

  async function appliquerBibliotheque() {
    try {
      const r = await api.appliquerBalisesPerso();
      if (vivant && r?.apply) suivre(r.apply);
    } catch (e) {
      if (vivant) notifierErreur($t('common.error' as any), e, { motifSeul: true });
    }
  }

  function texte(cle: string, valeurs: Record<string, string | number>): string {
    let s = $t(cle as any) as string;
    for (const [k, v] of Object.entries(valeurs)) s = s.replace(`{${k}}`, String(v));
    return s;
  }
</script>

<div class="balises-perso" data-balises-perso data-reglage="balises-perso">
  {#if chargement}
    <p class="hint">…</p>
  {:else if !disponible}
    <p class="hint">{$t('personalTags.unavailable' as any)}</p>
  {:else}
    <p class="hint">{$t('personalTags.hint' as any)}</p>
    <p class="hint">{$t('personalTags.levelHint' as any)}</p>

    <div class="lignes" role="list">
      {#each form.mappings as c, i (i)}
        <div class="ligne" role="listitem" data-correspondance={c.key}>
          <span class="cle">{c.key}</span>
          <select aria-label={$t('personalTags.mode' as any)} bind:value={c.mode} data-mode>
            <option value="values">{$t('personalTags.mode.values' as any)}</option>
            <option value="fixed">{$t('personalTags.mode.fixed' as any)}</option>
          </select>
          {#if c.mode === 'fixed'}
            <input type="text" class="valeur" data-tag bind:value={c.tag}
              placeholder={$t('personalTags.tagPlaceholder' as any)} aria-label={$t('personalTags.tag' as any)} />
          {:else}
            <input type="text" class="valeur" data-prefixe bind:value={c.prefix}
              placeholder={$t('personalTags.prefixPlaceholder' as any)} aria-label={$t('personalTags.prefix' as any)} />
            <select aria-label={$t('personalTags.separator' as any)} data-separateur value={choix(i)}
              onchange={(e) => changerSeparateur(i, (e.currentTarget as HTMLSelectElement).value as ChoixSeparateur)}>
              <option value="semicolon">{$t('personalTags.separator.semicolon' as any)}</option>
              <option value="pipe">{$t('personalTags.separator.pipe' as any)}</option>
              <option value="slash">{$t('personalTags.separator.slash' as any)}</option>
              <option value="none">{$t('personalTags.separator.none' as any)}</option>
              <option value="custom">{$t('personalTags.separator.custom' as any)}</option>
            </select>
            {#if choix(i) === 'custom'}
              <input type="text" class="sep" data-separateur-perso bind:value={c.separator} maxlength="8"
                aria-label={$t('personalTags.separatorCustom' as any)} />
            {/if}
          {/if}
          <button type="button" class="retirer" data-retirer
            aria-label={texte('personalTags.remove', { key: c.key })} onclick={() => retirer(i)}>×</button>
          {#if refusLignes[i]}<p class="hint erreur" role="alert">{refusLignes[i]}</p>{/if}
        </div>
      {/each}
      {#if form.mappings.length === 0}
        <p class="hint vide" data-aucune>{$t('personalTags.none' as any)}</p>
      {/if}
    </div>

    <div class="ajout">
      <input type="text" bind:value={saisie} data-saisie placeholder={$t('personalTags.keyPlaceholder' as any)}
        aria-label={$t('personalTags.key' as any)} spellcheck="false" autocapitalize="characters"
        oninput={() => (refusSaisie = null)} onkeydown={touche} />
      <button type="button" class="v2-btn" data-ajouter onclick={() => ajouter()}>{$t('personalTags.add' as any)}</button>
    </div>
    {#if refusSaisie}<p class="hint erreur" role="alert" data-refus>{refusSaisie}</p>{/if}
    {#if suggestionsLibres.length}
      <div class="suggestions" data-suggestions>
        <span class="hint">{$t('personalTags.suggestions' as any)}</span>
        {#each suggestionsLibres as s (s)}
          <button type="button" class="v2-btn petit" data-suggestion={s} onclick={() => ajouter(s)}>{s}</button>
        {/each}
      </div>
    {/if}

    <p class="hint">{$t('personalTags.scanHint' as any)}</p>
    <div class="actions">
      <button class="v2-btn primaire" data-enregistrer disabled={enregistrement || !modifie} onclick={enregistrer}>
        {$t('common.save' as any)}
      </button>
    </div>

    <section class="bloc" data-apercu>
      <h4>{$t('personalTags.preview.title' as any)}</h4>
      <p class="hint">{$t('personalTags.preview.hint' as any)}</p>
      <div class="actions gauche">
        <button class="v2-btn" data-analyser disabled={apercuEnCours} onclick={analyser}>
          {#if apercuEnCours}{$t('personalTags.preview.running' as any)}{:else}{$t('personalTags.preview.run' as any)}{/if}
        </button>
        {#if apercu}
          <label class="coche"><input type="checkbox" bind:checked={voirConnues} data-voir-connues />
            {$t('personalTags.preview.showKnown' as any)}</label>
        {/if}
      </div>
      {#if apercu}
        <p class="hint" data-echantillon>{texte('personalTags.preview.sampled', { n: apercu.sampled_files })}</p>
        {#if clesVisibles.length === 0}
          <p class="hint" data-apercu-vide>{$t('personalTags.preview.empty' as any)}</p>
        {:else}
          <ul class="cles">
            {#each clesVisibles as k (k.key)}
              <li data-cle={k.key}>
                <span class="cle">{k.key}</span>
                <span class="hint">{texte('personalTags.preview.files', { n: k.files })}</span>
                {#if k.known}<span class="badge">{$t('personalTags.preview.known' as any)}</span>{/if}
                <span class="exemples" title={k.forms.join(', ')}>{k.examples.join(' · ')}</span>
                {#if configurees.has(k.key)}
                  <span class="badge" data-deja>{$t('personalTags.preview.configured' as any)}</span>
                {:else}
                  <button type="button" class="v2-btn petit" data-ajouter-cle onclick={() => ajouter(k.key)}>
                    {$t('personalTags.add' as any)}
                  </button>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </section>

    <section class="bloc" data-appliquer>
      <h4>{$t('personalTags.apply.title' as any)}</h4>
      <p class="hint">{$t('personalTags.apply.hint' as any)}</p>
      {#if modifie}<p class="hint" data-non-enregistre>{$t('personalTags.apply.unsaved' as any)}</p>{/if}
      <div class="actions gauche">
        <button class="v2-btn" data-lancer disabled={modifie || !!avancement?.running} onclick={appliquerBibliotheque}>
          {$t('personalTags.apply.run' as any)}
        </button>
      </div>
      {#if avancement?.running}
        <p class="hint" data-avancement role="status">
          {texte('personalTags.apply.running', { done: avancement.processed, total: avancement.total })}
        </p>
        <progress max={Math.max(avancement.total, 1)} value={avancement.processed}></progress>
      {:else if avancement?.finished}
        <p class="hint" data-termine role="status">
          {texte('personalTags.apply.done', { added: avancement.added, removed: avancement.removed })}
        </p>
        {#if avancement.error}<p class="hint erreur">{avancement.error}</p>{/if}
      {/if}
    </section>
  {/if}
</div>

<style>
  .balises-perso { display: flex; flex-direction: column; gap: 12px; }
  .hint { margin: 0; font: 400 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt2); }
  .hint.erreur { color: var(--v2-danger); }
  .lignes { display: flex; flex-direction: column; gap: 8px; }
  .ligne { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .cle {
    font: 600 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-mono, var(--v2-sans)); color: var(--v2-txt);
    padding: 4px 10px; border-radius: var(--v2-r-pill); border: 1px solid var(--v2-line2);
  }
  select, .valeur, .ajout input {
    padding: 8px 10px; border-radius: var(--v2-r-input, 8px); border: 1px solid var(--v2-line2);
    background: var(--v2-bg); color: var(--v2-txt); font: 400 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans);
  }
  .valeur { flex: 1 1 140px; min-width: 0; }
  .retirer {
    border: 0; background: transparent; color: var(--v2-txt2); cursor: pointer;
    font: 600 calc(16px * var(--v2-txt-echelle, 1)) var(--v2-sans); line-height: 1; padding: 0 6px;
  }
  .retirer:hover { color: var(--v2-danger); }
  .ajout { display: flex; gap: 8px; flex-wrap: wrap; }
  .suggestions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .sep { width: 64px; padding: 8px 10px; border-radius: var(--v2-r-input, 8px); border: 1px solid var(--v2-line2);
    background: var(--v2-bg); color: var(--v2-txt); font: 400 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-mono, var(--v2-sans)); }
  .ajout input { flex: 1 1 160px; min-width: 0; text-transform: uppercase; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; align-items: center; }
  .actions.gauche { justify-content: flex-start; }
  .bloc { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--v2-line); padding-top: 12px; }
  .bloc h4 { margin: 0; font: 600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt); }
  .coche { display: inline-flex; gap: 6px; align-items: center; font: 400 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt2); }
  .cles { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .cles li { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .exemples { flex: 1 1 160px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font: 400 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt2); }
  .badge { font: 500 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt2);
    border: 1px solid var(--v2-line2); border-radius: var(--v2-r-pill); padding: 2px 8px; }
  progress { width: 100%; }
</style>
