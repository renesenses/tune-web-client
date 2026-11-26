<script lang="ts">
  import { onMount } from 'svelte';
  import * as api from '../../lib/api';
  import { t, tn } from '../../lib/i18n';
  import { copyText } from '../../lib/utils';
  import type { MediaServer } from '../../lib/types';
  import type { Axe } from '../../lib/indexationUpnp';
  import {
    nomDeSource, vueSource, detailsSource, texteDiagnostic, presenceDe, nomConvivial,
  } from '../../lib/serveursMediaV2';
  /**
   * Sources de bibliothèque UPnP (harmonisation UI, rc14).
   *
   * Une ligne par source : icône d'état, nom UNE fois, pastille d'état, ligne
   * de méta, UNE action principale, un menu « … ». Le message est construit
   * ici (`vueSource`) ; le texte brut du serveur ne sort que sous « Details »,
   * replié, avec le bouton « Copy diagnostic » pour le support.
   */
  let { server, container, name, servers = null, onrelever }: {
    server: { id: string; name: string } | null;
    container: string;
    name?: string;
    /** La découverte, pour dire « Offline » quand le rapport n'a pas de code. */
    servers?: MediaServer[] | null;
    /** Ouvre le réglage du plafond désigné (panneau Limits de l'écran). */
    onrelever?: (axe: Axe) => void;
  } = $props();
  let sources = $state<api.UpnpLibrarySource[]>([]);
  let error = $state('');
  let busy = $state(false);
  let loaded = $state(false);
  let menu = $state<string | null>(null);
  let copie = $state<{ key: string; ok: boolean } | null>(null);
  let alive = true;
  const current = $derived(sources.find(s => s.udn === server?.id && s.container === container));
  const presence = $derived(presenceDe(servers));
  const serveurDe = (s: api.UpnpLibrarySource) => servers?.find((m) => m.id === s.udn) ?? null;

  async function refresh() {
    try {
      const result = await api.getUpnpLibrarySources();
      if (alive) { sources = result.items; loaded = true; error = ''; }
    } catch {
      // Le motif brut de la route ne s'affiche plus : phrase traduite.
      if (alive) { error = $t('v2.ms.genericFailure' as any); }
    }
  }
  onMount(() => {
    alive = true;
    void refresh();
    const timer = setInterval(refresh, 5000);
    const fermer = (e: MouseEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.('.plus')) menu = null;
    };
    document.addEventListener('click', fermer);
    return () => { alive = false; clearInterval(timer); document.removeEventListener('click', fermer); };
  });
  async function add() {
    if (!server || busy) return;
    busy = true;
    try { await api.addUpnpLibrarySource(server.id, container, name); await refresh(); }
    catch { error = $t('v2.ms.indexFailed' as any); }
    finally { busy = false; }
  }
  async function act(source: api.UpnpLibrarySource, action: 'sync' | 'pause' | 'confirm') {
    busy = true;
    menu = null;
    try { await api.actUpnpLibrarySource(source, action); await refresh(); }
    catch { error = $t('v2.ms.genericFailure' as any); }
    finally { busy = false; }
  }
  async function copier(source: api.UpnpLibrarySource) {
    const ok = await copyText(texteDiagnostic(source, serveurDe(source)));
    copie = { key: source.key, ok };
    setTimeout(() => { if (copie?.key === source.key) copie = null; }, 2500);
  }

  /** La ligne de méta : produit, dossier, comptes, dernière synchro. */
  function meta(source: api.UpnpLibrarySource): string {
    const n = nomDeSource(source.name);
    const srv = serveurDe(source);
    const parts: string[] = [];
    if (n.produit) parts.push(n.produit);
    else if (srv && nomConvivial(srv) !== n.nom) parts.push(nomConvivial(srv));
    parts.push(n.chemin ?? $t('v2.ms.wholeServer' as any));
    const d = detailsSource(source);
    if (d.pistes != null) {
      parts.push($t('v2.ms.indexedCounts' as any)
        .replace('{tracks}', $tn('v2.common.trackCountN', d.pistes))
        .replace('{albums}', $tn('v2.lib.map.albumsN', d.albums ?? 0)));
    }
    if (source.last_success) {
      parts.push(`${$t('upnp.sync.last' as any)} ${new Date(source.last_success * 1000).toLocaleString()}`);
    }
    return parts.join(' · ');
  }
