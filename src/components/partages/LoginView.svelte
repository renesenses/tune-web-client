<script lang="ts">
  import { setToken } from '../../lib/auth';
  import { onMount } from 'svelte';
  import { t, locale } from '../../lib/i18n';
  import { messageErreurConnexion, messageErreurReinitialisation } from '../../lib/erreurConnexion';
  import { notifications } from '../../lib/stores/notifications';
  import { activeView } from '../../lib/stores/navigation';
  import { baseApi, entetesRelais, urlRessourcePublique, viaRelais } from '../../lib/bridge';

  /**
   * `true` quand l'écran est monté EN CALQUE par-dessus l'interface
   * (session expirée, #1021) et non comme une vue à part entière.
   *
   * 🔴 Il ne change qu'une chose, et elle compte : en calque, une
   * connexion réussie ne repart PAS à l'accueil. Le calque se retire tout
   * seul — `setToken()` rabaisse le drapeau — et l'utilisateur retrouve
   * l'écran qu'il avait sous les yeux. Poser `activeView` à `'home'` ici
   * aurait jeté la file d'attente et la recherche en cours, c'est-à-dire
   * précisément le contexte que le calque est là pour préserver.
   */
  let { surCouche = false }: { surCouche?: boolean } = $props();

  // 🔴 PAS `'/api/v1'` en dur : servie par le relais (`/{server_id}/`), la
  // connexion doit passer par `/api/relay/{id}` avec `X-Bridge-Token`, sinon
  // le pont répond 405 (« Erreur 405 », essai en 5G du 09/10/2026).
  const BASE = baseApi();
  const LOGO = urlRessourcePublique('tune-logo.png');

  // 🔴 rc14 — cet écran demande le compte LOCAL du serveur Tune, pas le compte
  // mozaiklabs.fr (trois testeurs s'y sont trompés le 24/11, fils 3061 et
  // 3067). Depuis la rc14 le profil administrateur s'appelle `admin` (`default`
  // reste accepté par le serveur comme ALIAS) ; avant, il s'appelait `default`
  // et `admin` échoue. Le serveur se reconnaît à `GET /auth/activation` (public) :
  // seul un serveur rc14 y publie `max_password_length`. Le champ démarre donc
  // VIDE (aide + `admin` en consigne) et se pré-remplit à la réponse, SI
  // l'utilisateur n'a encore rien tapé :
  //   - serveur rc14        → `admin` ;
  //   - serveur plus ancien → `default` (le seul nom qui y marche) ;
  //   - relais / sonde en échec → vide : jamais de nom faux pré-rempli.
  // Un identifiant déjà utilisé avec succès sur cet appareil l'emporte toujours.
  //
  // Le bouton « Connexion avec mozaiklabs.fr » n'est plus proposé ici : avant
  // toute session, `/cloud/sso/authorize` répond « authentication required »
  // (relier un compte exige l'administrateur quand l'authentification est
  // active). Le geste vit dans Réglages ▸ Système ▸ Cloud et dans le menu de
  // l'avatar, une fois connecté.
  const CLE_IDENTIFIANT = 'tune_login_identifiant';
  function identifiantInitial(): string {
    try {
      const memorise = localStorage.getItem(CLE_IDENTIFIANT);
      if (memorise && memorise.trim()) return memorise;
    } catch {}
    return '';
  }
  function memoriserIdentifiant(identifiant: string) {
    try { localStorage.setItem(CLE_IDENTIFIANT, identifiant); } catch {}
  }

  // Mode: 'login', 'register' ou 'reinitialiser' (mot de passe administrateur
  // oublié, rc14).
  let mode = $state<'login' | 'register' | 'reinitialiser'>('login');

  // ── Mot de passe administrateur oublié (rc14) ──────────────────────────────
  // La récupération se fait SUR LA MACHINE du serveur : le serveur n'accepte
  // `POST /auth/admin/reinitialiser` que de là (pas d'autre adresse, pas de
  // mandataire, pas de relais). `GET /auth/activation` (public) dit si cet
  // écran est ouvert depuis cette machine ; le serveur reste juge, l'écran ne
  // fait que ne pas proposer un formulaire voué au refus.
  // 🔴 Ni le code ni les mots de passe ne sont journalisés, ni gardés : ils ne
  // vivent que dans ces trois variables, vidées dès la réponse reçue.
  let depuisCetteMachine = $state(false);
  // Version du serveur d'après `/auth/activation` : `null` = inconnue (relais,
  // sonde en échec) → consigne neutre.
  let versionServeur = $state<'rc14' | 'ancien' | null>(null);
  const cleConsigne = $derived(
    versionServeur === 'rc14' ? 'login.identifierHelp'
      : versionServeur === 'ancien' ? 'login.identifierHelpDefault'
      : 'login.identifierHelpNeutral',
  );
  let resetCode = $state('');
  let resetMotDePasse = $state('');
  let resetConfirmation = $state('');

  // Les commandes sont identiques à celles du guide (section 9). Windows n'en a
  // pas : une entrée du menu Démarrer.
  const LONGUEUR_MIN = 8;
  const commandes = $derived.by(() => {
    const flag = $locale === 'fr' ? '--reinitialiser-admin' : '--reset-admin';
    const stdin = $locale === 'fr' ? '--mot-de-passe-stdin' : '--password-stdin';
    return {
      mac: `tune-server ${flag}`,
      linux: `sudo -u tune sh -c 'cd /var/lib/tune && set -a && . /etc/default/tune-server && exec /opt/tune/tune-server ${flag}'`,
      docker: `docker exec -it -u tune tune-server /app/tune-server ${flag} ${stdin}`,
      // Sous le compte `tune` (celui du service, propriétaire de tune.db), SANS
      // sudo : root est refusé par le serveur sur une base qui n'est pas à lui.
      tuneOs: `cd /opt/tune && TUNE_DATA_DIR=/opt/tune/data ./tune-server ${flag} ${stdin}`,
    };
  });

  onMount(() => {
    // Derrière le relais : AUCUN appel avant la connexion. `/auth/activation`
    // n'est pas une route relayable (la garde du serveur répondrait 403) et la
    // récupération est locale uniquement : le formulaire reste masqué, la
    // commande et l'avertissement restent affichés.
    if (viaRelais()) return;
    let vivant = true;
    (async () => {
      try {
        const r = await fetch(`${BASE}/auth/activation`, { headers: { ...entetesRelais() } });
        if (!r.ok) return;
        const etat = await r.json();
        if (!vivant || !etat) return;
        if (etat.from_this_machine === true) depuisCetteMachine = true;
        // Pré-remplissage selon la version (voir plus haut) : seulement si le
        // champ est encore vide, donc jamais par-dessus une saisie ou une valeur mémorisée.
        const rc14 = typeof etat.max_password_length === 'number';
        versionServeur = rc14 ? 'rc14' : 'ancien';
        if (!loginEmail.trim()) loginEmail = rc14 ? 'admin' : 'default';
      } catch {
        // Serveur injoignable ou ancien : pas de formulaire, la commande reste affichée.
      }
    })();
    return () => { vivant = false; };
  });

  function ouvrirReinitialisation() {
    mode = 'reinitialiser';
    error = '';
  }

  function quitterReinitialisation() {
    resetCode = '';
    resetMotDePasse = '';
    resetConfirmation = '';
    mode = 'login';
    error = '';
  }

  async function handleReinitialiser() {
    error = '';
    const code = resetCode.replace(/\s+/g, '').toUpperCase();
    if (!code) {
      error = $t('login.fillAll' as any);
      return;
    }
    if (resetMotDePasse.length < LONGUEUR_MIN) {
      error = $t('login.resetPasswordTooShort' as any);
      return;
    }
    if (resetMotDePasse !== resetConfirmation) {
      error = $t('login.resetMismatch' as any);
      return;
    }
    loading = true;
    try {
      const resp = await fetch(`${BASE}/auth/admin/reinitialiser`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...entetesRelais() },
        body: JSON.stringify({ code, nouveau_mot_de_passe: resetMotDePasse }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        error = messageErreurReinitialisation(resp.status, body, (cle) => $t(cle as any));
        loading = false;
        return;
      }
      const data = await resp.json().catch(() => ({}));
      const jeton = data?.token || data?.access_token;
      if (jeton) {
        resetCode = '';
        resetMotDePasse = '';
        resetConfirmation = '';
        setToken(jeton);
        notifications.success($t('login.resetDone' as any));
        if (!surCouche) activeView.set('home');
      } else {
        error = $t('login.unexpectedResponse' as any);
      }
    } catch (e: any) {
      error = e?.message || $t('login.networkError' as any);
    }
    loading = false;
  }

  // Login form
  let loginEmail = $state(identifiantInitial());
  let loginPassword = $state('');
  /** rc14 — « Rester connecté », décoché par défaut. */
  let resterConnecte = $state(false);

  // Register form
  let regUsername = $state('');
  let regEmail = $state('');
  let regPassword = $state('');

  let error = $state('');
  let loading = $state(false);

  async function handleLogin() {
    error = '';
    if (!loginEmail.trim() || !loginPassword.trim()) {
      error = $t('login.fillAll' as any);
      return;
    }
    loading = true;
    try {
      const resp = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...entetesRelais() },
        // rc14 — « Rester connecté », DÉCOCHÉ par défaut (revue de sécurité :
        // un ordinateur partagé ne doit pas garder une session sans fin).
        // Coché : session de 30 jours glissants (90 au plus) et jeton de
        // renouvellement. Décoché, ou serveur antérieur : 24 h, comme avant.
        body: JSON.stringify(
          resterConnecte
            ? { username: loginEmail.trim(), password: loginPassword, remember: true }
            : { username: loginEmail.trim(), password: loginPassword },
        ),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        error = messageErreurConnexion(resp.status, body, (cle) => $t(cle as any));
        loading = false;
        return;
      }
      const data = await resp.json();
      if (data.token || data.access_token) {
        memoriserIdentifiant(loginEmail.trim());
        // rc14 — le jeton de renouvellement (absent d'un serveur antérieur).
        setToken(data.token || data.access_token, data.refresh_token);
        if (!surCouche) activeView.set('home');
      } else {
        error = $t('login.unexpectedResponse' as any);
      }
    } catch (e: any) {
      error = e?.message || $t('login.networkError' as any);
    }
    loading = false;
  }

  async function handleRegister() {
    error = '';
    if (!regUsername.trim() || !regEmail.trim() || !regPassword.trim()) {
      error = $t('login.fillAll' as any);
      return;
    }
    loading = true;
    try {
      const resp = await fetch(`${BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...entetesRelais() },
        body: JSON.stringify({
          username: regUsername.trim(),
          email: regEmail.trim(),
          password: regPassword,
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        error = messageErreurConnexion(resp.status, body, (cle) => $t(cle as any), false);
        loading = false;
        return;
      }
      const data = await resp.json();
      if (data.token || data.access_token) {
        setToken(data.token || data.access_token, data.refresh_token);
        if (!surCouche) activeView.set('home');
      } else {
        // Registration succeeded but no token — switch to login
        mode = 'login';
        loginEmail = regEmail;
        error = '';
      }
    } catch (e: any) {
      error = e?.message || $t('login.networkError' as any);
    }
    loading = false;
  }
</script>

<div class="login-view">
  <div class="login-card">
    <div class="login-logo">
      <img src={LOGO} alt="Tune" class="login-logo-img" />
    </div>

    {#if mode === 'login'}
      <h2>{$t('login.signIn' as any)}</h2>
      <!-- 🔴 Safari iPhone : sans `autocapitalize="none"`, iOS met une majuscule
           au premier caractère, et le serveur cherche l'identifiant en
           respectant la casse (`WHERE username = ?`) : « Admin » échoue.
           Le serveur ne cherche QUE l'identifiant, jamais l'e-mail. -->
      <form class="login-form" onsubmit={(e) => { e.preventDefault(); handleLogin(); }}>
        <input
          type="text"
          placeholder={$t('login.identifierPlaceholder' as any)}
          aria-label={$t('login.identifierPlaceholder' as any)}
          bind:value={loginEmail}
          autocomplete="username"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          data-login-identifiant
          aria-describedby="login-identifiant-aide"
          class="login-input"
        />
        <p id="login-identifiant-aide" class="login-aide" data-login-identifiant-aide>
          {$t(cleConsigne as any)}
        </p>
        <input
          type="password"
          placeholder={$t('login.passwordPlaceholder' as any)}
          bind:value={loginPassword}
          autocomplete="current-password"
          data-login-mot-de-passe
          class="login-input"
        />
        <label class="login-rester" title={$t('login.staySignedInHint' as any)}>
          <input type="checkbox" bind:checked={resterConnecte} data-login-rester-connecte />
          <span>{$t('login.staySignedIn' as any)}</span>
        </label>
        {#if error}
          <div class="login-error" data-login-erreur>{error}</div>
        {/if}
        <button type="submit" class="login-btn" disabled={loading}>
          {loading ? $t('login.signingIn' as any) : $t('login.signIn' as any)}
        </button>
      </form>

      <p class="login-switch">
        <button class="login-link" data-login-oublie onclick={ouvrirReinitialisation}>
          {$t('login.forgotPassword' as any)}
        </button>
      </p>

      <p class="login-switch">
        {$t('login.noAccount' as any)}
        <button class="login-link" onclick={() => { mode = 'register'; error = ''; }}>
          {$t('login.createAccount')}
        </button>
      </p>

    {:else if mode === 'reinitialiser'}
      <h2>{$t('login.resetTitle' as any)}</h2>
      <p class="login-aide login-reset-intro" data-reset-intro>{$t('login.resetIntro' as any)}</p>

      <div class="login-reset-systemes" data-reset-systemes>
        <details>
          <summary>Windows</summary>
          <p class="login-aide">{$t('login.resetHowWindows' as any)}</p>
        </details>
        <details>
          <summary>macOS</summary>
          <p class="login-aide">{$t('login.resetHowMac' as any)}</p>
          <code class="login-reset-cmd" data-reset-commande="mac">{commandes.mac}</code>
        </details>
        <details>
          <summary>Linux (Debian / Ubuntu)</summary>
          <p class="login-aide">{$t('login.resetHowLinux' as any)}</p>
          <code class="login-reset-cmd" data-reset-commande="linux">{commandes.linux}</code>
        </details>
        <details>
          <summary>Docker</summary>
          <p class="login-aide">{$t('login.resetHowDocker' as any)}</p>
          <code class="login-reset-cmd" data-reset-commande="docker">{commandes.docker}</code>
        </details>
        <details>
          <summary>Tune OS</summary>
          <p class="login-aide">{$t('login.resetHowTuneOs' as any)}</p>
          <code class="login-reset-cmd" data-reset-commande="tuneos">{commandes.tuneOs}</code>
        </details>
      </div>

      {#if depuisCetteMachine}
        <form class="login-form" data-reset-formulaire onsubmit={(e) => { e.preventDefault(); handleReinitialiser(); }}>
          <input
            type="text"
            placeholder={$t('login.resetCodePlaceholder' as any)}
            aria-label={$t('login.resetCodePlaceholder' as any)}
            bind:value={resetCode}
            oninput={() => { resetCode = resetCode.toUpperCase(); }}
            autocomplete="off"
            autocapitalize="characters"
            autocorrect="off"
            spellcheck="false"
            data-reset-code
            class="login-input"
          />
          <input
            type="password"
            placeholder={$t('login.resetNewPassword' as any)}
            aria-label={$t('login.resetNewPassword' as any)}
            bind:value={resetMotDePasse}
            autocomplete="new-password"
            data-reset-mot-de-passe
            class="login-input"
          />
          <input
            type="password"
            placeholder={$t('login.resetConfirmPassword' as any)}
            aria-label={$t('login.resetConfirmPassword' as any)}
            bind:value={resetConfirmation}
            autocomplete="new-password"
            data-reset-confirmation
            class="login-input"
          />
          {#if error}
            <div class="login-error" data-login-erreur>{error}</div>
          {/if}
          <button type="submit" class="login-btn" disabled={loading} data-reset-envoyer>
            {loading ? $t('login.resetSubmitting' as any) : $t('login.resetSubmit' as any)}
          </button>
        </form>
      {:else}
        <div class="login-error" data-reset-hors-machine>{$t('login.resetNotLocal' as any)}</div>
      {/if}

      <p class="login-switch">
        <button class="login-link" data-reset-retour onclick={quitterReinitialisation}>
          {$t('login.resetBack' as any)}
        </button>
      </p>

    {:else}
      <h2>{$t('login.createAccount')}</h2>
      <form class="login-form" onsubmit={(e) => { e.preventDefault(); handleRegister(); }}>
        <input
          type="text"
          placeholder={$t('login.usernamePlaceholder' as any)}
          bind:value={regUsername}
          autocomplete="username"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          class="login-input"
        />
        <input
          type="email"
          placeholder={$t('login.emailPlaceholder' as any)}
          bind:value={regEmail}
          autocomplete="email"
          class="login-input"
        />
        <input
          type="password"
          placeholder={$t('login.passwordPlaceholder' as any)}
          bind:value={regPassword}
          autocomplete="new-password"
          class="login-input"
        />
        {#if error}
          <div class="login-error">{error}</div>
        {/if}
        <button type="submit" class="login-btn" disabled={loading}>
          {loading ? $t('login.registering' as any) : $t('login.createAccount')}
        </button>
      </form>

      <p class="login-switch">
        {$t('login.haveAccount' as any)}
        <button class="login-link" onclick={() => { mode = 'login'; error = ''; }}>
          {$t('login.signIn' as any)}
        </button>
      </p>
    {/if}
  </div>
</div>

<style>
  .login-view {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-lg);
    overflow-y: auto;
  }

  .login-card {
    width: 100%;
    max-width: 400px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-xl);
    padding: var(--space-xl) var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .login-logo {
    display: flex;
    justify-content: center;
  }

  .login-logo-img {
    height: 40px;
    width: auto;
  }

  .login-card h2 {
    font-family: var(--font-label);
    font-size: calc(22px * var(--v2-txt-echelle, 1));
    font-weight: 600;
    text-align: center;
    letter-spacing: -0.5px;
  }

  .login-rester {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: calc(13px * var(--v2-txt-echelle, 1));
    cursor: pointer;
  }

  .login-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .login-input {
    width: 100%;
    padding: 10px 14px;
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: calc(14px * var(--v2-txt-echelle, 1));
    outline: none;
    transition: border-color 0.15s;
  }

  .login-input:focus {
    border-color: var(--tune-accent);
  }

  .login-input::placeholder {
    color: var(--tune-text-muted);
  }

  .login-error {
    color: #ef4444;
    font-family: var(--font-body);
    font-size: calc(13px * var(--v2-txt-echelle, 1));
    padding: var(--space-xs) var(--space-sm);
    background: rgba(239, 68, 68, 0.1);
    border-radius: var(--radius-sm);
  }

  .login-btn {
    width: 100%;
    padding: 10px;
    background: var(--tune-accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    font-family: var(--font-label);
    font-size: calc(14px * var(--v2-txt-echelle, 1));
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .login-btn:hover:not(:disabled) {
    opacity: 0.9;
  }

  .login-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .login-aide {
    margin: calc(-1 * var(--space-sm)) 0 0;
    font-family: var(--font-body);
    font-size: calc(12px * var(--v2-txt-echelle, 1));
    line-height: 1.4;
    color: var(--tune-text-secondary, #888);
  }

  .login-switch {
    text-align: center;
    font-family: var(--font-body);
    font-size: calc(13px * var(--v2-txt-echelle, 1));
    color: var(--tune-text-secondary);
  }

  .login-link {
    background: none;
    border: none;
    color: var(--tune-accent);
    font-family: var(--font-body);
    font-size: calc(13px * var(--v2-txt-echelle, 1));
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
  }

  .login-link:hover {
    opacity: 0.8;
  }

  /* Mot de passe oublié : propre à ce mode, aucun style global touché. */
  .login-reset-intro {
    margin: 0;
  }

  .login-reset-systemes {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .login-reset-systemes summary {
    cursor: pointer;
    font-family: var(--font-label);
    font-size: calc(13px * var(--v2-txt-echelle, 1));
    color: var(--tune-text);
  }

  .login-reset-systemes details > .login-aide {
    margin: var(--space-xs) 0;
  }

  .login-reset-cmd {
    display: block;
    padding: var(--space-xs) var(--space-sm);
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: calc(12px * var(--v2-txt-echelle, 1));
    color: var(--tune-text);
    white-space: pre-wrap;
    word-break: break-all;
    user-select: all;
  }
</style>
