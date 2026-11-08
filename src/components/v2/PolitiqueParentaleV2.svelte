<script lang="ts">
  /**
   * Contrôle parental, étape 1 — poser, voir et retirer les règles d'UN profil.
   *
   * tune-server-rust#7856 / #7898. Monté sous la ligne du profil dans les
   * Réglages › Profils, pour un administrateur et un AUTRE profil seulement
   * (`peutSuperviser`). Le serveur reste juge : 403 / 409 / 422 sont lus et
   * dits, jamais devinés.
   *
   * Sans règle posée, rien ne change pour le profil : on le dit. Sous les
   * listes, la section `data-parental-etape2` (étape 2, #7974, appliquée par
   * #8046) pose les plages horaires et les budgets d'écoute. Le serveur
   * n'expose aucune route du temps restant : on ne l'affiche pas.
   */
  import { locale, t } from '../../lib/i18n';
  import { dialogs } from '../../lib/stores/dialogs';
  import type { Profile } from '../../lib/stores/profile';
  import {
    artistesDepuisLignes, budgetDepuisSaisie, budgetVersSaisie, BUDGET_JOUR_MAX, BUDGET_SEMAINE_MAX,
    cleErreur, erreurPlage, erreurPlages, ligneArtiste, lignes, lirePolitique, PLAGES_MAX,
    plagesPourServeur, poserPolitique, retirerPolitique,
    type PlageHoraire, type PolitiqueEnregistree, type PolitiqueParentale,
  } from '../../lib/politiqueParentale';

  let { profil }: { profil: Profile } = $props();

  const nomDe = (p: Profile) => p.display_name?.trim() || p.name || '';

  let phase = $state<'charge' | 'pret' | 'echec'>('charge');
  /** #8088 — titres et albums marqués explicites masqués et refusés à la lecture. */
  let masquerExplicite = $state(false);
  /** La politique telle que le serveur la tient ; `null` : aucune règle posée. */
  let posee = $state<PolitiqueEnregistree | null>(null);
  let artistes = $state('');
  let restreindreRadios = $state(false);
  let radios = $state('');
  let restreindrePodcasts = $state(false);
  let podcasts = $state('');
  let plages = $state<PlageHoraire[]>([]);
  let jourH = $state(''); let jourM = $state('');
  let semH = $state(''); let semM = $state('');
  let message = $state('');
  let erreur = $state('');
  let enCours = $state(false);

  function remplir(p: PolitiqueEnregistree | null) {
    posee = p;
    masquerExplicite = p?.politique.masquer_explicite === true;
    const base = p?.politique;
    artistes = (base?.artistes_bloques ?? []).map(ligneArtiste).filter(Boolean).join('\n');
    restreindreRadios = base?.radios_autorisees != null;
    radios = (base?.radios_autorisees ?? []).join('\n');
    restreindrePodcasts = base?.podcasts_autorises != null;
    podcasts = (base?.podcasts_autorises ?? []).join('\n');
    plages = (base?.plages_horaires ?? []).map((x) => ({ jours: [...x.jours], debut: x.debut, fin: x.fin }));
    const j = budgetVersSaisie(base?.budget_quotidien_minutes); jourH = j.h; jourM = j.m;
    const w = budgetVersSaisie(base?.budget_hebdomadaire_minutes); semH = w.h; semM = w.m;
  }

  /** Lundi (1) à dimanche (7), dans la langue de l'interface. */
  const JOURS = [1, 2, 3, 4, 5, 6, 7];
  function nomDuJour(n: number): string {
    try {
      // Le 1er janvier 2024 est un lundi.
      return new Intl.DateTimeFormat($locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, n)));
    } catch { return String(n); }
  }
  function ajouterPlage() {
    if (plages.length >= PLAGES_MAX) return;
    plages = [...plages, { jours: [1, 2, 3, 4, 5], debut: '17:00', fin: '19:00' }];
  }
  function retirerPlage(i: number) { plages = plages.filter((_, k) => k !== i); }
  function basculerJour(i: number, j: number) {
    const x = plages[i];
    x.jours = x.jours.includes(j) ? x.jours.filter((v) => v !== j) : [...x.jours, j];
  }

  const budgetJour = $derived(budgetDepuisSaisie(jourH, jourM, BUDGET_JOUR_MAX, 'parental.budget.errDaily'));
  const budgetSemaine = $derived(budgetDepuisSaisie(semH, semM, BUDGET_SEMAINE_MAX, 'parental.budget.errWeekly'));
  const erreurDePlages = $derived(erreurPlages(plages));
  /** Le premier défaut de saisie de l'étape 2 : bloque l'enregistrement. */
  const defautEtape2 = $derived(erreurDePlages ?? budgetJour.erreur ?? budgetSemaine.erreur);

  async function charger() {
    phase = 'charge'; erreur = '';
    try {
      remplir(await lirePolitique(profil.id));
      phase = 'pret';
    } catch (e) {
      erreur = $t(cleErreur(e) as any);
      phase = 'echec';
    }
  }

  $effect(() => { void profil.id; void charger(); });

  async function enregistrer() {
    if (enCours) return;
    if (defautEtape2) { erreur = $t(defautEtape2 as any); return; }
    enCours = true; erreur = ''; message = '';
    // Le serveur remplace la politique entière : plages et budgets partent avec
    // les listes (voir l'en-tête de `politiqueParentale.ts`).
    const base = posee?.politique;
    const politique: PolitiqueParentale = {
      ...base,
      plages_horaires: plagesPourServeur(plages),
      budget_quotidien_minutes: budgetJour.minutes,
      budget_hebdomadaire_minutes: budgetSemaine.minutes,
      artistes_bloques: artistesDepuisLignes(artistes, base?.artistes_bloques ?? []),
      radios_autorisees: restreindreRadios ? lignes(radios) : null,
      podcasts_autorises: restreindrePodcasts ? lignes(podcasts) : null,
    };
    // #8088 — le champ ne part que s'il dit quelque chose (case cochée, ou
    // déjà posé) : un serveur antérieur refuse tout champ inconnu (422), et
    // une politique sans la case doit rester enregistrable chez lui.
    if (masquerExplicite || base?.masquer_explicite != null) politique.masquer_explicite = masquerExplicite;
    try {
      remplir(await poserPolitique(profil.id, posee?.revision ?? 0, politique));
      message = $t('parental.saved' as any);
    } catch (e: any) {
      erreur = $t(cleErreur(e) as any);
      // Révision périmée ou politique créée entre-temps : on relit, sans perdre le message.
      if (e?.status === 409) { const dit = erreur; await charger(); erreur = dit; }
    }
    enCours = false;
  }

  async function retirer() {
    if (!posee || enCours) return;
    if (!(await dialogs.confirm($t('parental.confirmRemove' as any).replace('{name}', nomDe(profil)), { danger: true }))) return;
    enCours = true; erreur = ''; message = '';
    try {
      await retirerPolitique(profil.id, posee.revision);
      remplir(null);
      message = $t('parental.removed' as any);
    } catch (e: any) {
      erreur = $t(cleErreur(e) as any);
      if (e?.status === 409) { const dit = erreur; await charger(); erreur = dit; }
    }
    enCours = false;
  }

