<script lang="ts">
  /**
   * Réglages › Bibliothèque › Balises du classique (tune-server-rust#8325,
   * demande ESL63P, testeur HCFR : %band%, %choir%).
   *
   * Pour chaque rôle, les balises que le serveur lit au scan (puces
   * éditables). BAND reste traité par le serveur. Les noms standard (CONDUCTOR, WORK,
   * MOVEMENTNAME) couvrent toutes les graphies d'un conteneur ; tout autre nom
   * est une balise libre (`CHORUS` lit aussi `TXXX:CHORUS`).
   *
   * Aucune écriture au chargement. « Enregistrer » envoie le réglage ;
   * « Revenir aux valeurs par défaut » restaure les rôles visibles. Un changement relance la
   * relecture de fond des fichiers, pas une analyse complète.
   */
  import { onDestroy, onMount } from 'svelte';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';
  import { notifierErreur } from '../../lib/notifierErreur';
  import {
    DEFAUTS_CLASSIQUE, ROLES_CLASSIQUES, copieBalises, memesBalises, normaliserBalise,
    type BalisesClassique, type RoleClassique,
  } from '../../lib/balisesClassique';
  import '../../styles/tune-v2.css';

  let chargement = $state(true);
  /** `false` : serveur d'avant le réglage (404). */
  let disponible = $state(true);
  let enregistrement = $state(false);
  let enBase = $state<BalisesClassique>(copieBalises(DEFAUTS_CLASSIQUE));
  let defauts = $state<BalisesClassique>(copieBalises(DEFAUTS_CLASSIQUE));
  let form = $state<BalisesClassique>(copieBalises(DEFAUTS_CLASSIQUE));
  let saisies = $state<Record<RoleClassique, string>>({ conductor: '', ensemble: '', work: '', movement: '' });
  let refus = $state<Partial<Record<RoleClassique, string>>>({});

  let vivant = true;
  onDestroy(() => { vivant = false; });
  onMount(() => { void charger(); });

  const modifie = $derived(!memesBalises(form, enBase));
  const defautsVisibles = $derived({ ...defauts, band: enBase.band });
  const auxDefauts = $derived(memesBalises(enBase, defautsVisibles) && memesBalises(form, defautsVisibles));

  function appliquer(etat: api.EtatBalisesClassique) {
    if (etat.defaults) defauts = copieBalises(etat.defaults);
    enBase = copieBalises(etat.classical_tags);
    form = copieBalises(etat.classical_tags);
    refus = {};
  }

  async function charger() {
    chargement = true;
    try {
      const etat = await api.getBalisesClassique();
      if (!vivant) return;
      appliquer(etat);
    } catch (e: any) {
      if (!vivant) return;
      if (e?.status === 404) disponible = false;
      else notifierErreur($t('common.error' as any), e, { motifSeul: true });
    }
    if (vivant) chargement = false;
  }

  function ajouter(role: RoleClassique) {
    const r = normaliserBalise(saisies[role], form[role]);
    if ('refus' in r) {
      refus = { ...refus, [role]: $t(`classicalTags.refus.${r.refus}` as any) };
      return;
    }
    form[role] = [...form[role], r.nom];
    saisies[role] = '';
    refus = { ...refus, [role]: undefined };
  }

  function retirer(role: RoleClassique, nom: string) {
    form[role] = form[role].filter((n) => n !== nom);
  }

  function touche(e: KeyboardEvent, role: RoleClassique) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      ajouter(role);
    }
  }

  async function envoyer(corps: Partial<BalisesClassique>) {
    if (enregistrement) return;
    enregistrement = true;
    try {
      const etat = await api.setBalisesClassique(corps);
      if (!vivant) return;
      appliquer(etat);
      notifications.success($t(etat.reread_started ? 'classicalTags.savedReread' as any : 'common.saved' as any));
    } catch (e) {
      if (vivant) notifierErreur($t('common.error' as any), e, { motifSeul: true });
    }
    if (vivant) enregistrement = false;
  }

  /** Le champ change : son refus ne vaut plus. */
  function saisieChangee(role: RoleClassique) {
    if (refus[role]) refus = { ...refus, [role]: undefined };
  }

  function enregistrer() {
    // Les refus se recalculent à partir des seules saisies non vides : un
    // refus resté d'une saisie effacée ne bloque pas l'enregistrement.
    refus = {};
    // Une saisie restée dans un champ compte : on l'ajoute avant d'envoyer.
    for (const role of ROLES_CLASSIQUES) {
      if (saisies[role].trim()) ajouter(role);
    }
    if (Object.values(refus).some(Boolean)) return;
    void envoyer(copieBalises(form));
  }

  function revenirAuxDefauts() {
    void envoyer(copieBalises(defautsVisibles));
  }
