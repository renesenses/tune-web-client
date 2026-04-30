<script lang="ts">
  import { onMount } from 'svelte';
  import * as api from '../lib/api';
  import type { ServiceTokenInfo } from '../lib/api';
  import { notifications } from '../lib/stores/notifications';

  let services = $state<ServiceTokenInfo[]>([]);
  let loading = $state(true);
  let busy = $state<string | null>(null);
  let editing = $state<Record<string, Record<string, string>>>({});
  let helpOpen = $state<Record<string, boolean>>({});

  async function load() {
    loading = true;
    try {
      services = await api.listServiceTokens();
      // Initialize editing buffers for each service to its known fields
      // (we never display existing secret values — only blank inputs).
      editing = {};
      for (const s of services) {
        editing[s.id] = {};
        for (const f of s.fields) editing[s.id][f.key] = '';
      }
    } catch (e: any) {
      notifications.error(`Échec chargement: ${e?.message || e}`);
    }
    loading = false;
  }

  async function save(service: ServiceTokenInfo) {
    const data = editing[service.id];
    if (!data || Object.values(data).every(v => !v?.trim())) {
      notifications.error('Aucune valeur saisie.');
      return;
    }
    busy = service.id;
    try {
      const r = await api.saveServiceToken(service.id, data);
      if (r.valid === true) {
        notifications.success(`${service.name}: ${r.validation_message ?? 'Token valide.'}`);
      } else if (r.valid === false) {
        notifications.error(`${service.name}: ${r.validation_message ?? 'Échec validation.'}`);
      } else {
        notifications.success(`${service.name}: enregistré (validation indisponible).`);
      }
      await load();
    } catch (e: any) {
      notifications.error(`Erreur: ${e?.message || e}`);
    }
    busy = null;
  }

  async function test(service: ServiceTokenInfo) {
    busy = service.id;
    try {
      const r = await api.testServiceToken(service.id);
      if (r.valid === true) {
        notifications.success(`${service.name}: ${r.validation_message ?? 'OK'}`);
      } else if (r.valid === false) {
        notifications.error(`${service.name}: ${r.validation_message ?? 'Échec'}`);
      } else {
        notifications.info(r.validation_message ?? 'Pas de validation disponible.');
      }
      await load();
    } catch (e: any) {
      notifications.error(`Erreur test: ${e?.message || e}`);
    }
    busy = null;
  }

  async function remove(service: ServiceTokenInfo) {
    if (!confirm(`Supprimer le token ${service.name} ? L'enrichissement utilisera la valeur d'environnement (.env) comme fallback si elle existe.`)) return;
    busy = service.id;
    try {
      await api.deleteServiceToken(service.id);
      notifications.success(`${service.name}: token supprimé.`);
      await load();
    } catch (e: any) {
      notifications.error(`Erreur: ${e?.message || e}`);
    }
    busy = null;
  }

  function statusDot(s: ServiceTokenInfo): { color: string; label: string } {
    if (s.kind === 'no_auth') return { color: '#22c55e', label: 'Disponible (aucun token requis)' };
    if (!s.configured) return { color: 'transparent', label: 'Non configuré' };
    if (s.valid === true) return { color: '#22c55e', label: 'Valide' };
    if (s.valid === false) return { color: '#ef4444', label: 'Invalide' };
    if (s.source === 'env') return { color: '#eab308', label: 'Configuré via .env (non testé)' };
    return { color: '#eab308', label: 'Non testé' };
  }

  function fmtTime(ts: number | null): string {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    return d.toLocaleString();
  }

  onMount(load);
</script>

