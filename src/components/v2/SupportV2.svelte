<script lang="ts">
  /**
   * Support — nouveau client (direction Levente).
   *
   * Entrée visible à TOUS les niveaux, en pied de barre.
   *
   * Les tickets sont interrogés PAR CLÉ DE LICENCE : sans licence, il n'y a
   * pas de fil à afficher, et l'écran le dit clairement au lieu de montrer
   * une liste vide qui se lirait « vous n'avez jamais écrit ». La licence est
   * chargée par l'amorçage v2 — `loadLicense()` ne vit que dans App.svelte,
   * que `?v2` ne monte jamais.
   *
   * PÉRIMÈTRE ASSUMÉ : la CRÉATION de ticket (formulaire multipart avec
   * pièces jointes) n'est pas reprise ici. C'est un flux à part entière, et
   * un formulaire d'assistance à moitié fait est pire que pas de formulaire.
   * On y renvoie.
   */
  import * as api from '../../lib/api';
  import type { SupportTicketSummary, SupportTicketReply } from '../../lib/api';
  import { licenseState } from '../../lib/stores/license';
  import { t } from '../../lib/i18n';
  import { dateEtHeure } from '../../lib/dates';
  import '../../styles/tune-v2.css';

  const licenseKey = $derived($licenseState.licenseKey);
  const tier = $derived($licenseState.tier);

  let tickets = $state<SupportTicketSummary[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let opened = $state<SupportTicketSummary | null>(null);
  let replies = $state<SupportTicketReply[]>([]);
  let repLoading = $state(false);
  let draft = $state('');
  let sending = $state(false);

  $effect(() => {
    const key = licenseKey;
    if (!key) { loading = false; tickets = []; return; }
    loading = true;
    api.getSupportTickets(key)
      .then((r) => { tickets = r?.tickets ?? []; error = null; })
      .catch(() => { error = 'Tickets indisponibles — le service de support est injoignable.'; })
      .finally(() => { loading = false; });
  });

  async function open(t: SupportTicketSummary) {
    const key = licenseKey;
    if (!key) return;
    opened = t; replies = []; repLoading = true; draft = '';
    try {
      const r = await api.getSupportTicket(t.id, key);
      replies = r?.replies ?? [];
      // Marquer lu APRÈS avoir affiché : si l'appel échoue, on n'a pas fait
      // disparaître un compteur de non-lus sans que l'utilisateur ait vu quoi
      // que ce soit.
      if (t.unread_count > 0) {
        api.markSupportTicketRead(t.id, key)
          .then(() => { tickets = tickets.map((x) => (x.id === t.id ? { ...x, unread_count: 0 } : x)); })
          .catch(() => {});
      }
    } catch { error = 'Conversation indisponible.'; }
    repLoading = false;
  }

  async function send() {
    const key = licenseKey, body = draft.trim();
    if (!key || !opened || !body || sending) return;
    sending = true;
    try {
      await api.postSupportTicketReply(opened.id, key, body);
      // On relit la conversation depuis le serveur plutôt que d'ajouter la
      // réponse localement : c'est lui qui l'horodate et l'attribue.
      const r = await api.getSupportTicket(opened.id, key);
      replies = r?.replies ?? [];
      draft = '';
    } catch { error = 'Envoi impossible.'; }
    sending = false;
  }

  const STATUS: Record<string, { t: string; c: string }> = {
    open: { t: 'ouvert', c: 'open' },
    answered: { t: 'réponse reçue', c: 'ans' },
    resolved: { t: 'résolu', c: 'res' },
  };
  function when(iso: string): string {
    return $dateEtHeure(iso);
  }
</script>

<section class="v2-sup tune-v2">
  <header class="top">
    <div>
      <div class="eyebrow">Assistance</div>
      <h1>Support</h1>
    </div>
    {#if tier && tier !== 'free'}<span class="tier">{tier}</span>{/if}
  </header>

  {#if error}<div class="err">{error}<button onclick={() => (error = null)} aria-label="Fermer">×</button></div>{/if}

  <div class="scroll">
    {#if !licenseKey}
      <div class="notice">
        <p>
          Le suivi des tickets est lié à votre <b>clé de licence</b>. Aucune clé n'est
          enregistrée sur ce serveur, il n'y a donc aucun fil à afficher.
        </p>
        <p class="sub">
          {$t('v2.sup.licenceA' as any)} <b>{$t('v2.sup.licenceWhere' as any)}</b>.
        </p>
      </div>
    {:else if loading}
      <div class="state">{$t('v2.sup.loading' as any)}</div>
    {:else if !tickets.length}
      <div class="state">{$t('v2.sup.noTicket' as any)}</div>
    {:else}
      <div class="list">
        {#each tickets as t (t.id)}
          <button class="tk" class:on={opened?.id === t.id} onclick={() => open(t)}>
            <span class="tsub">{t.subject}</span>
            <span class="tmeta">
              <span class="st {STATUS[t.status]?.c ?? ''}">{STATUS[t.status]?.t ?? t.status}</span>
              {#if t.category}<span class="cat">{t.category}</span>{/if}
              <span class="dt">{when(t.last_reply_at ?? t.updated_at ?? t.created_at)}</span>
              {#if t.unread_count > 0}<span class="unread">{t.unread_count}</span>{/if}
            </span>
          </button>
        {/each}
      </div>
    {/if}

    <p class="foot">
      Ouvrir un nouveau ticket, avec pièces jointes, se fait depuis le client actuel —
      ce formulaire n'est pas encore repris ici.
    </p>
  </div>

  {#if opened}
    <div class="thread">
      <button class="close" onclick={() => (opened = null)} aria-label="Fermer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <h2>{opened.subject}</h2>
      <div class="thmeta">
        <span class="st {STATUS[opened.status]?.c ?? ''}">{STATUS[opened.status]?.t ?? opened.status}</span>
        <span class="dt">ouvert le {when(opened.created_at)}</span>
      </div>

      <div class="msgs">
        {#if repLoading}
          <div class="state">{$t('v2.tool.loading' as any)}</div>
        {:else if !replies.length}
          <div class="state">{$t('v2.sup.noMessage' as any)}</div>
        {:else}
          {#each replies as r (r.id)}
            <div class="msg" class:team={r.author === 'team'}>
              <div class="mh">{r.author === 'team' ? 'Équipe Tune' : 'Vous'}<span>{when(r.created_at)}</span></div>
              <div class="mb">{r.body}</div>
            </div>
          {/each}
        {/if}
      </div>

      {#if opened.status !== 'resolved'}
        <div class="reply">
          <textarea bind:value={draft} placeholder={$t('v2.sup.replyPlaceholder' as any)} rows="3" disabled={sending}></textarea>
          <button class="go" disabled={!draft.trim() || sending} onclick={send}>
            {sending ? $t('v2.sup.sending' as any) : $t('v2.sup.reply' as any)}
          </button>
        </div>
      {:else}
        <div class="closed">{$t('v2.sup.resolved' as any)}</div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .v2-sup{position:relative; display:flex; flex-direction:column; height:100%; background:var(--v2-bg);
    color:var(--v2-txt); font-family:var(--v2-sans); overflow:hidden}
  .top{display:flex; align-items:flex-end; gap:16px; padding:24px 30px 14px; padding-right:96px}
  .eyebrow{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em; margin-top:4px}
  .tier{font:9.5px var(--v2-mono); letter-spacing:.12em; text-transform:uppercase; color:var(--v2-on-acc);
    background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); border-radius:999px; padding:4px 11px}

  .err{display:flex; align-items:center; gap:12px; margin:0 30px 10px; padding:9px 14px; border-radius:10px;
    font-size:12.5px; border:1px solid var(--v2-danger-bd); color:var(--v2-danger)}
  .err button{margin-left:auto; border:0; background:transparent; color:inherit; font-size:16px; cursor:pointer}

  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:26px 0; color:var(--v2-txt3)}
  .notice{max-width:620px; padding:18px 20px; border-radius:13px; border:1px solid var(--v2-line2); background:var(--v2-surface2)}
  .notice p{font-size:14px; line-height:1.6; color:var(--v2-txt2)}
  .notice .sub{margin-top:10px; font-size:12.5px; color:var(--v2-txt3)}
  .notice b{color:var(--v2-txt)}
  .foot{margin-top:26px; font-size:12.5px; line-height:1.6; color:var(--v2-txt3); max-width:70ch}

  .list{display:flex; flex-direction:column; gap:8px}
  .tk{display:flex; flex-direction:column; gap:8px; align-items:flex-start; width:100%; padding:14px 16px;
    border-radius:12px; border:1px solid var(--v2-line); background:var(--v2-surface2); cursor:pointer;
    color:inherit; text-align:left; font-family:inherit}
  .tk:hover,.tk.on{border-color:var(--v2-acc2)}
  .tsub{font-size:14px; font-weight:700}
  .tmeta{display:flex; align-items:center; gap:11px; flex-wrap:wrap}
  .st{font:9.5px var(--v2-mono); letter-spacing:.09em; text-transform:uppercase; padding:2px 9px;
    border-radius:999px; border:1px solid var(--v2-line2); color:var(--v2-txt3)}
  .st.open{color:var(--v2-acc-tint); border-color:var(--v2-acc2)}
  .st.ans{color:var(--v2-on-acc); border-color:transparent; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .cat{font:10px var(--v2-mono); color:var(--v2-txt3)}
  .dt{font:10.5px var(--v2-mono); color:var(--v2-txt3)}
  .unread{font:9.5px var(--v2-mono); color:#fff; background:var(--v2-danger-bd); border-radius:999px; padding:2px 8px}

  .thread{position:absolute; inset:0; z-index:30; background:var(--v2-bg); overflow-y:auto; padding:26px 34px 40px;
    display:flex; flex-direction:column}
  .close{align-self:flex-start; width:40px; height:40px; border-radius:12px; cursor:pointer; margin-bottom:14px;
    border:1px solid var(--v2-line2); background:var(--v2-surface2); color:var(--v2-txt2); display:grid; place-items:center}
  .close svg{width:18px; height:18px}
  .thread h2{font-size:24px; font-weight:800}
  .thmeta{display:flex; align-items:center; gap:12px; margin-top:8px; padding-bottom:18px; border-bottom:1px solid var(--v2-line)}

  .msgs{flex:1; display:flex; flex-direction:column; gap:12px; padding:18px 0}
  .msg{max-width:70ch; padding:13px 16px; border-radius:12px; border:1px solid var(--v2-line); background:var(--v2-surface2)}
  .msg.team{border-color:var(--v2-acc2); background:var(--v2-acc-soft); align-self:flex-start}
  .msg:not(.team){align-self:flex-end}
  .mh{display:flex; align-items:baseline; gap:12px; font:700 11px var(--v2-sans); color:var(--v2-txt2)}
  .mh span{font:10px var(--v2-mono); color:var(--v2-txt3)}
  .mb{margin-top:7px; font-size:13.5px; line-height:1.6; color:var(--v2-txt); white-space:pre-wrap}

  .reply{display:flex; gap:12px; align-items:flex-end; padding-top:16px; border-top:1px solid var(--v2-line)}
  .reply textarea{flex:1; border-radius:11px; border:1px solid var(--v2-line2); background:var(--v2-surface2);
    color:var(--v2-txt); font:13.5px var(--v2-sans); padding:11px 14px; outline:none; resize:vertical; font-family:inherit}
  .reply textarea:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .go{height:40px; padding:0 20px; border-radius:var(--v2-r-pill); border:0; cursor:pointer; font:700 13px var(--v2-sans);
    color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .go:disabled{opacity:.4; cursor:default}
  .closed{padding-top:16px; border-top:1px solid var(--v2-line); font-size:12.5px; color:var(--v2-txt3)}
</style>