</script>

<div class="balises-classique" data-balises-classique data-reglage="balises-classique">
  {#if chargement}
    <p class="hint">…</p>
  {:else if !disponible}
    <p class="hint">{$t('classicalTags.unavailable' as any)}</p>
  {:else}
    <p class="hint">{$t('classicalTags.hint' as any)}</p>

    {#each ROLES_CLASSIQUES as role (role)}
      <div class="champ" data-role={role}>
        <span class="lbl" id="balises-{role}">{$t(`classicalTags.role.${role}` as any)}</span>
        <div class="puces" role="list" aria-labelledby="balises-{role}">
          {#each form[role] as nom (nom)}
            <span class="puce" role="listitem" data-balise={nom}>
              {nom}
              <button type="button" class="retirer" aria-label={$t('classicalTags.remove' as any).replace('{tag}', nom)}
                onclick={() => retirer(role, nom)}>×</button>
            </span>
          {/each}
          {#if form[role].length === 0}
            <span class="hint vide">{$t('classicalTags.noneRead' as any)}</span>
          {/if}
        </div>
        <div class="ajout">
          <input type="text" bind:value={saisies[role]} placeholder={$t('classicalTags.addPlaceholder' as any)}
            aria-label={$t('classicalTags.add' as any)} spellcheck="false" autocapitalize="characters"
            oninput={() => saisieChangee(role)} onkeydown={(e) => touche(e, role)} />
          <button type="button" class="v2-btn" onclick={() => ajouter(role)}>{$t('classicalTags.add' as any)}</button>
        </div>
        {#if refus[role]}<p class="hint erreur" role="alert">{refus[role]}</p>{/if}
      </div>
    {/each}

    <p class="hint">{$t('classicalTags.rereadHint' as any)}</p>

    <div class="actions">
      <button class="v2-btn" data-defauts disabled={enregistrement || auxDefauts} onclick={revenirAuxDefauts}>
        {$t('classicalTags.resetDefaults' as any)}
      </button>
      <button class="v2-btn primaire" data-enregistrer disabled={enregistrement || !modifie} onclick={enregistrer}>
        {$t('common.save' as any)}
      </button>
    </div>
  {/if}
</div>

<style>
  .balises-classique { display: flex; flex-direction: column; gap: 12px; }
  .hint { margin: 0; font: 400 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt2); }
  .hint.erreur { color: var(--v2-danger); }
  .champ { display: flex; flex-direction: column; gap: 6px; }
  .lbl { font: 500 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt); }
  .puces { display: flex; flex-wrap: wrap; gap: 6px; min-height: 28px; align-items: center; }
  .puce {
    display: inline-flex; align-items: center; gap: 4px; padding: 4px 6px 4px 10px;
    border-radius: var(--v2-r-pill); border: 1px solid var(--v2-line2); color: var(--v2-txt);
    font: 600 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-mono, var(--v2-sans));
  }
  .retirer {
    border: 0; background: transparent; color: var(--v2-txt2); cursor: pointer;
    font: 600 calc(14px * var(--v2-txt-echelle, 1)) var(--v2-sans); line-height: 1; padding: 0 4px;
  }
  .retirer:hover { color: var(--v2-danger); }
  .ajout { display: flex; gap: 8px; flex-wrap: wrap; }
  .ajout input {
    flex: 1 1 160px; min-width: 0; padding: 9px 11px; border-radius: var(--v2-r-input, 8px);
    border: 1px solid var(--v2-line2); background: var(--v2-bg); color: var(--v2-txt);
    font: 400 calc(14px * var(--v2-txt-echelle, 1)) var(--v2-sans); text-transform: uppercase;
  }
  .actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
</style>
