<script lang="ts">
  /**
   * Réglages > Système > « Activer l'authentification ».
   *
   * Tant que l'authentification est désactivée, tout appareil du réseau peut
   * piloter Tune, et certaines actions (redémarrer, arrêter, installer un
   * greffon…) ne sont acceptées que depuis la machine qui fait tourner Tune.
   * Activer l'authentification pose le mot de passe du compte administrateur.
   *
   * Le serveur ne l'accepte que depuis cette machine, ou avec un code à usage
   * unique qu'il écrit dans son journal : celui qui active doit avoir accès à
   * la machine. Une fois active, l'écran le dit.
   *
   * rc14 — une fois active, un administrateur connecté (ou la machine de
   * Tune) peut la DÉSACTIVER ici, après une confirmation dans la page : les
   * remotes iPhone et Android, qui ne savent pas encore se connecter, se
   * reconnectent. `POST /auth/config {"auth_enabled": false}`, jeton
   * administrateur ; l'écran suit la réponse du serveur.
   */
  import { t } from '../../lib/i18n';
  import {
    activateAuth,
    disableAuth,
    getAuthMe,
    getAuthActivation,
    requestAuthActivationCode,
    type EtatActivationAuth,
  } from '../../lib/api';
  import { setToken, signalerChangementDeSession } from '../../lib/auth';
  import { notifications } from '../../lib/stores/notifications';
  import {
    activationPossible,
    cleDuRefusDesactivation,
    desactivationOfferte,
    cleDuRefusActivation,
    cleDeLaDemandeDeCode,
    comptesASupprimer,
    dateDeCreation,
    segmentsAvecCode,
  } from '../../lib/activationAuth';

  let etat = $state<EtatActivationAuth | null>(null);
  let charge = $state(false);
  let motDePasse = $state('');
  let confirmation = $state('');
  let code = $state('');
  let codeDemande = $state(false);
  /** Ce que le serveur a répondu à la dernière demande de code. */
  let messageCode = $state('authActivation.codeSent');
  let enCours = $state(false);
  let refus = $state<string | null>(null);
  /** Comptes cochés pour suppression (jamais l'administrateur). */
  let coches = $state<Set<number>>(new Set());
  /** La confirmation dans la page, quand des comptes seront supprimés. */
  let confirmation_suppression = $state(false);

  function basculer(id: number, oui: boolean) {
    const s = new Set(coches);
    if (oui) s.add(id); else s.delete(id);
    coches = s;
    confirmation_suppression = false;
  }
  let aSupprimer = $derived(comptesASupprimer(etat?.accounts, coches));

  /** Rôle de la session (`GET /auth/me`), lu quand l'authentification est active. */
  let role = $state<unknown>(undefined);
  /** La confirmation de la désactivation, affichée dans la page. */
  let confirmerDesactivation = $state(false);
  let refusDesactivation = $state<string | null>(null);

  async function lireRole() {
    try {
      const moi = await getAuthMe();
      role = moi && typeof moi === 'object' ? moi.role : undefined;
    } catch {
      role = undefined;
    }
  }

  async function charger() {
    try {
      etat = await getAuthActivation();
      if (etat?.auth_enabled) await lireRole();
    } catch {
      etat = null;
    } finally {
      charge = true;
    }
  }
  $effect(() => { void charger(); });

  let peutDesactiver = $derived(desactivationOfferte(etat, role));

  /** Premier geste : montre la confirmation dans la page, n'envoie rien. */
  function demanderDesactivation() {
    if (enCours || !etat?.auth_enabled) return;
    refusDesactivation = null;
    confirmerDesactivation = true;
  }

  /**
   * Second geste, sur un bouton DISTINCT placé dans l'avertissement : un
   * double clic sur « Désactiver » ne peut pas valoir confirmation.
   */
  async function desactiver() {
    if (enCours) return;
    if (!etat?.auth_enabled || !confirmerDesactivation) return;
    enCours = true;
    refusDesactivation = null;
    try {
      const r = await disableAuth();
      const cle = cleDuRefusDesactivation(r);
      if (cle) {
        refusDesactivation = cle;
        return;
      }
      // L'état affiché est celui que le serveur rend.
      etat = { ...etat, auth_enabled: r.auth_enabled === true };
      confirmerDesactivation = false;
      notifications.success($t('authActivation.disabled' as any), 8000);
      await charger();
    } catch {
      refusDesactivation = 'authActivation.disableError';
    } finally {
      enCours = false;
    }
  }

  let longueurMin = $derived(etat?.min_password_length ?? 8);
  let pret = $derived(
    !!etat && activationPossible(motDePasse, confirmation, code, etat.code_required, longueurMin),
  );

  async function demanderCode() {
    refus = null;
    try {
      const r = await requestAuthActivationCode();
      messageCode = cleDeLaDemandeDeCode(r);
      codeDemande = true;
    } catch {
      refus = 'authActivation.error';
    }
  }

  async function activer() {
    if (!etat || !pret) return;
    // Supprimer des comptes : on le confirme dans la page, jamais d'office.
    if (aSupprimer.length && !confirmation_suppression) {
      confirmation_suppression = true;
      return;
    }
    enCours = true;
    refus = null;
    try {
      const r = await activateAuth(
        motDePasse,
        etat.code_required ? code.trim() : undefined,
        aSupprimer.map((c) => c.id),
      );
      const cle = cleDuRefusActivation(r);
      if (cle) {
        refus = cle;
        if (r?.error === 'auth_already_enabled') await charger();
        return;
      }
      if (r.token) setToken(r.token);
      // rc14 — les droits ont changé (authentification active) : les écrans
      // qui grisent des actions se relisent, même sans jeton rendu.
      else signalerChangementDeSession();
      motDePasse = '';
      confirmation = '';
      code = '';
      coches = new Set();
      confirmation_suppression = false;
      if (r.deleted_accounts?.length) {
        notifications.success($t('authActivation.accountsDeleted' as any).replace('{count}', String(r.deleted_accounts.length)), 8000);
      }
      notifications.success($t('authActivation.done' as any).replace('{user}', r.username ?? ''), 8000);
      await charger();
    } catch {
      refus = 'authActivation.error';
    } finally {
      enCours = false;
    }
  }
