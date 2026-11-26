<script lang="ts">
  import { setToken } from '../../lib/auth';
  import { t } from '../../lib/i18n';
  import { messageErreurConnexion } from '../../lib/erreurConnexion';
  import { activeView } from '../../lib/stores/navigation';
  import { baseApi, entetesRelais, urlRessourcePublique } from '../../lib/bridge';

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
  // 3067). L'identifiant créé à l'activation de l'authentification est
  // `default` (rc14 : renommé `admin` par le serveur, mais `default` reste un
  // ALIAS à la connexion) : on pré-remplit `default`, valable sur TOUS les
  // serveurs, anciens comme rc14 — `admin` échouerait sur un serveur plus
  // ancien, et l'écran ne connaît pas la version avant la connexion. Un identifiant déjà utilisé avec succès sur
  // cet appareil l'emporte.
  //
  // Le bouton « Connexion avec mozaiklabs.fr » n'est plus proposé ici : avant
  // toute session, `/cloud/sso/authorize` répond « authentication required »
  // (relier un compte exige l'administrateur quand l'authentification est
  // active). Le geste vit dans Réglages ▸ Système ▸ Cloud et dans le menu de
  // l'avatar, une fois connecté.
  const IDENTIFIANT_PAR_DEFAUT = 'default';
  const CLE_IDENTIFIANT = 'tune_login_identifiant';
  function identifiantInitial(): string {
    try {
      const memorise = localStorage.getItem(CLE_IDENTIFIANT);
      if (memorise && memorise.trim()) return memorise;
    } catch {}
    return IDENTIFIANT_PAR_DEFAUT;
  }
  function memoriserIdentifiant(identifiant: string) {
    try { localStorage.setItem(CLE_IDENTIFIANT, identifiant); } catch {}
  }

  // Mode: 'login' or 'register'
  let mode = $state<'login' | 'register'>('login');

  // Login form
  let loginEmail = $state(identifiantInitial());
  let loginPassword = $state('');

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
        body: JSON.stringify({ username: loginEmail.trim(), password: loginPassword }),
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
        setToken(data.token || data.access_token);
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
        setToken(data.token || data.access_token);
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
          {$t('login.identifierHelp' as any)}
        </p>
        <input
          type="password"
          placeholder={$t('login.passwordPlaceholder' as any)}
          bind:value={loginPassword}
          autocomplete="current-password"
          data-login-mot-de-passe
          class="login-input"
        />
        {#if error}
          <div class="login-error" data-login-erreur>{error}</div>
        {/if}
        <button type="submit" class="login-btn" disabled={loading}>
          {loading ? $t('login.signingIn' as any) : $t('login.signIn' as any)}
        </button>
      </form>

      <p class="login-switch">
        {$t('login.noAccount' as any)}
        <button class="login-link" onclick={() => { mode = 'register'; error = ''; }}>
          {$t('login.createAccount')}
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
</style>
