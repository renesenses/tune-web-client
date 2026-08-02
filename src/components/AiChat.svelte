<script lang="ts">
  import { get } from 'svelte/store';
  import { currentZoneId } from '../lib/stores/zones';
  import { apiPost } from '../lib/api';
  import { t, locale } from '../lib/i18n';

  // Speech-recognition BCP-47 tag per UI language, so the mic follows the
  // user's locale instead of being pinned to French.
  const VOICE_LANGS: Record<string, string> = {
    fr: 'fr-FR', en: 'en-US', de: 'de-DE', es: 'es-ES', it: 'it-IT',
    zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR', ro: 'ro-RO', sv: 'sv-SE',
  };

  interface ChatMessage {
    role: 'user' | 'assistant';
    text: string;
    actions?: string[];
  }

  let open = $state(false);
  let input = $state('');
  let messages = $state<ChatMessage[]>([]);
  let loading = $state(false);
  let messagesEl = $state<HTMLDivElement | null>(null);
  let voiceListening = $state(false);

  const voiceEnabled = typeof localStorage !== 'undefined' && localStorage.getItem('tune_voice_ai_enabled') === 'true';
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  let recognition: any = null;

  function toggleVoice() {
    if (!SpeechRecognition) return;
    if (voiceListening) {
      recognition?.stop();
      voiceListening = false;
      return;
    }
    recognition = new SpeechRecognition();
    recognition.lang = VOICE_LANGS[get(locale)] ?? 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      input = transcript;
      voiceListening = false;
      send();
    };
    recognition.onerror = () => { voiceListening = false; };
    recognition.onend = () => { voiceListening = false; };
    recognition.start();
    voiceListening = true;
  }

  function toggle() {
    open = !open;
  }

  function scrollToBottom() {
    if (messagesEl) {
      requestAnimationFrame(() => {
        if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
      });
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    messages = [...messages, { role: 'user', text }];
    input = '';
    loading = true;
    scrollToBottom();

    try {
      let zoneId: number | null = null;
      currentZoneId.subscribe((v) => (zoneId = v))();

      const resp = await apiPost('/ai/query', {
        message: text,
        zone_id: zoneId,
      });

      const reply: ChatMessage = {
        role: 'assistant',
        text: resp.reply || resp.text || resp.message || JSON.stringify(resp),
        actions: resp.actions?.map((a: any) => a.description || a.type || String(a)) ?? [],
      };
      messages = [...messages, reply];
    } catch (e: any) {
      messages = [...messages, {
        role: 'assistant',
        text: get(t)('ai.error').replace('{msg}', e?.message || get(t)('ai.errorGeneric')),
      }];
    }

    loading = false;
    scrollToBottom();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // --- Draggable floating button (Pascal: the bubble could sit over a button) ---
  const FAB_POS_KEY = 'tune_ai_fab_pos';
  const FAB_SIZE = 48;
  let fabPos = $state<{ x: number; y: number } | null>(
    (() => {
      try {
        const s = localStorage.getItem(FAB_POS_KEY);
        return s ? (JSON.parse(s) as { x: number; y: number }) : null;
      } catch {
        return null;
      }
    })(),
  );
  let fabDragging = false;
  let fabMoved = false;
  let fabStartX = 0;
  let fabStartY = 0;
  let fabOffX = 0;
  let fabOffY = 0;

  function clampFab(x: number, y: number) {
    const maxX = window.innerWidth - FAB_SIZE - 4;
    const maxY = window.innerHeight - FAB_SIZE - 4;
    return { x: Math.max(4, Math.min(maxX, x)), y: Math.max(4, Math.min(maxY, y)) };
  }

  function onFabPointerDown(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    fabOffX = e.clientX - rect.left;
    fabOffY = e.clientY - rect.top;
    fabStartX = e.clientX;
    fabStartY = e.clientY;
    fabDragging = true;
    fabMoved = false;
    el.setPointerCapture(e.pointerId);
  }

  function onFabPointerMove(e: PointerEvent) {
    if (!fabDragging) return;
    if (!fabMoved && Math.hypot(e.clientX - fabStartX, e.clientY - fabStartY) < 4) return;
    fabMoved = true;
    fabPos = clampFab(e.clientX - fabOffX, e.clientY - fabOffY);
  }

  function onFabPointerUp(e: PointerEvent) {
    if (!fabDragging) return;
    fabDragging = false;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (fabMoved && fabPos) {
      try {
        localStorage.setItem(FAB_POS_KEY, JSON.stringify(fabPos));
      } catch {
        /* ignore */
      }
    }
  }

  function onFabClick() {
    // A drag ends with a click event too — swallow it so moving never toggles.
    if (fabMoved) {
      fabMoved = false;
      return;
    }
    toggle();
  }
</script>

<!-- Floating button -->
<button
  class="ai-fab"
  onclick={onFabClick}
  onpointerdown={onFabPointerDown}
  onpointermove={onFabPointerMove}
  onpointerup={onFabPointerUp}
  style={fabPos ? `left:${fabPos.x}px; top:${fabPos.y}px; right:auto; bottom:auto;` : ''}
  title={$t('ai.fabTitle')}
  class:ai-fab-open={open}
>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
  <svg class="ai-sparkle" viewBox="0 0 24 24" fill="currentColor" width="10" height="10">
    <path d="M12 0l2.5 7.5L22 10l-7.5 2.5L12 20l-2.5-7.5L2 10l7.5-2.5z" />
  </svg>
</button>

<!-- Chat panel -->
{#if open}
  <div class="ai-panel">
    <div class="ai-header">
      <span class="ai-title">Tune AI</span>
      <button class="ai-close" onclick={() => open = false}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <div class="ai-messages" bind:this={messagesEl}>
      {#if messages.length === 0}
        <div class="ai-empty">
          <p>{$t('ai.emptyPrompt')}</p>
          <p class="ai-examples">{$t('ai.examplesLabel')}</p>
          <ul class="ai-examples-list">
            <li>{$t('ai.example1')}</li>
            <li>{$t('ai.example2')}</li>
            <li>{$t('ai.example3')}</li>
          </ul>
        </div>
      {/if}

      {#each messages as msg}
        <div class="ai-msg" class:ai-msg-user={msg.role === 'user'} class:ai-msg-assistant={msg.role === 'assistant'}>
          <div class="ai-msg-bubble">{msg.text}</div>
          {#if msg.actions && msg.actions.length > 0}
            <div class="ai-actions">
              {#each msg.actions as action}
                <span class="ai-action-chip">{action}</span>
              {/each}
            </div>
          {/if}
        </div>
      {/each}

      {#if loading}
        <div class="ai-msg ai-msg-assistant">
          <div class="ai-msg-bubble ai-loading">
            <span class="ai-dot"></span>
            <span class="ai-dot"></span>
            <span class="ai-dot"></span>
          </div>
        </div>
      {/if}
    </div>

    <div class="ai-input-row">
      {#if voiceEnabled && SpeechRecognition}
        <button class="ai-mic" class:listening={voiceListening} onclick={toggleVoice} title={$t('ai.voiceTitle')}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
          </svg>
        </button>
      {/if}
      <input
        type="text"
        class="ai-input"
        placeholder={voiceListening ? $t('ai.placeholderListening') : $t('ai.placeholder')}
        bind:value={input}
        onkeydown={handleKeydown}
        disabled={loading || voiceListening}
      />
      <button class="ai-send" onclick={send} disabled={loading || !input.trim()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </div>
  </div>
{/if}

<style>
  .ai-fab {
    position: fixed;
    bottom: 110px;
    right: 20px;
    z-index: 200;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--tune-accent);
    color: #fff;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    transition: transform 0.15s, box-shadow 0.15s;
    touch-action: none;
  }

  .ai-fab:hover {
    transform: scale(1.08);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
  }

  .ai-fab-open {
    background: var(--tune-grey2);
  }

  .ai-sparkle {
    position: absolute;
    top: 6px;
    right: 6px;
    color: #fbbf24;
  }

  .ai-panel {
    position: fixed;
    bottom: 0;
    right: 0;
    z-index: 201;
    width: 350px;
    height: 100%;
    max-height: 100vh;
    background: var(--tune-surface);
    border-left: 1px solid var(--tune-border);
    display: flex;
    flex-direction: column;
    animation: slideInRight 0.2s ease-out;
    box-shadow: -4px 0 20px rgba(0, 0, 0, 0.3);
  }

  @keyframes slideInRight {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  .ai-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--tune-border);
    flex-shrink: 0;
  }

  .ai-title {
    font-family: var(--font-label);
    font-size: 16px;
    font-weight: 600;
  }

  .ai-close {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.12s;
  }

  .ai-close:hover {
    color: var(--tune-text);
  }

  .ai-messages {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .ai-empty {
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    font-size: 13px;
    text-align: center;
    padding: var(--space-xl) var(--space-md);
  }

  .ai-examples {
    margin-top: var(--space-md);
    font-weight: 600;
    color: var(--tune-text-secondary);
  }

  .ai-examples-list {
    list-style: none;
    margin-top: var(--space-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    font-style: italic;
    color: var(--tune-text-muted);
  }

  .ai-msg {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .ai-msg-user {
    align-items: flex-end;
  }

  .ai-msg-assistant {
    align-items: flex-start;
  }

  .ai-msg-bubble {
    max-width: 85%;
    padding: 8px 12px;
    border-radius: var(--radius-lg);
    font-family: var(--font-body);
    font-size: 13px;
    line-height: 1.4;
    word-break: break-word;
  }

  .ai-msg-user .ai-msg-bubble {
    background: var(--tune-accent);
    color: #fff;
    border-bottom-right-radius: 4px;
  }

  .ai-msg-assistant .ai-msg-bubble {
    background: var(--tune-grey2);
    color: var(--tune-text);
    border-bottom-left-radius: 4px;
  }

  .ai-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 2px;
  }

  .ai-action-chip {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    background: rgba(107, 110, 217, 0.15);
    color: var(--tune-accent);
    border-radius: 9999px;
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 500;
  }

  .ai-loading {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 10px 14px;
  }

  .ai-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--tune-text-muted);
    animation: dotPulse 1.4s ease-in-out infinite;
  }

  .ai-dot:nth-child(2) { animation-delay: 0.2s; }
  .ai-dot:nth-child(3) { animation-delay: 0.4s; }

  @keyframes dotPulse {
    0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
    40% { opacity: 1; transform: scale(1); }
  }

  .ai-input-row {
    display: flex;
    gap: var(--space-sm);
    padding: var(--space-md);
    border-top: 1px solid var(--tune-border);
    flex-shrink: 0;
  }

  .ai-input {
    flex: 1;
    padding: 8px 12px;
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s;
  }

  .ai-input:focus {
    border-color: var(--tune-accent);
  }

  .ai-input::placeholder {
    color: var(--tune-text-muted);
  }

  .ai-send {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--tune-accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    flex-shrink: 0;
    transition: opacity 0.12s;
  }

  .ai-send:hover:not(:disabled) {
    opacity: 0.9;
  }

  .ai-send:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .ai-mic {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: var(--tune-text-secondary);
    border: 1px solid var(--tune-border, #333);
    border-radius: var(--radius-md);
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s;
  }
  .ai-mic:hover { color: var(--tune-accent); border-color: var(--tune-accent); }
  .ai-mic.listening {
    color: #ef4444;
    border-color: #ef4444;
    animation: pulse-mic 1.2s infinite;
  }
  @keyframes pulse-mic {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  @media (max-width: 768px) {
    .ai-panel {
      width: 100%;
      border-left: none;
    }

    .ai-fab {
      bottom: 80px;
      right: 12px;
      width: 42px;
      height: 42px;
    }
  }
</style>
