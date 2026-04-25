<script lang="ts">
  import { currentZone } from '../lib/stores/zones';
  import { notifications } from '../lib/stores/notifications';
  import * as api from '../lib/api';

  let partyActive = $state(false);
  let currentTrack = $state<any>(null);
  let queue = $state<any[]>([]);
  let zoneName = $state('');
  let queueLength = $state(0);
  let loading = $state(true);

  let addQuery = $state('');
  let adding = $state(false);
  let recentAdds = $state<string[]>([]);

  let zone = $derived($currentZone);

  async function refresh() {
    loading = true;
    try {
      const [status, q] = await Promise.all([
        api.getPartyStatus(),
        api.getPartyQueue(),
      ]);
      partyActive = status.active;
      currentTrack = status.current_track;
      zoneName = status.zone_name || '';
      queueLength = status.queue_length;
      queue = q;
    } catch { /* ignore */ }
    loading = false;
  }

  $effect(() => { refresh(); });

  // Auto-refresh
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  $effect(() => {
    pollInterval = setInterval(refresh, 5000);
    return () => { if (pollInterval) clearInterval(pollInterval); };
  });

  async function addTrack() {
    if (!addQuery.trim() || adding) return;
    adding = true;
    try {
      const r = await api.partyAddTrack(addQuery.trim(), zone?.id ?? undefined);
      if (r.added) {
        recentAdds = [`${r.track} - ${r.artist}`, ...recentAdds.slice(0, 9)];
        notifications.success(`Ajoute : ${r.track}`);
        addQuery = '';
        refresh();
      }
    } catch (e: any) {
      notifications.error(e?.message || 'Titre non trouve');
    }
    adding = false;
  }

  // Upvote tracking (local state — server doesn't persist votes yet)
  let votes = $state<Record<number, number>>({});
  function upvote(position: number) {
    votes = { ...votes, [position]: (votes[position] || 0) + 1 };
  }

  function sharePartyLink() {
    const url = window.location.origin + '/#party';
    navigator.clipboard.writeText(url);
    notifications.success('Lien copie !');
  }

  let showQR = $state(false);
  let partyUrl = $derived(window.location.origin + '/#party');
  // Simple QR code via external API (no dependency needed)
  let qrUrl = $derived(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(partyUrl)}`);
</script>

<div class="party-view">
  <header class="view-header">
    <h2>Mode Party</h2>
    <button class="share-btn" onclick={sharePartyLink}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
      Partager
    </button>
    <button class="share-btn" onclick={() => showQR = !showQR}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="3" height="3" /><rect x="18" y="18" width="3" height="3" /></svg>
      QR Code
    </button>
  </header>

  {#if showQR}
    <div class="qr-section">
      <img class="qr-img" src={qrUrl} alt="QR Code Party" />
      <p class="qr-hint">Scannez pour rejoindre la party !</p>
      <p class="qr-url">{partyUrl}</p>
    </div>
  {/if}

  {#if loading}
    <div class="empty">Chargement...</div>
  {:else}
    <!-- Now Playing -->
    <div class="now-section">
      {#if currentTrack}
        <div class="now-card">
          {#if currentTrack.cover_path}
            <img class="now-cover" src={api.artworkUrl(currentTrack.cover_path)} alt="" />
          {:else}
            <div class="now-cover-placeholder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
            </div>
          {/if}
          <div class="now-info">
            <span class="now-label">En cours sur {zoneName}</span>
            <span class="now-title">{currentTrack.title}</span>
            <span class="now-artist">{currentTrack.artist}</span>
          </div>
          <div class="now-anim">
            <span class="bar"></span>
            <span class="bar"></span>
            <span class="bar"></span>
          </div>
        </div>
      {:else}
        <div class="now-card empty-card">
          <span>Aucune lecture en cours</span>
        </div>
      {/if}
    </div>

    <!-- Add track -->
    <div class="add-section">
      <h3>Ajouter un titre</h3>
      <div class="add-row">
        <input
          type="text"
          placeholder="Titre, artiste, album..."
          bind:value={addQuery}
          onkeydown={(e) => e.key === 'Enter' && addTrack()}
          disabled={adding}
        />
        <button onclick={addTrack} disabled={adding || !addQuery.trim()}>
          {adding ? '...' : 'Ajouter'}
        </button>
      </div>
      {#if recentAdds.length > 0}
        <div class="recent-adds">
          {#each recentAdds as item}
            <span class="recent-chip">{item}</span>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Queue -->
    <div class="queue-section">
      <h3>File d'attente ({queueLength} titres)</h3>
      <div class="queue-list">
        {#each queue as item}
          <div class="queue-row" class:current={item.is_current}>
            <span class="q-pos">{item.position + 1}</span>
            <div class="q-info">
              <span class="q-title">{item.title}</span>
              <span class="q-artist">{item.artist}</span>
            </div>
            {#if item.is_current}
              <span class="q-now">NOW</span>
            {:else}
              <button class="upvote-btn" onclick={() => upvote(item.position)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="18 15 12 9 6 15" /></svg>
                {#if votes[item.position]}<span class="vote-count">{votes[item.position]}</span>{/if}
              </button>
            {/if}
          </div>
        {/each}
        {#if queue.length === 0}
          <div class="queue-empty">La file est vide. Ajoutez des titres !</div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .party-view { padding: 0 24px 100px; max-width: 700px; margin: 0 auto; }
  .view-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
  .view-header h2 { font-size: 1.4rem; color: var(--tune-text); margin: 0; flex: 1; }
  .share-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 14px; border: 1px solid var(--tune-border); border-radius: 8px;
    background: none; color: var(--tune-text-muted); cursor: pointer; font-size: 0.8rem;
    transition: all 0.12s;
  }
  .share-btn:hover { border-color: var(--tune-accent); color: var(--tune-accent); }

  .empty { text-align: center; padding: 60px 20px; color: var(--tune-text-muted); }

  /* Now playing card */
  .now-section { margin-bottom: 32px; }
  .now-card {
    display: flex; align-items: center; gap: 16px;
    padding: 16px 20px; border-radius: 16px;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(99, 102, 241, 0.05));
    border: 1px solid rgba(99, 102, 241, 0.2);
  }
  .now-card.empty-card { justify-content: center; color: var(--tune-text-muted); padding: 32px; }
  .now-cover { width: 64px; height: 64px; border-radius: 10px; object-fit: cover; flex-shrink: 0; }
  .now-cover-placeholder { width: 64px; height: 64px; border-radius: 10px; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; color: var(--tune-text-muted); flex-shrink: 0; }
  .now-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .now-label { font-size: 0.7rem; color: var(--tune-text-muted); text-transform: uppercase; letter-spacing: 1px; }
  .now-title { font-size: 1.1rem; font-weight: 600; color: var(--tune-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .now-artist { font-size: 0.9rem; color: var(--tune-text-secondary); }

  .now-anim { display: flex; gap: 3px; align-items: flex-end; height: 20px; }
  .now-anim .bar { width: 3px; background: var(--tune-accent); border-radius: 1px; animation: bar-bounce 1s ease-in-out infinite; }
  .now-anim .bar:nth-child(1) { height: 12px; animation-delay: 0s; }
  .now-anim .bar:nth-child(2) { height: 20px; animation-delay: 0.2s; }
  .now-anim .bar:nth-child(3) { height: 8px; animation-delay: 0.4s; }
  @keyframes bar-bounce { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.4); } }

  /* Add section */
  .add-section { margin-bottom: 32px; }
  .add-section h3 { font-size: 1rem; color: var(--tune-text); margin: 0 0 12px; }
  .add-row { display: flex; gap: 8px; }
  .add-row input {
    flex: 1; padding: 10px 16px; border: 1px solid var(--tune-border); border-radius: 12px;
    background: var(--tune-bg); color: var(--tune-text); font-size: 1rem; outline: none;
  }
  .add-row input:focus { border-color: var(--tune-accent); }
  .add-row button {
    padding: 10px 20px; border-radius: 12px; border: none; background: var(--tune-accent);
    color: white; cursor: pointer; font-size: 0.9rem; font-weight: 600;
    transition: opacity 0.12s;
  }
  .add-row button:disabled { opacity: 0.4; cursor: default; }

  .recent-adds { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .recent-chip {
    padding: 4px 10px; border-radius: 10px; background: rgba(99, 102, 241, 0.1);
    font-size: 0.75rem; color: var(--tune-text-secondary);
  }

  /* Queue */
  .queue-section h3 { font-size: 1rem; color: var(--tune-text); margin: 0 0 12px; }
  .queue-list { display: flex; flex-direction: column; gap: 2px; }
  .queue-row {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 14px; border-radius: 8px; background: var(--tune-surface);
    transition: background 0.1s;
  }
  .queue-row:hover { background: var(--tune-surface-hover); }
  .queue-row.current { background: rgba(99, 102, 241, 0.1); border-left: 3px solid var(--tune-accent); }
  .q-pos { font-size: 0.8rem; color: var(--tune-text-muted); width: 24px; text-align: center; font-variant-numeric: tabular-nums; }
  .q-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .q-title { font-size: 0.9rem; color: var(--tune-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .q-artist { font-size: 0.75rem; color: var(--tune-text-muted); }
  .q-now { font-size: 0.65rem; font-weight: 700; color: var(--tune-accent); letter-spacing: 1px; }
  .queue-empty { text-align: center; padding: 32px; color: var(--tune-text-muted); font-size: 0.9rem; }

  .upvote-btn {
    display: flex; align-items: center; gap: 3px;
    background: none; border: 1px solid var(--tune-border); border-radius: 8px;
    padding: 3px 8px; color: var(--tune-text-muted); cursor: pointer;
    font-size: 0.75rem; transition: all 0.12s;
  }
  .upvote-btn:hover { border-color: var(--tune-accent); color: var(--tune-accent); }
  .vote-count { font-weight: 700; color: var(--tune-accent); }

  .qr-section { text-align: center; margin-bottom: 24px; padding: 24px; background: var(--tune-surface); border-radius: 16px; }
  .qr-img { width: 200px; height: 200px; border-radius: 8px; image-rendering: pixelated; }
  .qr-hint { font-size: 0.9rem; color: var(--tune-text); margin: 12px 0 4px; }
  .qr-url { font-size: 0.75rem; color: var(--tune-text-muted); word-break: break-all; }
</style>
