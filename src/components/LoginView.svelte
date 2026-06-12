<script lang="ts">
  import { setToken } from '../lib/auth';
  import { activeView } from '../lib/stores/navigation';

  const BASE = '/api/v1';

  // Mode: 'login' or 'register'
  let mode = $state<'login' | 'register'>('login');

  // Login form
  let loginEmail = $state('');
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
      error = 'Veuillez remplir tous les champs.';
      return;
    }
    loading = true;
    try {
      const resp = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginEmail.trim(), password: loginPassword }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        error = body.detail || body.message || `Erreur ${resp.status}`;
        loading = false;
        return;
      }
      const data = await resp.json();
      if (data.token || data.access_token) {
        setToken(data.token || data.access_token);
        activeView.set('home');
      } else {
        error = 'Reponse inattendue du serveur.';
      }
    } catch (e: any) {
      error = e?.message || 'Erreur reseau.';
    }
    loading = false;
  }

  async function handleRegister() {
    error = '';
    if (!regUsername.trim() || !regEmail.trim() || !regPassword.trim()) {
      error = 'Veuillez remplir tous les champs.';
      return;
    }
    loading = true;
    try {
      const resp = await fetch(`${BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: regUsername.trim(),
          email: regEmail.trim(),
          password: regPassword,
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        error = body.detail || body.message || `Erreur ${resp.status}`;
        loading = false;
        return;
      }
      const data = await resp.json();
      if (data.token || data.access_token) {
        setToken(data.token || data.access_token);
        activeView.set('home');
      } else {
        // Registration succeeded but no token — switch to login
        mode = 'login';
        loginEmail = regEmail;
        error = '';
      }
    } catch (e: any) {
      error = e?.message || 'Erreur reseau.';
    }
    loading = false;
  }

  function handleSSO() {
    try { sessionStorage.setItem('tune_sso_pending', '1'); } catch {}
    window.location.href = `${BASE}/cloud/sso/authorize`;
  }
</script>

<div class="login-view">
  <div class="login-card">
    <div class="login-logo">
      <img src="/tune-logo.png" alt="Tune" class="login-logo-img" />
    </div>

    {#if mode === 'login'}
      <h2>Se connecter</h2>
      <form class="login-form" onsubmit={(e) => { e.preventDefault(); handleLogin(); }}>
        <input
          type="text"
          placeholder="Email ou identifiant"
          bind:value={loginEmail}
          autocomplete="username"
          class="login-input"
        />
        <input
          type="password"
          placeholder="Mot de passe"
          bind:value={loginPassword}
          autocomplete="current-password"
          class="login-input"
        />
        {#if error}
          <div class="login-error">{error}</div>
        {/if}
        <button type="submit" class="login-btn" disabled={loading}>
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>

      <div class="login-divider">
        <span>ou</span>
      </div>

      <button class="login-sso-btn" onclick={handleSSO}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
          <polyline points="10 17 15 12 10 7" />
          <line x1="15" y1="12" x2="3" y2="12" />
        </svg>
        Connexion avec mozaiklabs.fr
      </button>

      <p class="login-switch">
        Pas encore de compte ?
        <button class="login-link" onclick={() => { mode = 'register'; error = ''; }}>
          Creer un compte
        </button>
      </p>

    {:else}
      <h2>Creer un compte</h2>
      <form class="login-form" onsubmit={(e) => { e.preventDefault(); handleRegister(); }}>
        <input
          type="text"
          placeholder="Nom d'utilisateur"
          bind:value={regUsername}
          autocomplete="username"
          class="login-input"
        />
        <input
          type="email"
          placeholder="Email"
          bind:value={regEmail}
          autocomplete="email"
          class="login-input"
        />
        <input
          type="password"
          placeholder="Mot de passe"
          bind:value={regPassword}
          autocomplete="new-password"
          class="login-input"
        />
        {#if error}
          <div class="login-error">{error}</div>
        {/if}
        <button type="submit" class="login-btn" disabled={loading}>
          {loading ? 'Inscription...' : 'Creer un compte'}
        </button>
      </form>

      <p class="login-switch">
        Deja un compte ?
        <button class="login-link" onclick={() => { mode = 'login'; error = ''; }}>
          Se connecter
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
    font-size: 22px;
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
    font-size: 14px;
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
    font-size: 13px;
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
    font-size: 14px;
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

  .login-divider {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    font-size: 12px;
  }

  .login-divider::before,
  .login-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--tune-border);
  }

  .login-sso-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    padding: 10px;
    background: var(--tune-grey2);
    color: var(--tune-text);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .login-sso-btn:hover {
    border-color: var(--tune-accent);
  }

  .login-switch {
    text-align: center;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
  }

  .login-link {
    background: none;
    border: none;
    color: var(--tune-accent);
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
  }

  .login-link:hover {
    opacity: 0.8;
  }
</style>