</script>

<section class="sources" aria-label={$t('upnp.sync.title' as any)}>
  <header class="hd">
    <div class="hd-txt">
      <h2>{$t('upnp.sync.title' as any)}</h2>
      <p class="aide">{$t('upnp.sync.hint' as any)}</p>
    </div>
    {#if server && !current}
      <button class="v2-btn ajout" disabled={busy || !loaded} onclick={add}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
        {$t('upnp.sync.add' as any)}
      </button>
    {/if}
  </header>
  {#if error}<p class="erreur" role="alert">{error}</p>{/if}
  {#each sources as source (source.key)}
    {@const v = vueSource(source, presence)}
    {@const n = nomDeSource(source.name)}
    {@const d = detailsSource(source)}
    <article class="src" data-etat={v.etat}>
      <span class="ic {v.ton}" aria-hidden="true">
        {#if v.etat === 'offline'}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h.01"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/><path d="M5 12.86a10 10 0 0 1 5.17-2.69"/><path d="M19 12.86a10 10 0 0 0-2-1.37"/><path d="M2 8.82a15 15 0 0 1 4.18-2.65"/><path d="M22 8.82a15 15 0 0 0-11.29-3.76"/><path d="m2 2 20 20"/></svg>
        {:else if v.ton === 'warn' || v.ton === 'err'}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
        {:else if v.ton === 'ok'}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
        {/if}
      </span>
      <div class="corps">
        <div class="nom">
          <strong>{n.nom}</strong>
          <span class="etat {v.ton}" aria-live="polite"><span class="pt" aria-hidden="true"></span>{$t(v.cleEtat as any)}</span>
        </div>
        <div class="meta">{meta(source)}</div>
        {#if v.message}
          <div class="msg {v.message.ton}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              {#if v.message.ton === 'off'}<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
              {:else}<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>{/if}
            </svg>
            <span>{$t(v.message.cle as any)}</span>
            {#if v.message.axe && v.message.bouton}
              {@const axe = v.message.axe}
              <button class="v2-btn primaire" onclick={() => onrelever?.(axe)}>{$t(v.message.bouton as any)}</button>
            {/if}
          </div>
        {/if}
        {#if source.status === 'confirmation'}
          <div class="msg warn">
            <span>{$t('upnp.sync.remove' as any).replace('{n}', String(source.pending_count))}</span>
            <button class="v2-btn primaire" disabled={busy} onclick={() => act(source, 'confirm')}>{$t('settings.confirm' as any)}</button>
          </div>
        {/if}
        <details class="det">
          <summary>
            <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
            {$t('v2.ms.details' as any)}
          </summary>
          <dl>
            {#if d.profondeur != null}
              <div><dt>{$t('v2.ms.detail.depth' as any)}</dt>
                <dd class="chiffre">{$tn('v2.ms.detail.levelsN', d.profondeur)}{d.profondeurAtteinte ? ` (${$t('v2.ms.detail.limitReached' as any)})` : ''}</dd></div>
            {/if}
            <div><dt>{$t('v2.ms.detail.tracksIndexed' as any)}</dt><dd class="chiffre">{d.pistes ?? '—'}</dd></div>
            <div><dt>{$t('v2.ms.detail.albumsIndexed' as any)}</dt><dd class="chiffre">{d.albums ?? '—'}</dd></div>
            <div><dt>{$t('v2.ms.detail.removed' as any)}</dt>
              <dd class:chiffre={typeof d.retirees === 'number'}>{d.retirees === 'incomplete' ? $t('v2.ms.detail.removedNone' as any) : (d.retirees ?? '—')}</dd></div>
          </dl>
          {#if v.brut.length}
            <div class="brut">
              <span class="brut-tt">{$t('v2.ms.detail.serverText' as any)}</span>
              {#each v.brut as ligne}<p>{ligne}</p>{/each}
            </div>
          {/if}
          <div class="diag">
            <button class="v2-btn" onclick={() => copier(source)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              {$t('v2.ms.copyDiagnostic' as any)}
            </button>
            {#if copie?.key === source.key}
              <span class="copie" role="status">{$t((copie.ok ? 'v2.ms.copied' : 'v2.ms.copyFailed') as any)}</span>
            {/if}
          </div>
        </details>
      </div>
      <div class="acts">
        {#if v.action}
          <button class="v2-btn" disabled={busy || source.status === 'running'} onclick={() => act(source, 'sync')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
            {$t((v.action === 'retry' ? 'v2.ms.retry' : 'upnp.sync.refresh') as any)}
          </button>
        {/if}
        {#if source.enabled && v.etat !== 'thisServer'}
          <span class="plus">
            <button class="v2-btn icone" aria-haspopup="menu" aria-expanded={menu === source.key}
              aria-label={$t('v2.cover.more' as any)} onclick={() => (menu = menu === source.key ? null : source.key)}>
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
            </button>
            {#if menu === source.key}
              <div class="menu" role="menu">
                <button role="menuitem" disabled={busy || source.status === 'running'} onclick={() => act(source, 'pause')}>{$t('upnp.sync.pause' as any)}</button>
              </div>
            {/if}
          </span>
        {/if}
      </div>
    </article>
  {/each}
</section>

<style>
  .sources{margin:0 30px 16px; padding:16px 20px 4px; border:1px solid var(--v2-line); border-radius:var(--rayon-3);
    background:var(--v2-surface)}
  .hd{display:flex; align-items:flex-start; gap:16px; flex-wrap:wrap}
  .hd-txt{flex:1 1 280px; min-width:0}
  .hd h2{margin:0; font-size:var(--taille-6); font-weight:var(--graisse-forte); color:var(--v2-txt)}
  .aide{margin:4px 0 0; max-width:72ch; font-size:var(--taille-4); color:var(--v2-txt3); line-height:1.5}
  .ajout{margin-left:auto}
  .erreur{margin:10px 0 0; font-size:var(--taille-4); color:var(--v2-danger)}

  .src{display:grid; grid-template-columns:40px minmax(0, 1fr) auto; gap:14px; padding:12px 0;
    border-top:1px solid var(--v2-line)}
  .src:first-of-type{margin-top:14px}
  .ic{width:40px; height:40px; border-radius:var(--rayon-2); display:grid; place-items:center;
    background:var(--v2-surface2); color:var(--v2-txt3)}
  .ic svg{width:18px; height:18px}
  .ic.warn{background:color-mix(in srgb, var(--pal-alerte) 16%, transparent); color:var(--pal-alerte)}
  .ic.err{background:var(--v2-danger-soft); color:var(--v2-danger)}
  .ic.ok{background:color-mix(in srgb, var(--pal-succes) 16%, transparent); color:var(--pal-succes)}
  .ic.busy{color:var(--v2-acc1)}
  .corps{min-width:0}
  .nom{display:flex; align-items:center; gap:10px; flex-wrap:wrap}
  .nom strong{font-size:var(--taille-5); font-weight:var(--graisse-forte); color:var(--v2-txt);
    overflow:hidden; text-overflow:ellipsis}
  .etat{display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:var(--rayon-plein);
    font-size:var(--taille-3); font-weight:var(--graisse-forte); background:var(--v2-surface2); color:var(--v2-txt2)}
  .etat .pt{width:8px; height:8px; border-radius:50%; background:currentColor; flex:none}
  .etat.off .pt{background:var(--v2-txt3)}
  /* Le texte des pastilles se mêle au texte du thème : lisible en sombre ET en clair. */
  .etat.warn{background:color-mix(in srgb, var(--pal-alerte) 16%, transparent); color:color-mix(in srgb, var(--pal-alerte) 72%, var(--v2-txt))}
  .etat.ok{background:color-mix(in srgb, var(--pal-succes) 16%, transparent); color:color-mix(in srgb, var(--pal-succes) 72%, var(--v2-txt))}
  .etat.err{background:var(--v2-danger-soft); color:var(--v2-danger)}
  .etat.busy{background:var(--v2-acc-soft); color:var(--v2-acc-tint)}
  .meta{margin-top:4px; font-size:var(--taille-4); color:var(--v2-txt3); overflow-wrap:anywhere}

  .msg{margin-top:8px; display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:10px 12px;
    border-radius:var(--rayon-2); font-size:var(--taille-4); max-width:760px; color:var(--v2-txt2);
    background:var(--v2-surface2)}
  .msg > svg{width:16px; height:16px; flex:none}
  .msg > span{flex:1 1 240px; min-width:0}
  .msg.warn{background:color-mix(in srgb, var(--pal-alerte) 12%, transparent); color:var(--v2-txt)}
  .msg.warn > svg{color:var(--pal-alerte)}
  .msg.err{background:var(--v2-danger-soft); color:var(--v2-txt)}
  .msg.err > svg{color:var(--v2-danger)}
  .msg .v2-btn{margin-left:auto}

  .det{margin-top:6px}
  .det summary{display:inline-flex; align-items:center; gap:6px; cursor:pointer; list-style:none; padding:4px 0;
    font-size:var(--taille-4); font-weight:var(--graisse-forte); color:var(--v2-txt3)}
  .det summary::-webkit-details-marker{display:none}
  .det summary:hover{color:var(--v2-txt2)}
  .chev{width:14px; height:14px}
  .det[open] .chev{transform:rotate(90deg)}
  .det dl{display:flex; flex-wrap:wrap; gap:4px 36px; margin:8px 0 0; padding:10px 12px;
    border-left:2px solid var(--v2-line2); font-size:var(--taille-3)}
  .det dt{color:var(--v2-txt3)}
  .det dd{margin:2px 0 0; color:var(--v2-txt2)}
  .chiffre{font-family:var(--police-chiffres)}
  .brut{margin:8px 0 0; padding:8px 12px; border-left:2px solid var(--v2-line2); font-size:var(--taille-3);
    color:var(--v2-txt3); max-width:760px}
  .brut-tt{display:block; color:var(--v2-txt3); font-weight:var(--graisse-forte)}
  .brut p{margin:4px 0 0; overflow-wrap:anywhere; color:var(--v2-txt2)}
  .diag{display:flex; align-items:center; gap:10px; margin:8px 0 6px}
  .copie{font-size:var(--taille-3); color:var(--v2-txt2)}

  .acts{display:flex; gap:8px; align-items:flex-start}
  .plus{position:relative}
  .v2-btn.icone{width:36px; padding:0; justify-content:center; border-color:transparent; background:transparent}
  .menu{position:absolute; right:0; top:calc(100% + 4px); z-index:5; min-width:180px; padding:6px;
    border-radius:var(--rayon-3); background:var(--v2-surface); border:1px solid var(--v2-line);
    box-shadow:var(--v2-sh-menu)}
  .menu button{display:block; width:100%; text-align:left; padding:8px 10px; border:0; border-radius:var(--rayon-2);
    background:transparent; color:var(--v2-txt); font-size:var(--taille-4); cursor:pointer}
  .menu button:hover:not(:disabled){background:var(--v2-hover)}
  .menu button:disabled{opacity:.5; cursor:default}

  @media (max-width: 640px){
    .sources{margin:0 16px 16px; padding:14px 14px 4px}
    .src{grid-template-columns:32px minmax(0, 1fr)}
    .ic{width:32px; height:32px}
    .acts{grid-column:2}
    .msg{display:grid; grid-template-columns:16px minmax(0, 1fr); align-items:start}
    .msg .v2-btn{grid-column:2; justify-self:start; margin-left:0}
  }
</style>