</script>

<section class="parental" data-parental={profil.id} aria-label={$t('parental.title' as any)}>
  {#if phase === 'charge'}
    <p class="note" data-parental-chargement>{$t('common.loading')}</p>
  {:else if phase === 'echec'}
    <p class="err" role="alert" data-parental-erreur>{erreur}</p>
    <button class="lnk" onclick={charger}>{$t('parental.retry' as any)}</button>
  {:else}
    <p class="note" data-parental-etat>
      {posee ? $t('parental.active' as any) : $t('parental.none' as any)}
    </p>

    <label class="champ">
      <span class="lbl">{$t('parental.blockedArtists' as any)}</span>
      <span class="aide">{$t('parental.blockedArtistsHint' as any)}</span>
      <textarea data-parental-artistes rows="4" bind:value={artistes}></textarea>
    </label>

    <div class="champ">
      <label class="coche">
        <input type="checkbox" data-parental-explicite bind:checked={masquerExplicite} />
        <span class="lbl">{$t('parental.hideExplicit' as any)}</span>
      </label>
      <span class="aide">{$t('parental.hideExplicitHint' as any)}</span>
    </div>

    <div class="champ">
      <label class="coche">
        <input type="checkbox" data-parental-radios-restreintes bind:checked={restreindreRadios} />
        <span class="lbl">{$t('parental.radiosOnly' as any)}</span>
      </label>
      <span class="aide">{$t('parental.allowHint' as any)}</span>
      {#if restreindreRadios}
        <textarea data-parental-radios rows="3" bind:value={radios}></textarea>
        {#if lignes(radios).length === 0}<span class="aide avert">{$t('parental.allowEmpty' as any)}</span>{/if}
      {/if}
    </div>

    <div class="champ">
      <label class="coche">
        <input type="checkbox" data-parental-podcasts-restreints bind:checked={restreindrePodcasts} />
        <span class="lbl">{$t('parental.podcastsOnly' as any)}</span>
      </label>
      <span class="aide">{$t('parental.allowHint' as any)}</span>
      {#if restreindrePodcasts}
        <textarea data-parental-podcasts rows="3" bind:value={podcasts}></textarea>
        {#if lignes(podcasts).length === 0}<span class="aide avert">{$t('parental.allowEmpty' as any)}</span>{/if}
      {/if}
    </div>

    <!-- Étape 2 (#7974) : plages horaires et budgets d'écoute. -->
    <div data-parental-etape2 class="etape2">
      <div class="champ">
        <span class="lbl">{$t('parental.hours.title' as any)}</span>
        <span class="aide">{$t('parental.hours.hint' as any)}</span>
        {#each plages as plage, i}
          {@const e = erreurPlage(plage)}
          <div class="plage" data-parental-plage={i}>
            <div class="jours" role="group" aria-label={$t('parental.hours.days' as any)}>
              {#each JOURS as j}
                <label class="jour" class:on={plage.jours.includes(j)}>
                  <input type="checkbox" data-parental-jour={j} checked={plage.jours.includes(j)} onchange={() => basculerJour(i, j)} />
                  {nomDuJour(j)}
                </label>
              {/each}
            </div>
            <div class="heures">
              <label>{$t('parental.hours.from' as any)}
                <input type="time" data-parental-debut bind:value={plage.debut} /></label>
              <label>{$t('parental.hours.to' as any)}
                <input type="time" data-parental-fin bind:value={plage.fin} /></label>
              <button class="lnk danger" data-parental-plage-retirer onclick={() => retirerPlage(i)}>{$t('parental.hours.remove' as any)}</button>
            </div>
            {#if e}<span class="aide avert" data-parental-plage-erreur>{$t(e as any)}</span>{/if}
          </div>
        {/each}
        <div>
          <button class="lnk" data-parental-plage-ajouter disabled={plages.length >= PLAGES_MAX} onclick={ajouterPlage}>{$t('parental.hours.add' as any)}</button>
        </div>
      </div>

      <div class="champ">
        <span class="lbl">{$t('parental.budget.title' as any)}</span>
        <span class="aide">{$t('parental.budget.hint' as any)}</span>
        <div class="budget">
          <span class="lbl2">{$t('parental.budget.daily' as any)}</span>
          <input type="text" inputmode="numeric" data-parental-jour-h bind:value={jourH}
            aria-label={$t('parental.budget.daily' as any) + ' ' + $t('parental.unit.h' as any)} />
          <span>{$t('parental.unit.h' as any)}</span>
          <input type="text" inputmode="numeric" data-parental-jour-m bind:value={jourM}
            aria-label={$t('parental.budget.daily' as any) + ' ' + $t('parental.unit.min' as any)} />
          <span>{$t('parental.unit.min' as any)}</span>
        </div>
        {#if budgetJour.erreur}<span class="aide avert" data-parental-budget-erreur>{$t(budgetJour.erreur as any)}</span>{/if}
        <div class="budget">
          <span class="lbl2">{$t('parental.budget.weekly' as any)}</span>
          <input type="text" inputmode="numeric" data-parental-semaine-h bind:value={semH}
            aria-label={$t('parental.budget.weekly' as any) + ' ' + $t('parental.unit.h' as any)} />
          <span>{$t('parental.unit.h' as any)}</span>
          <input type="text" inputmode="numeric" data-parental-semaine-m bind:value={semM}
            aria-label={$t('parental.budget.weekly' as any) + ' ' + $t('parental.unit.min' as any)} />
          <span>{$t('parental.unit.min' as any)}</span>
        </div>
        {#if budgetSemaine.erreur}<span class="aide avert" data-parental-budget-erreur>{$t(budgetSemaine.erreur as any)}</span>{/if}
      </div>
      <p class="aide">{$t('parental.step2Applies' as any)}</p>
    </div>

    <div class="actions">
      <button class="lnk prim" data-parental-enregistrer disabled={enCours || !!defautEtape2} onclick={enregistrer}>
        {posee ? $t('common.save') : $t('parental.apply' as any)}
      </button>
      {#if posee}
        <button class="lnk danger" data-parental-retirer disabled={enCours} onclick={retirer}>{$t('parental.remove' as any)}</button>
      {/if}
    </div>
    {#if erreur}<p class="err" role="alert" data-parental-erreur>{erreur}</p>{/if}
    {#if message}<p class="ok" role="status" data-parental-message>{message}</p>{/if}
  {/if}
</section>

<style>
  .parental{flex-basis:100%; display:flex; flex-direction:column; gap:12px; padding:12px 4px 4px;
    border-top:1px solid var(--v2-line2)}
  .note{margin:0; font-size:12.5px; line-height:1.5; color:var(--v2-txt3)}
  .champ{display:flex; flex-direction:column; gap:5px}
  .lbl{font:600 12.5px var(--v2-sans); color:var(--v2-txt)}
  .aide{font-size:11.5px; line-height:1.45; color:var(--v2-txt3)}
  .aide.avert{color:var(--v2-danger, #ef4444)}
  .coche{display:flex; align-items:center; gap:8px; cursor:pointer}
  textarea{border-radius:9px; border:1px solid var(--v2-line2); background:var(--v2-bg); color:var(--v2-txt);
    font:13px var(--v2-sans); padding:8px 11px; outline:none; resize:vertical; min-height:64px}
  textarea:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .etape2{display:flex; flex-direction:column; gap:12px}
  .plage{display:flex; flex-direction:column; gap:6px; padding:8px 10px; border:1px solid var(--v2-line2); border-radius:10px}
  .jours{display:flex; flex-wrap:wrap; gap:5px}
  .jour{display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:999px; cursor:pointer;
    border:1px solid var(--v2-line2); font:600 11.5px var(--v2-sans); color:var(--v2-txt2)}
  .jour.on{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .heures,.budget{display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:12.5px; color:var(--v2-txt2)}
  .lbl2{min-width:90px; font:600 12px var(--v2-sans); color:var(--v2-txt)}
  input[type=time],input[type=text]{border-radius:9px; border:1px solid var(--v2-line2); background:var(--v2-bg);
    color:var(--v2-txt); font:13px var(--v2-sans); padding:5px 8px; outline:none}
  .budget input[type=text]{width:64px}
  .actions{display:flex; gap:8px; flex-wrap:wrap}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:999px; padding:6px 13px; font:600 11.5px var(--v2-sans)}
  .lnk:hover:not(:disabled){border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .lnk:disabled{opacity:.45; cursor:default}
  .lnk.prim{background:var(--v2-acc2); border-color:transparent; color:#fff}
  .lnk.danger{color:var(--v2-danger, #ef4444)}
  .err{margin:0; font-size:12px; color:var(--v2-danger, #ef4444)}
  .ok{margin:0; font-size:12px; color:var(--v2-txt2)}
</style>