</script>

<div class="activation-auth" data-activation-auth>
  {#if !charge}
    <p class="hint">{$t('authActivation.loading' as any)}</p>
  {:else if !etat}
    <p class="hint" data-activation-indisponible>{$t('authActivation.unavailable' as any)}</p>
  {:else if etat.auth_enabled}
    <p class="hint" data-activation-active>{$t('authActivation.enabled' as any)}</p>
    {#if peutDesactiver}
      {#if confirmerDesactivation}
        <div class="bloc confirmer" data-desactivation-confirmation>
          <p class="hint err" data-desactivation-avertissement>{$t('authActivation.disableConfirm' as any)}</p>
          <div class="inline">
            <button class="lnk danger" type="button" data-desactivation-confirmer onclick={desactiver} disabled={enCours}>
              {$t('authActivation.confirmAndDisable' as any)}
            </button>
            <button class="lnk" type="button" data-desactivation-annuler onclick={() => (confirmerDesactivation = false)} disabled={enCours}>
              {$t('authActivation.cancel' as any)}
            </button>
          </div>
        </div>
      {:else}
        <div class="inline">
          <button class="lnk" type="button" data-desactivation-desactiver onclick={demanderDesactivation} disabled={enCours}>
            {$t('authActivation.disable' as any)}
          </button>
        </div>
      {/if}
    {/if}
    {#if refusDesactivation}<p class="hint err" data-desactivation-refus>{$t(refusDesactivation as any)}</p>{/if}
  {:else}
    <p class="hint">{$t('authActivation.intro' as any)}</p>
    {#if etat.admin_username}
      <p class="hint">{$t('authActivation.adminAccount' as any).replace('{user}', etat.admin_username)}</p>
    {/if}

    {#if etat.code_required}
      <div class="bloc" data-activation-code>
        <p class="hint">{$t('authActivation.codeIntro' as any)}</p>
        <!-- rc14 (recette du 24/11, point 7) : où lire le code, commandes exactes. -->
        <p class="hint ou-lire" data-activation-code-ou>
          {#each segmentsAvecCode($t('authActivation.codeWhere' as any)) as seg}{#if seg.code}<code>{seg.texte}</code>{:else}{seg.texte}{/if}{/each}
        </p>
        <div class="inline">
          <button class="lnk" type="button" data-activation-demander-code onclick={demanderCode} disabled={enCours}>
            {#if codeDemande}{$t('authActivation.codeAgain' as any)}{:else}{$t('authActivation.codeRequest' as any)}{/if}
          </button>
        </div>
        {#if codeDemande}
          <p class="hint" data-activation-code-envoye>{$t(messageCode as any)}</p>
        {/if}
        <label class="lbl" for="activation-auth-code">{$t('authActivation.codeLabel' as any)}</label>
        <input id="activation-auth-code" class="txt code" type="text" autocomplete="one-time-code"
          spellcheck="false" bind:value={code} disabled={enCours} />
      </div>
    {:else}
      <p class="hint" data-activation-cette-machine>{$t('authActivation.thisMachine' as any)}</p>
    {/if}

    {#if etat.accounts?.length}
      <div class="bloc" data-activation-comptes>
        <p class="lbl">{$t('authActivation.accountsTitle' as any)}</p>
        <p class="hint">{$t('authActivation.accountsIntro' as any)}</p>
        <ul class="comptes">
          {#each etat.accounts as c (c.id)}
            <li data-activation-compte={c.username}>
              {#if c.deletable}
                <label class="compte">
                  <input type="checkbox" checked={coches.has(c.id)} disabled={enCours}
                    onchange={(e) => basculer(c.id, (e.currentTarget as HTMLInputElement).checked)} />
                  <span class="nom">{c.username}</span>
                  <span class="hint">{$t('authActivation.accountUser' as any)}</span>
                  {#if c.created_at}<span class="hint">{$t('authActivation.accountCreated' as any).replace('{date}', dateDeCreation(c.created_at))}</span>{/if}
                </label>
              {:else}
                <span class="compte">
                  <span class="nom">{c.username}</span>
                  <span class="hint">{$t('authActivation.accountAdmin' as any)}</span>
                  {#if c.created_at}<span class="hint">{$t('authActivation.accountCreated' as any).replace('{date}', dateDeCreation(c.created_at))}</span>{/if}
                </span>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <label class="lbl" for="activation-auth-mdp">{$t('authActivation.password' as any)}</label>
    <input id="activation-auth-mdp" class="txt" type="password" autocomplete="new-password"
      bind:value={motDePasse} disabled={enCours} />
    <label class="lbl" for="activation-auth-confirmation">{$t('authActivation.passwordConfirm' as any)}</label>
    <input id="activation-auth-confirmation" class="txt" type="password" autocomplete="new-password"
      bind:value={confirmation} disabled={enCours}
      onkeydown={(e) => { if (e.key === 'Enter') activer(); }} />
    <p class="hint">{$t('authActivation.passwordHint' as any).replace('{min}', String(longueurMin))}</p>
    {#if confirmation && motDePasse !== confirmation}
      <p class="hint err">{$t('authActivation.passwordMismatch' as any)}</p>
    {/if}
    {#if confirmation_suppression && aSupprimer.length}
      <div class="bloc confirmer" data-activation-confirmer-suppression>
        <p class="hint err">{$t('authActivation.deleteConfirm' as any).replace('{count}', String(aSupprimer.length)).replace('{names}', aSupprimer.map((c) => c.username).join(', '))}</p>
      </div>
    {/if}
    <div class="inline">
      <button class="lnk" class:danger={confirmation_suppression} type="button" data-activation-activer onclick={activer} disabled={!pret || enCours}>
        {#if confirmation_suppression}{$t('authActivation.confirmAndEnable' as any)}{:else}{$t('authActivation.enable' as any)}{/if}
      </button>
      {#if confirmation_suppression}
        <button class="lnk" type="button" data-activation-annuler onclick={() => (confirmation_suppression = false)} disabled={enCours}>
          {$t('authActivation.cancel' as any)}
        </button>
      {/if}
    </div>
    {#if refus}<p class="hint err" data-activation-refus>{$t(refus as any)}</p>{/if}
  {/if}
</div>

<style>
  .activation-auth { display: flex; flex-direction: column; gap: 6px; }
  .activation-auth .bloc { display: flex; flex-direction: column; gap: 6px; }
  .activation-auth .inline { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .activation-auth .code { text-transform: uppercase; letter-spacing: 0.08em; max-width: 16em; }
  .activation-auth .txt { max-width: 24em; }
  .activation-auth .hint { margin: 0; }
  .activation-auth .ou-lire code { font-family: var(--font-mono, monospace); font-size: 0.92em; overflow-wrap: anywhere; user-select: all; }
  .activation-auth .comptes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .activation-auth .compte { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .activation-auth .compte .nom { font-weight: 600; }
</style>
