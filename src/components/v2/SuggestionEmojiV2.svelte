<script lang="ts">
  import { onMount } from 'svelte';
  import { t, locale } from '../../lib/i18n';
  import { suggererEmoji, suggestionsActives, SUGGESTIONS_CHANGEES, noterRecent, nomEmoji } from '../../lib/emojis';
  let { saisie, texte, disponible = true, onchoisir }: { saisie?: HTMLTextAreaElement; texte: string; disponible?: boolean; onchoisir: (texte: string) => void } = $props();
  let active = $state(suggestionsActives());
  let auBout = $state(false);
  let composition = $state(false);
  let ignore = $state<string | null>(null);
  const emoji = $derived(suggererEmoji(texte));
  const visible = $derived(active && disponible && auBout && !composition && ignore !== texte && emoji && (!saisie || saisie.maxLength < 0 || texte.length + 1 + emoji.e.length <= saisie.maxLength));
  onMount(() => {
    const changer = (ev: Event) => { active = (ev as CustomEvent<boolean>).detail; };
    window.addEventListener(SUGGESTIONS_CHANGEES, changer);
    return () => window.removeEventListener(SUGGESTIONS_CHANGEES, changer);
  });
  function choisir() {
    if (!visible || !emoji) return;
    noterRecent(emoji.e);
    onchoisir(' ' + emoji.e);
    saisie?.focus();
  }
  $effect(() => {
    const el = saisie;
    if (!el) return;
    const position = () => { auBout = document.activeElement === el && el.selectionStart === el.value.length && el.selectionEnd === el.value.length; };
    const debut = () => { composition = true; };
    const fin = () => { composition = false; position(); };
    const clavier = (ev: KeyboardEvent) => {
      if (!visible || ev.isComposing || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); ignore = texte; }
      else if (ev.key === 'Tab' && !ev.shiftKey) { ev.preventDefault(); ev.stopPropagation(); choisir(); }
    };
    const evenements = ['input', 'select', 'keyup', 'click', 'focus', 'blur'];
    for (const nom of evenements) el.addEventListener(nom, position);
    el.addEventListener('compositionstart', debut);
    el.addEventListener('compositionend', fin);
    el.addEventListener('keydown', clavier);
    position();
    return () => {
      for (const nom of evenements) el.removeEventListener(nom, position);
      el.removeEventListener('compositionstart', debut);
      el.removeEventListener('compositionend', fin);
      el.removeEventListener('keydown', clavier);
    };
  });
</script>

<span class="annonce" role="status" aria-live="polite">{visible && emoji ? `${$t('v2.circle.emoji.suggestion' as any)} ${nomEmoji(emoji, $locale)}` : ''}</span>
{#if visible && emoji}
  <div class="suggestion" data-suggestion-emoji>
    <button type="button" onpointerdown={(ev) => ev.preventDefault()} onclick={choisir} title={nomEmoji(emoji, $locale)}>{$t('v2.circle.emoji.suggestion' as any)} {emoji.e} <kbd>{$t('v2.circle.emoji.suggestionKey' as any)}</kbd></button>
  </div>
{/if}

<style>
  .annonce{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  .suggestion{flex:1 1 100%;min-width:0}
  button{font:inherit;color:var(--v2-txt);background:var(--v2-surface2);border:1px solid var(--v2-line);border-radius:8px;padding:6px 10px;cursor:pointer}
  button:focus-visible{outline:2px solid var(--v2-acc1);outline-offset:2px}
  kbd{font:inherit;color:var(--v2-txt2);margin-inline-start:8px}
</style>
