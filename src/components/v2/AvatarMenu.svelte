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
  import { V2_THEMES, type V2Theme } from '../../lib/v2Theme';
  import { t } from '../../lib/i18n';
  import { get } from 'svelte/store';
  import { searchSettings, type V2SettingsHit } from '../../lib/v2Settings';
  import { v2SettingsTarget } from '../../lib/stores/v2SettingsNav';
  import * as api from '../../lib/api';
  import { notifications } from '../../lib/stores/notifications';

  const LEVELS: SettingsLevel[] = ['beginner', 'intermediate', 'expert'];
  let open = $state(false);
  const level = $derived($preferences.settingsLevel);

  // ── Identité du compte cloud ──────────────────────────────────────────────
  //
  // L'en-tête du menu affichait « Bertrand » / « MozaikLabs » EN DUR. Chez tout
  // autre utilisateur, le menu nommait donc Bertrand. On lit le MÊME contrat
  // que la vue Réglages v1 (`loadCloudStatus`) : `GET /cloud/sso/status` rend
  // `{ configured, connected, user: { email, display_name, avatar_url } }`.
  //
  // Non connecté, on n'invente aucun nom : l'en-tête le dit, et l'entrée
  // « Se déconnecter » disparaît — proposer de quitter une session qui n'existe
  // pas est exactement le genre de bouton qui ment.
  let ssoConnected = $state(false);
  let ssoName = $state('');
  let ssoEmail = $state('');
  let ssoAvatar = $state('');
  let signingOut = $state(false);

  async function loadSso() {
    try {
      const sso: any = await api.apiFetch('/cloud/sso/status');
      if (sso?.connected && sso?.user) {
        ssoConnected = true;
        ssoName = sso.user.display_name || sso.user.email || '';
        ssoEmail = sso.user.email || '';
        ssoAvatar = sso.user.avatar_url || '';
        return;
      }
    } catch {
      // Serveur muet ou hors ligne : on reste sur l'état « non connecté »
      // plutôt que d'afficher une identité qu'on ne tient de personne.
    }
    ssoConnected = false;
    ssoName = '';
    ssoEmail = '';
    ssoAvatar = '';
  }

  // Relu à CHAQUE ouverture, et non une fois au montage : la session peut
  // avoir été fermée ailleurs (autre onglet, écran Réglages v1, expiration)
  // pendant que le menu restait monté. L'en-tête n'est visible qu'ouvert, donc
  // rien ne justifie de sonder le serveur avant.
  $effect(() => {
    if (open) void loadSso();
  });

  async function signOut() {
    signingOut = true;
    try {
      await api.ssoDisconnect();
      await loadSso();
      notifications.success(get(t)('settings.cloudDisconnected'));
      close();
    } catch (e: any) {
      notifications.error(e?.message ?? get(t)('common.error'));
    }
    signingOut = false;
  }

  function setLevel(l: SettingsLevel) {
    preferences.update((p) => ({ ...p, settingsLevel: l }));
  }
  const theme = $derived($preferences.v2Theme);
  function setTheme(t: V2Theme) {
    preferences.update((p) => ({ ...p, v2Theme: t }));
  }
  // Recherche de réglages : lit la MÊME carte que l'écran Réglages v2
  // (lib/v2Settings), donc l'index ne peut pas diverger de l'écran réel.
  // On résout les clés i18n pour chercher sur les libellés affichés — un
  // utilisateur tape « me suivre », pas « settings.followMe ».
  let q = $state('');
  const hits = $derived<V2SettingsHit[]>(searchSettings(q, (k) => $t(k as any)));

  function openSetting(h: V2SettingsHit) {
    v2SettingsTarget.set({ tab: h.tab.id, section: h.section.id });
    activeView.set('settings');
    q = '';
    close();
  }

  function toggle() { open = !open; if (!open) q = ''; }
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
        {#if ssoAvatar}
          <img class="avatar sm" src={ssoAvatar} alt="" />
        {:else}
          <div class="avatar sm"></div>
        {/if}
        <div class="avid">
          {#if ssoConnected}
            <div class="avname">{ssoName}</div>
            {#if ssoEmail && ssoEmail !== ssoName}<div class="avmail">{ssoEmail}</div>{/if}
          {:else}
            <div class="avname">{$t('settings.notConnected')}</div>
          {/if}
        </div>
      </div>
      <div class="sep"></div>

      <div class="sfield">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input
          type="search"
          placeholder="Rechercher un réglage…"
          bind:value={q}
          onkeydown={(e) => { if (e.key === 'Enter' && hits.length) openSetting(hits[0]); if (e.key === 'Escape') q = ''; }}
        />
      </div>

      {#if q.trim().length >= 2}
        <div class="hits">
          {#if hits.length}
            {#each hits as h (h.tab.id + '/' + h.section.id)}
              <button class="hit" onclick={() => openSetting(h)}>
                <span class="hl">{h.label}</span>
                <span class="ht">{h.tab.label}</span>
              </button>
            {/each}
          {:else}
            <div class="nohit">Aucun réglage pour « {q.trim()} ».</div>
          {/if}
        </div>
        <div class="sep"></div>
      {/if}

      <div class="sec">Interface</div>
      <div class="seg">
        {#each LEVELS as l (l)}
          <button class:on={level === l} onclick={() => setLevel(l)}>{LEVEL_LABELS[l]}</button>
        {/each}
      </div>
      <div class="hint">Ce que Tune vous montre. Indépendant de votre offre.</div>

      <div class="sep"></div>

      <div class="sec">Thèmes</div>
      <div class="themes">
        {#each V2_THEMES as t (t.id)}
          <button
            class="sw"
            class:on={theme === t.id}
            title={t.label}
            aria-label={t.label}
            aria-pressed={theme === t.id}
            style="--sw-bg:{t.swatch[0]}; --sw-acc:{t.swatch[1]}"
            onclick={() => setTheme(t.id)}
          ></button>
        {/each}
      </div>
      <div class="hint">{V2_THEMES.find((t) => t.id === theme)?.label ?? ''}</div>

      <div class="sep"></div>
      <button class="item" onclick={() => { activeView.set('settings'); close(); }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 2.6V1a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 17 2.6a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
        Réglages
      </button>
      {#if ssoConnected}
        <button class="item" onclick={signOut} disabled={signingOut}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 17l5-5-5-5M21 12H9M13 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8" /></svg>
          {signingOut ? $t('common.loading') : $t('settings.signOut')}
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .avwrap{position:relative; font-family:var(--v2-sans)}
  .avatar{width:44px; height:44px; border-radius:50%; border:2px solid var(--v2-line2); cursor:pointer;
    position:relative; background:linear-gradient(135deg,var(--v2-av1),var(--v2-av2)); padding:0}
  .avatar::after{content:""; position:absolute; right:1px; bottom:1px; width:10px; height:10px;
    border-radius:50%; background:var(--v2-acc1); border:2px solid var(--v2-bg)}
  .avatar.sm{width:38px; height:38px}

  .avmenu{position:absolute; right:0; top:52px; width:250px; z-index:60;
    background:var(--v2-surface); border:1px solid var(--v2-line2); border-radius:16px; padding:12px;
    box-shadow:var(--v2-sh-menu); color:var(--v2-txt)}
  .avhead{display:flex; align-items:center; gap:11px; padding:6px 6px 10px}
  /* Le bloc d'identité doit pouvoir RÉTRÉCIR : sans `min-width:0`, une adresse
     longue pousse la largeur du menu au lieu de s'élider. */
  .avid{min-width:0}
  .avname{font-weight:700; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .avmail{font-family:var(--v2-mono); font-size:10px; letter-spacing:.12em; color:var(--v2-txt2); margin-top:2px;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  /* Avatar distant : même gabarit que la pastille dégradée qu'il remplace. */
  img.avatar.sm{object-fit:cover; background:var(--v2-line2)}
  .sep{height:1px; background:var(--v2-line); margin:6px 0}
  .sec{font-family:var(--v2-mono); font-size:9.5px; letter-spacing:.16em; color:var(--v2-txt3);
    text-transform:uppercase; padding:6px 6px 8px}
  .seg{display:flex; gap:2px; padding:3px; border-radius:12px; background:var(--v2-surface2); border:1px solid var(--v2-line)}
  .seg button{flex:1; border:0; background:transparent; color:var(--v2-txt2); font-family:inherit;
    font-size:11.5px; font-weight:600; padding:7px 4px; border-radius:9px; cursor:pointer; transition:.15s}
  .seg button:hover{color:var(--v2-txt)}
  .seg button.on{color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); box-shadow:0 3px 10px var(--v2-glow)}
  .sfield{position:relative; display:flex; align-items:center; margin:2px 4px 6px}
  .sfield svg{position:absolute; left:11px; width:15px; height:15px; color:var(--v2-txt3); pointer-events:none}
  .sfield input{width:100%; height:36px; border-radius:10px; border:1px solid var(--v2-line2);
    background:var(--v2-surface2); color:var(--v2-txt); font:12.5px var(--v2-sans); padding:0 10px 0 33px; outline:none}
  .sfield input::placeholder{color:var(--v2-txt3)}
  .sfield input:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .sfield input::-webkit-search-cancel-button{-webkit-appearance:none}
  .hits{display:flex; flex-direction:column; gap:1px; max-height:190px; overflow-y:auto; padding:0 2px}
  .hits::-webkit-scrollbar{width:7px}.hits::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .hit{display:flex; align-items:baseline; justify-content:space-between; gap:10px; width:100%; padding:8px;
    border:0; border-radius:8px; background:transparent; cursor:pointer; text-align:left; color:var(--v2-txt2)}
  .hit:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .hit .hl{font-size:12.5px; font-weight:500; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .hit .ht{font:9.5px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3); flex:0 0 auto}
  .nohit{padding:10px 8px; font-size:11.5px; color:var(--v2-txt3)}
  .themes{display:grid; grid-template-columns:repeat(6,1fr); gap:6px; padding:2px 4px 0}
  .sw{position:relative; aspect-ratio:1; border-radius:9px; cursor:pointer; padding:0;
    border:1px solid var(--v2-line2); background:var(--sw-bg); transition:.15s}
  /* Pastille d'accent : dit la couleur du thème sans avoir à l'appliquer. */
  .sw::after{content:""; position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
    width:52%; height:52%; border-radius:50%; background:var(--sw-acc)}
  .sw:hover{transform:translateY(-1px); border-color:var(--sw-acc)}
  .sw.on{border-color:var(--sw-acc); box-shadow:0 0 0 2px var(--v2-surface), 0 0 0 3px var(--sw-acc)}
  .hint{font-size:10.5px; color:var(--v2-txt3); line-height:1.35; padding:8px 6px 2px}
  .item{display:flex; align-items:center; gap:11px; width:100%; padding:9px 8px; border:0; cursor:pointer;
    border-radius:9px; background:transparent; color:var(--v2-txt2); font-family:inherit; font-size:13.5px; font-weight:500; text-align:left}
  .item:hover{background:var(--v2-hover); color:var(--v2-txt)}
  /* Déconnexion en cours : plus de survol, plus de curseur cliquable — sinon
     rien ne distingue un bouton qui travaille d'un bouton qui n'a rien fait. */
  .item:disabled{opacity:.55; cursor:default}
  .item:disabled:hover{background:transparent; color:var(--v2-txt2)}
  .item svg{width:17px; height:17px}
</style>
