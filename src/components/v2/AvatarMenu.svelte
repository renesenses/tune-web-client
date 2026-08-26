<script lang="ts">
  /**
   * Menu avatar (coin haut-droit) du nouveau client.
   *
   * Abrite le sélecteur de NIVEAU D'INTERFACE (Essential / Advanced / Expert),
   * caché par défaut : on n'expose la profondeur de l'UI que sur ouverture du
   * menu. Le choix écrit dans `preferences.settingsLevel` — même réglage
   * synchronisé que la vue Réglages, donc un seul curseur pour toute l'app.
   * Défaut : Essential (débutant) pour tous.
   */
  import { activeView } from '../../lib/stores/navigation';
  import { preferences } from '../../lib/stores/preferences';
  import { LEVEL_LABELS, type SettingsLevel } from '../../lib/uiLevel';

  const LEVELS: SettingsLevel[] = ['beginner', 'intermediate', 'expert'];
  let open = $state(false);
  const level = $derived($preferences.settingsLevel);

  function setLevel(l: SettingsLevel) {
    preferences.update((p) => ({ ...p, settingsLevel: l }));
  }
  function toggle() { open = !open; }
  function close() { open = false; }
  function onDocClick(e: MouseEvent) {
    if (!(e.target as HTMLElement)?.closest('.avwrap')) open = false;
  }
</script>

<svelte:window onclick={onDocClick} />

<div class="avwrap tune-v2">
  <button class="avatar" onclick={toggle} aria-label="Profil" aria-haspopup="menu" aria-expanded={open}></button>

  {#if open}
    <div class="avmenu">
      <div class="avhead">
        <div class="avatar sm"></div>
        <div>
          <div class="avname">Bertrand</div>
          <div class="avmail">MozaikLabs</div>
        </div>
      </div>
      <div class="sep"></div>

      <div class="sec">Interface</div>
      <div class="seg">
        {#each LEVELS as l (l)}
          <button class:on={level === l} onclick={() => setLevel(l)}>{LEVEL_LABELS[l]}</button>
        {/each}
      </div>
      <div class="hint">Ce que Tune vous montre. Indépendant de votre offre.</div>

      <div class="sep"></div>
      <button class="item" onclick={() => { activeView.set('settings'); close(); }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 2.6V1a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 17 2.6a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
        Réglages
      </button>
      <button class="item" onclick={close}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 17l5-5-5-5M21 12H9M13 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8" /></svg>
        Se déconnecter
      </button>
    </div>
  {/if}
</div>

<style>
  .avwrap{position:relative; font-family:var(--v2-sans)}
  .avatar{width:44px; height:44px; border-radius:50%; border:2px solid var(--v2-line2); cursor:pointer;
    position:relative; background:linear-gradient(135deg,#334,#556); padding:0}
  .avatar::after{content:""; position:absolute; right:1px; bottom:1px; width:10px; height:10px;
    border-radius:50%; background:var(--v2-acc1); border:2px solid var(--v2-bg)}
  .avatar.sm{width:38px; height:38px}

  .avmenu{position:absolute; right:0; top:52px; width:250px; z-index:60;
    background:var(--v2-surface); border:1px solid var(--v2-line2); border-radius:16px; padding:12px;
    box-shadow:0 20px 50px rgba(0,0,0,.55); color:var(--v2-txt)}
  .avhead{display:flex; align-items:center; gap:11px; padding:6px 6px 10px}
  .avname{font-weight:700; font-size:14px}
  .avmail{font-family:var(--v2-mono); font-size:10px; letter-spacing:.12em; color:var(--v2-txt2); margin-top:2px}
  .sep{height:1px; background:var(--v2-line); margin:6px 0}
  .sec{font-family:var(--v2-mono); font-size:9.5px; letter-spacing:.16em; color:var(--v2-txt3);
    text-transform:uppercase; padding:6px 6px 8px}
  .seg{display:flex; gap:2px; padding:3px; border-radius:12px; background:var(--v2-surface2); border:1px solid var(--v2-line)}
  .seg button{flex:1; border:0; background:transparent; color:var(--v2-txt2); font-family:inherit;
    font-size:11.5px; font-weight:600; padding:7px 4px; border-radius:9px; cursor:pointer; transition:.15s}
  .seg button:hover{color:var(--v2-txt)}
  .seg button.on{color:#04121a; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); box-shadow:0 3px 10px rgba(0,212,170,.25)}
  .hint{font-size:10.5px; color:var(--v2-txt3); line-height:1.35; padding:8px 6px 2px}
  .item{display:flex; align-items:center; gap:11px; width:100%; padding:9px 8px; border:0; cursor:pointer;
    border-radius:9px; background:transparent; color:var(--v2-txt2); font-family:inherit; font-size:13.5px; font-weight:500; text-align:left}
  .item:hover{background:#0e1a22; color:var(--v2-txt)}
  .item svg{width:17px; height:17px}
</style>
