<script lang="ts">
  import { onMount } from 'svelte';
  import * as api from '../lib/api';

  // Vue : liste des tickets, création, ou détail d'un ticket.
  let mode = $state<'list' | 'new' | 'detail'>('list');
  let loading = $state(true);
  let submitting = $state(false);
  let error = $state<string | null>(null);

  interface TicketSummary {
    id: number;
    subject: string;
    status: string;
    priority: string;
    category: string | null;
    last_reply_at: string | null;
    created_at: string;
  }
  interface Message {
    id: number;
    author_type: string;
    body: string;
    created_at: string;
  }
  interface TicketDetail extends TicketSummary {
    messages: Message[];
  }

  let tickets = $state<TicketSummary[]>([]);
  let current = $state<TicketDetail | null>(null);

  // Formulaire "nouveau ticket".
  let subject = $state('');
  let body = $state('');
  let category = $state('other');
  // Formulaire "réponse".
  let replyBody = $state('');

  const CATEGORIES = [
    { value: 'playback', label: 'Lecture' },
    { value: 'scan', label: 'Scan / Bibliothèque' },
    { value: 'streaming', label: 'Streaming (Qobuz, Tidal…)' },
    { value: 'license', label: 'Licence / Compte' },
    { value: 'audio', label: 'Sortie audio / DAC' },
    { value: 'other', label: 'Autre' },
  ];

  const STATUS_LABEL: Record<string, string> = {
    open: 'Ouvert',
    waiting_user: 'En attente de vous',
    resolved: 'Résolu',
    closed: 'Fermé',
  };

  // apiPost/apiFetch throw un Error(status) ; on traduit les cas utiles.
  function friendlyError(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('412')) return 'Connecte-toi à ton compte Tune pour utiliser le support.';
    if (msg.includes('403')) return 'Le support prioritaire est réservé à Tune Premium.';
    if (msg.includes('401')) return 'Session expirée, reconnecte-toi.';
    return 'Une erreur est survenue. Réessaie dans un instant.';
  }

  function fmtDate(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR');
  }

  async function loadTickets() {
    loading = true;
    error = null;
    try {
      const data = await api.apiFetch('/support/tickets');
      tickets = data.tickets ?? [];
    } catch (e) {
      error = friendlyError(e);
    } finally {
      loading = false;
    }
  }

  async function openTicket(id: number) {
    loading = true;
    error = null;
    try {
      const data = await api.apiFetch(`/support/tickets/${id}`);
      current = data.ticket ?? null;
      mode = 'detail';
    } catch (e) {
      error = friendlyError(e);
    } finally {
      loading = false;
    }
  }

  async function submitTicket() {
    if (!subject.trim() || !body.trim()) return;
    submitting = true;
    error = null;
    try {
      await api.apiPost('/support/tickets', {
        subject: subject.trim(),
        body: body.trim(),
        category,
      });
      subject = '';
      body = '';
      category = 'other';
      mode = 'list';
      await loadTickets();
    } catch (e) {
      error = friendlyError(e);
    } finally {
      submitting = false;
    }
  }

  async function sendReply() {
    if (!current || !replyBody.trim()) return;
    submitting = true;
    error = null;
    try {
      await api.apiPost(`/support/tickets/${current.id}/reply`, { body: replyBody.trim() });
      replyBody = '';
      await openTicket(current.id);
    } catch (e) {
      error = friendlyError(e);
    } finally {
      submitting = false;
    }
  }

  onMount(loadTickets);
</script>