<section class="services-view">
  <header>
    <h1>Services & Tokens</h1>
    <p class="lede">Configure ici les tokens d'enrichissement de métadonnées (Discogs, Last.fm, …) sans toucher au fichier <code>.env</code>. Chaque token est validé avant d'être enregistré.</p>
  </header>

  {#if loading}
    <div class="state">…</div>
  {:else}
    <div class="grid">
      {#each services as s (s.id)}
        {@const dot = statusDot(s)}
        <div class="card">
          <div class="card-head">
            <span class="dot" style:background={dot.color}></span>
            <span class="card-title">{s.name}</span>
            <span class="pricing pricing-{s.pricing}" title={s.pricing_note}>
              {s.pricing === 'free' ? 'Gratuit' : s.pricing === 'paid' ? 'Payant' : s.pricing === 'freemium' ? 'Freemium' : '?'}
            </span>
          </div>
          <p class="card-purpose">{s.purpose}</p>
          {#if s.pricing_note}<p class="card-pricing-note">{s.pricing_note}</p>{/if}
          <div class="card-status">
            {dot.label}
            {#if s.validated_at}
              <span class="ts">— testé le {fmtTime(s.validated_at)}</span>
            {/if}
          </div>
          {#if s.validation_message}
            <div class="card-msg" class:msg-bad={s.valid === false}>{s.validation_message}</div>
          {/if}

          {#if s.fields.length > 0}
            <div class="fields">
              {#each s.fields as f}
                <label class="field">
                  <span class="field-label">{f.label}</span>
                  <input
                    type={f.type}
                    bind:value={editing[s.id][f.key]}
                    placeholder={s.configured ? '••••• (déjà configuré, ressaisis pour modifier)' : ''}
                  />
                </label>
              {/each}
              <div class="actions">
                <button class="btn-save" disabled={busy === s.id} onclick={() => save(s)}>
                  {busy === s.id ? '…' : 'Enregistrer & valider'}
                </button>
                {#if s.configured && s.source === 'db'}
                  <button class="btn-secondary" disabled={busy === s.id} onclick={() => test(s)}>Tester</button>
                  <button class="btn-danger" disabled={busy === s.id} onclick={() => remove(s)}>Supprimer</button>
                {/if}
              </div>
            </div>
          {:else if s.kind === 'oauth' || s.kind === 'login_password' || s.kind === 'arl_token'}
            <a class="btn-link" href={s.help_url}>Configurer →</a>
          {/if}

          <button class="help-toggle" onclick={() => helpOpen[s.id] = !helpOpen[s.id]}>
            {helpOpen[s.id] ? '▾' : '▸'} Comment obtenir mon token ?
          </button>
          {#if helpOpen[s.id]}
            <ol class="help-steps">
              {#each s.help_steps as step}<li>{step}</li>{/each}
            </ol>
            <a class="help-link" href={s.help_url} target="_blank" rel="noopener">{s.help_url}</a>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .services-view { padding: 24px; max-width: 1100px; margin: 0 auto; }
  header h1 { margin: 0 0 4px; font-size: 1.5rem; color: var(--tune-text); }
  .lede { color: var(--tune-text-muted); font-size: 13px; margin: 0 0 20px; max-width: 720px; }
  .lede code { background: var(--tune-bg); padding: 1px 5px; border-radius: 4px; font-family: monospace; font-size: 11px; }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    gap: 14px;
  }
  .card {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: 10px;
    padding: 14px;
    display: flex; flex-direction: column; gap: 8px;
  }
  .card-head { display: flex; align-items: center; gap: 8px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; border: 1px solid var(--tune-border); }
  .card-title { font-weight: 600; font-size: 15px; flex: 1; }
  .pricing {
    font-size: 10px; font-weight: 600;
    padding: 2px 8px; border-radius: 10px;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .pricing-free {
    background: rgba(34,197,94,0.18);
    color: #4ade80;
  }
  .pricing-paid {
    background: rgba(249,115,22,0.18);
    color: #fdba74;
  }
  .pricing-freemium {
    background: rgba(59,130,246,0.18);
    color: #93c5fd;
  }
  .card-purpose {
    margin: 0; font-size: 12px; color: var(--tune-text-muted);
  }
  .card-pricing-note {
    margin: 0; font-size: 11px; color: var(--tune-text-muted); font-style: italic;
  }
  .card-status {
    font-size: 11px; color: var(--tune-text-muted);
    display: flex; align-items: center; gap: 4px;
    flex-wrap: wrap;
  }
  .card-status .ts { font-style: italic; }
  .card-msg {
    font-size: 11px; padding: 6px 8px;
    background: rgba(34,197,94,0.1); color: #4ade80;
    border-radius: 4px;
  }
  .card-msg.msg-bad { background: rgba(239,68,68,0.1); color: #f87171; }

  .fields { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
  .field { display: flex; flex-direction: column; gap: 3px; }
  .field-label { font-size: 11px; color: var(--tune-text-muted); }
  .field input {
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: 6px; padding: 6px 8px;
    color: var(--tune-text); font-size: 12px; font-family: monospace;
  }
  .field input:focus { border-color: var(--tune-accent); outline: none; }

  .actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
  .btn-save, .btn-secondary, .btn-danger, .btn-link {
    padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600;
    cursor: pointer; border: none;
  }
  .btn-save { background: var(--tune-accent); color: white; }
  .btn-save:disabled { opacity: 0.5; cursor: default; }
  .btn-secondary {
    background: transparent; color: var(--tune-text-muted);
    border: 1px solid var(--tune-border);
  }
  .btn-secondary:hover { color: var(--tune-text); }
  .btn-danger {
    background: transparent; color: #ef4444;
    border: 1px solid rgba(239,68,68,0.3);
  }
  .btn-link {
    text-decoration: none;
    background: rgba(var(--tune-accent-rgb,99,102,241),0.15);
    color: var(--tune-accent);
    display: inline-block; width: max-content;
  }

  .help-toggle {
    background: transparent; border: none;
    color: var(--tune-text-muted); cursor: pointer;
    padding: 4px 0; text-align: left; font-size: 11px;
  }
  .help-toggle:hover { color: var(--tune-text); }
  .help-steps {
    margin: 4px 0 0 16px; padding: 0;
    color: var(--tune-text-muted); font-size: 12px;
  }
  .help-steps li { margin: 2px 0; }
  .help-link {
    font-size: 11px; color: var(--tune-accent);
    text-decoration: none; word-break: break-all;
  }
  .help-link:hover { text-decoration: underline; }

  .state { padding: 24px; text-align: center; color: var(--tune-text-muted); }
</style>
