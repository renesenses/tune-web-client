<script lang="ts">
  /**
   * Réglages › Système › Authentification du serveur (web#3195, go de
   * Bertrand du 18/11/2026).
   *
   * Le refus des actions machine (« Éteindre », rc12) disait « activez
   * l'authentification », et aucun écran ne savait le faire. Celui-ci le fait,
   * aux conditions du serveur (tune-server-rust, `auth::activation`) :
   *
   *  - activer exige un administrateur AVEC mot de passe — l'écran propose de
   *    le créer quand il n'y en a pas (`admin_with_password`) ;
   *  - depuis un autre appareil que la machine du serveur (`this_machine`
   *    faux), il faut le CODE D'ACTIVATION que le serveur écrit dans un fichier
   *    de son dossier de données : le réseau ne le lit pas, le propriétaire si ;
   *  - une case de confirmation explicite ; la réponse ouvre la session de
   *    l'administrateur (jeton posé par `activerAuthServeur`) : on ne
   *    s'enferme pas dehors ;
   *  - désactiver : administrateur connecté, confirmation danger.
   *
   * La voie de secours (mot de passe perdu) est toujours affichée.
   */
  import { onDestroy, onMount } from 'svelte';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { dialogs } from '../../lib/stores/dialogs';
  import { notifications } from '../../lib/stores/notifications';
  import { notifierErreur } from '../../lib/notifierErreur';
  import '../../styles/tune-v2.css';

  let etat = $state<api.EtatAuthServeur | null>(null);
  let chargement = $state(true);
  let occupe = $state(false);
  /** Le formulaire d'activation est ouvert (interrupteur basculé). */
  let formulaire = $state(false);
  /** Créer un administrateur (sinon : s'identifier avec un administrateur existant). */
  let creer = $state(false);
  let nom = $state('admin');
  let mdp = $state('');
  let mdp2 = $state('');
  let code = $state('');
  let fichierCode = $state<string | null>(null);
  let confirme = $state(false);
  let erreur = $state('');

  let vivant = true;
  onDestroy(() => { vivant = false; });
  onMount(() => { void charger(); });

  /** Serveur d'avant #3195 : il ne publie pas `admin_with_password`. */
  const disponible = $derived(etat !== null && typeof etat.admin_with_password === 'boolean');
  const active = $derived(etat?.auth_enabled === true);
  const besoinDuCode = $derived(etat !== null && etat.this_machine !== true);

  async function charger() {
    chargement = true;
    try {
      const e = await api.getEtatAuthServeur();
      if (!vivant) return;
      etat = e;
      creer = e.admin_with_password !== true;
    } catch (e) {
      if (vivant) notifierErreur($t('common.error' as any), e, { motifSeul: true });
    }
    if (vivant) chargement = false;
  }

  function basculer(caseACocher: HTMLInputElement) {
    // La case suit l'ÉTAT du serveur, pas le clic : elle ne change qu'au
    // retour de l'opération (ou à l'ouverture du formulaire).
    if (active) { caseACocher.checked = true; void desactiver(); return; }
    formulaire = !formulaire;
    erreur = '';
  }

  async function demanderCode() {
    erreur = '';
    try {
      const r = await api.demanderCodeActivation();
      if (vivant) fichierCode = r.file;
    } catch (e: any) {
      if (vivant) erreur = e?.message ?? String(e);
    }
  }

  async function activer() {
    erreur = '';
    if (creer && mdp.length < 8) { erreur = $t('authServeur.motDePasseCourt' as any); return; }
    if (creer && mdp !== mdp2) { erreur = $t('authServeur.motsDePasseDifferents' as any); return; }
    if (!confirme) return;
    occupe = true;
    try {
      await api.activerAuthServeur({
        username: nom.trim(),
        password: mdp,
        confirm: true,
        create_admin: creer,
        activation_code: besoinDuCode ? code.trim() : undefined,
      });
      if (!vivant) return;
      notifications.success($t('authServeur.activee' as any));
      formulaire = false;
      mdp = ''; mdp2 = ''; code = ''; confirme = false; fichierCode = null;
      await charger();
    } catch (e: any) {
      if (!vivant) return;
      erreur = e?.message ?? String(e);
      // Le serveur ne connaît pas l'administrateur : passer en création.
      if (e?.code === 'admin_password_required') creer = true;
    }
    if (vivant) occupe = false;
  }

  async function desactiver() {
    if (!(await dialogs.confirm($t('authServeur.confirmDesactiver' as any), { danger: true }))) return;
    occupe = true;
    try {
      await api.desactiverAuthServeur();
      if (!vivant) return;
      notifications.success($t('authServeur.desactivee' as any));
      await charger();
    } catch (e) {
      if (vivant) notifierErreur($t('common.error' as any), e, { motifSeul: true });
    }
    if (vivant) occupe = false;
  }
</script>