<div class="support-view">
  <header class="support-header">
    <h1>Support premium</h1>
    {#if mode === 'list'}
      <button class="btn-primary" onclick={() => { mode = 'new'; error = null; }}>Nouveau ticket</button>
    {:else}
      <button class="btn-ghost" onclick={() => { mode = 'list'; current = null; error = null; }}>← Retour</button>
    {/if}
  </header>

  {#if error}
    <div class="support-error" role="alert">{error}</div>
  {/if}

  {#if mode === 'new'}
    <form class="support-form" onsubmit={(e) => { e.preventDefault(); submitTicket(); }}>
      <label>
        <span>Sujet</span>
        <input type="text" bind:value={subject} maxlength="150" placeholder="Résumé du problème" required />
      </label>
      <label>
        <span>Catégorie</span>
        <select bind:value={category}>
          {#each CATEGORIES as c}
            <option value={c.value}>{c.label}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>Description</span>
        <textarea bind:value={body} rows="8" placeholder="Décris ce qui se passe : ce que tu fais, ce qui est attendu, ce qui arrive." required></textarea>
      </label>
      <p class="support-hint">La version de Tune et ta plateforme sont jointes automatiquement.</p>
      <button class="btn-primary" type="submit" disabled={submitting || !subject.trim() || !body.trim()}>
        {submitting ? 'Envoi…' : 'Envoyer le ticket'}
      </button>
    </form>
  {:else if mode === 'detail' && current}
    <div class="ticket-detail">
      <div class="ticket-meta">
        <h2>{current.subject}</h2>
        <span class="badge status-{current.status}">{STATUS_LABEL[current.status] ?? current.status}</span>
      </div>
      <div class="messages">
        {#each current.messages as m (m.id)}
          <div class="message {m.author_type === 'staff' ? 'from-staff' : 'from-user'}">
            <div class="message-author">{m.author_type === 'staff' ? 'Support Tune' : 'Vous'}</div>
            <div class="message-body">{m.body}</div>
            <div class="message-date">{new Date(m.created_at).toLocaleString('fr-FR')}</div>
          </div>
        {/each}
      </div>
      {#if current.status !== 'closed'}
        <form class="reply-form" onsubmit={(e) => { e.preventDefault(); sendReply(); }}>
          <textarea bind:value={replyBody} rows="4" placeholder="Votre réponse…"></textarea>
          <button class="btn-primary" type="submit" disabled={submitting || !replyBody.trim()}>
            {submitting ? 'Envoi…' : 'Répondre'}
          </button>
        </form>
      {/if}
    </div>
  {:else if loading}
    <p class="support-loading">Chargement…</p>
  {:else if tickets.length === 0}
    <div class="support-empty">
      <p class="empty-title">Aucun ticket pour le moment.</p>
      <p>Un souci ? Ouvre un ticket : l'équipe Tune te répond en priorité.</p>
    </div>
  {:else}
    <ul class="ticket-list">
      {#each tickets as ticket (ticket.id)}
        <li>
          <button class="ticket-row" onclick={() => openTicket(ticket.id)}>
            <span class="ticket-subject">{ticket.subject}</span>
            <span class="badge status-{ticket.status}">{STATUS_LABEL[ticket.status] ?? ticket.status}</span>
            <span class="ticket-date">{fmtDate(ticket.last_reply_at ?? ticket.created_at)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .support-view {
    max-width: 760px;
    margin: 0 auto;
    padding: 1.5rem;
    color: var(--text, #e8e8ea);
  }
  .support-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.25rem;
  }
  .support-header h1 {
    font-size: 1.4rem;
    margin: 0;
  }
  .btn-primary {
    background: var(--accent, #6c5ce7);
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 0.55rem 1rem;
    font-size: 0.95rem;
    cursor: pointer;
  }
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn-ghost {
    background: transparent;
    color: var(--text-muted, #a0a0a8);
    border: 1px solid var(--border, #33333a);
    border-radius: 8px;
    padding: 0.5rem 0.9rem;
    cursor: pointer;
  }
  .support-error {
    background: rgba(220, 53, 69, 0.12);
    border: 1px solid rgba(220, 53, 69, 0.4);
    color: #ff8a95;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
  }
  .support-form,
  .reply-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .support-form label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.9rem;
    color: var(--text-muted, #a0a0a8);
  }
  .support-form input,
  .support-form select,
  .support-form textarea,
  .reply-form textarea {
    background: var(--surface, #1c1c22);
    border: 1px solid var(--border, #33333a);
    border-radius: 8px;
    padding: 0.6rem 0.75rem;
    color: var(--text, #e8e8ea);
    font: inherit;
    resize: vertical;
  }
  .support-hint {
    font-size: 0.82rem;
    color: var(--text-muted, #a0a0a8);
    margin: -0.25rem 0 0;
  }
  .ticket-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .ticket-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: var(--surface, #1c1c22);
    border: 1px solid var(--border, #33333a);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    cursor: pointer;
    text-align: left;
    color: inherit;
  }
  .ticket-row:hover {
    border-color: var(--accent, #6c5ce7);
  }
  .ticket-subject {
    flex: 1;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ticket-date {
    font-size: 0.8rem;
    color: var(--text-muted, #a0a0a8);
    font-variant-numeric: tabular-nums;
  }
  .badge {
    font-size: 0.75rem;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    white-space: nowrap;
    background: rgba(255, 255, 255, 0.08);
  }
  .status-open { background: rgba(255, 179, 71, 0.18); color: #ffb347; }
  .status-waiting_user { background: rgba(108, 155, 231, 0.18); color: #6c9be7; }
  .status-resolved { background: rgba(75, 200, 130, 0.18); color: #4bc882; }
  .status-closed { background: rgba(160, 160, 168, 0.15); color: #a0a0a8; }
  .support-empty {
    text-align: center;
    padding: 3rem 1rem;
    color: var(--text-muted, #a0a0a8);
  }
  .empty-title {
    font-size: 1.05rem;
    color: var(--text, #e8e8ea);
    margin-bottom: 0.35rem;
  }
  .ticket-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .ticket-meta h2 {
    font-size: 1.15rem;
    margin: 0;
  }
  .messages {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }
  .message {
    border-radius: 10px;
    padding: 0.75rem 1rem;
    max-width: 85%;
  }
  .from-user {
    align-self: flex-end;
    background: var(--accent-soft, rgba(108, 92, 231, 0.15));
    border: 1px solid rgba(108, 92, 231, 0.35);
  }
  .from-staff {
    align-self: flex-start;
    background: var(--surface, #1c1c22);
    border: 1px solid var(--border, #33333a);
  }
  .message-author {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-muted, #a0a0a8);
    margin-bottom: 0.25rem;
  }
  .message-body {
    white-space: pre-wrap;
    line-height: 1.45;
  }
  .message-date {
    font-size: 0.72rem;
    color: var(--text-muted, #a0a0a8);
    margin-top: 0.35rem;
    font-variant-numeric: tabular-nums;
  }
  .support-loading {
    text-align: center;
    color: var(--text-muted, #a0a0a8);
    padding: 2rem;
  }
</style>