<div class="auth-serveur" data-reglage="authentification-serveur">
  {#if chargement && !etat}
    <p class="hint">…</p>
  {:else if !disponible}
    <p class="hint" data-auth-indisponible>{$t('authServeur.indisponible' as any)}</p>
  {:else}
    <p class="hint">{$t('authServeur.hint' as any)}</p>
    <label class="ligne">
      <input type="checkbox" checked={active || formulaire} disabled={occupe}
        data-auth-interrupteur onchange={(e) => basculer(e.currentTarget)} />
      <span>{$t('authServeur.interrupteur' as any)}</span>
    </label>
    <p class="hint etat" data-auth-etat={active ? 'active' : 'inactive'}>
      {active ? $t('authServeur.etatActive' as any) : $t('authServeur.etatInactive' as any)}
    </p>

    {#if formulaire && !active}
      <form class="activation" data-auth-formulaire onsubmit={(e) => { e.preventDefault(); void activer(); }}>
        <p class="lbl">{creer ? $t('authServeur.creerTitre' as any) : $t('authServeur.connexionTitre' as any)}</p>
        <label class="champ">
          <span class="lbl">{$t('authServeur.nom' as any)}</span>
          <input type="text" bind:value={nom} autocomplete="username" required data-auth-nom />
        </label>
        <label class="champ">
          <span class="lbl">{$t('authServeur.motDePasse' as any)}</span>
          <input type="password" bind:value={mdp} data-auth-mdp
            autocomplete={creer ? 'new-password' : 'current-password'} required />
        </label>
        {#if creer}
          <label class="champ">
            <span class="lbl">{$t('authServeur.motDePasse2' as any)}</span>
            <input type="password" bind:value={mdp2} autocomplete="new-password" required data-auth-mdp2 />
          </label>
        {/if}
        {#if etat?.admin_with_password}
          <button type="button" class="v2-btn" data-auth-bascule-mode onclick={() => { creer = !creer; erreur = ''; }}>
            {creer ? $t('authServeur.utiliserExistant' as any) : $t('authServeur.creerAutre' as any)}
          </button>
        {/if}

        {#if besoinDuCode}
          <div class="code" data-auth-code>
            <p class="hint">{$t('authServeur.codeTitre' as any)}</p>
            <button type="button" class="v2-btn" data-auth-demander-code onclick={demanderCode}>{$t('authServeur.codeDemander' as any)}</button>
            {#if fichierCode}
              <p class="hint" data-auth-fichier-code>{$t('authServeur.codeEcrit' as any).replace('{file}', fichierCode)}</p>
            {/if}
            <label class="champ">
              <span class="lbl">{$t('authServeur.codeSaisie' as any)}</span>
              <input type="text" bind:value={code} autocomplete="one-time-code" spellcheck="false" required data-auth-saisie-code />
            </label>
          </div>
        {/if}

        <label class="ligne">
          <input type="checkbox" bind:checked={confirme} data-auth-confirmer />
          <span>{$t('authServeur.confirmer' as any)}</span>
        </label>
        {#if erreur}<p class="erreur" role="alert" data-auth-erreur>{erreur}</p>{/if}
        <div class="actions">
          <button type="submit" class="v2-btn primary" disabled={!confirme || occupe} data-auth-activer>
            {$t('authServeur.activer' as any)}
          </button>
        </div>
      </form>
    {/if}

    <details class="secours" data-auth-secours>
      <summary class="lbl">{$t('authServeur.secoursTitre' as any)}</summary>
      <p class="hint">{$t('authServeur.secours' as any).replace('{file}', etat?.recovery_file ?? '')}</p>
      {#if etat?.data_dir}
        <p class="hint" data-auth-dossier>{$t('authServeur.secoursDossier' as any).replace('{dir}', etat.data_dir)}</p>
      {/if}
    </details>
  {/if}
</div>

<style>
  .auth-serveur, .activation { display: flex; flex-direction: column; gap: 12px; }
  .activation { padding: 12px; border: 1px solid var(--v2-line2); border-radius: var(--v2-r-input, 8px); }
  .hint { margin: 0; font: 400 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt2); }
  .champ, .code { display: flex; flex-direction: column; gap: 6px; }
  .lbl { margin: 0; font: 500 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt); }
  .ligne { display: flex; align-items: flex-start; gap: 8px; font: 400 calc(14px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt); cursor: pointer; }
  .champ input {
    padding: 9px 11px; border-radius: var(--v2-r-input, 8px); border: 1px solid var(--v2-line2);
    background: var(--v2-bg); color: var(--v2-txt); font: 400 calc(14px * var(--v2-txt-echelle, 1)) var(--v2-sans);
    max-width: 360px;
  }
  .erreur { margin: 0; color: var(--v2-danger, #d33); font: 500 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); }
  .actions { display: flex; justify-content: flex-end; gap: 8px; }
  .secours summary { cursor: pointer; }
  [data-auth-fichier-code], [data-auth-dossier] { word-break: break-all; }
</style>
