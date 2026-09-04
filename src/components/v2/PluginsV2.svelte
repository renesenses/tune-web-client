<script lang="ts">
  import { t } from '../../lib/i18n';
  /**
   * Extensions — nouveau client (direction Levente). Niveau Expert.
   *
   * `getMergedPlugins()` fond le catalogue et l'installé en UNE liste : on
   * l'utilise telle quelle plutôt que de recouper deux sources côté client,
   * où le moindre écart ferait apparaître une extension deux fois.
   *
   * `compatible` est respecté : une extension incompatible avec cette version
   * de Tune est montrée mais NON installable, avec la raison. La masquer
   * laisserait croire qu'elle n'existe pas.
   *
   * `restart_required` est remonté : une extension installée qui n'agit
   * qu'après redémarrage doit le dire, sinon elle passe pour cassée.
   */
  import * as api from '../../lib/api';
  import type { MergedPlugin } from '../../lib/api';
  import { fold } from '../../lib/utils';
  import '../../styles/tune-v2.css';

  let plugins = $state<MergedPlugin[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state<string | null>(null);
  let restartNeeded = $state(false);
  let q = $state('');
  let tab = $state<'installed' | 'all'>('installed');

  async function reload() {
    try { plugins = (await api.getMergedPlugins()) ?? []; error = null; }
    catch { error = 'Extensions indisponibles sur ce serveur.'; }
    loading = false;
  }
  $effect(() => { reload(); });

  const filtered = $derived(
    plugins
      .filter((p) => (tab === 'installed' ? p.installed : true))
      .filter((p) => !q || fold(p.display_name || p.name).includes(fold(q)) || fold(p.description).includes(fold(q)))
  );
  const installedCount = $derived(plugins.filter((p) => p.installed).length);

  function key(p: MergedPlugin) { return p.slug ?? p.name; }
  /** Le serveur envoie `enabled` pour les extensions intégrées et `status`
   *  pour les autres : on accepte les deux plutôt que d'en privilégier une. */
  function isActive(p: MergedPlugin): boolean {
    return p.enabled ?? p.status === 'active';
  }

  async function act(p: MergedPlugin, fn: () => Promise<any>) {
    if (busy) return;
    busy = key(p);
    try {
      const res: any = await fn();
      if (res?.restart_required) restartNeeded = true;
      await reload();
    } catch (e: any) {
      error = e?.message ?? 'Action impossible.';
    }
    busy = null;
  }
  const toggle = (p: MergedPlugin) =>
    act(p, () => (isActive(p) ? api.disablePlugin(p.name) : api.enablePlugin(p.name)));
  const install = (p: MergedPlugin) =>
    act(p, () => (p.marketplace && p.slug ? api.installMarketplacePlugin(p.slug) : api.installPlugin(p.slug ?? p.name)));
  const uninstall = (p: MergedPlugin) =>
    act(p, () => api.uninstallMarketplacePlugin(p.slug ?? p.name));
</script>

<section class="v2-plug tune-v2">
  <header class="top">
    <div>
      <div class="eyebrow">Studio</div>
      <h1>Extensions</h1>
    </div>
    <nav class="tabs">
      <button class:on={tab === 'installed'} onclick={() => (tab = 'installed')}>{$t('v2.plug.installedTab' as any)}<span>{installedCount}</span></button>
      <button class:on={tab === 'all'} onclick={() => (tab = 'all')}>Catalogue<span>{plugins.length}</span></button>
    </nav>
    <div class="search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <input placeholder="Filtrer" bind:value={q} />
    </div>
  </header>

  {#if error}<div class="err">{error}<button onclick={() => (error = null)} aria-label="Fermer">×</button></div>{/if}
  {#if restartNeeded}
    <div class="restart">{$t('v2.plug.restartNeeded' as any)}</div>
  {/if}

  <div class="scroll">
    {#if loading}
      <div class="state">Chargement…</div>
    {:else if !filtered.length}
      <div class="state">{tab === 'installed' ? 'Aucune extension installée.' : 'Aucune extension.'}</div>
    {:else}
      <div class="list">
        {#each filtered as p (key(p))}
          <article class="pl" class:err={p.status === 'error'}>
            <div class="pi">
              <div class="ph">
                <h2>{p.display_name || p.name}</h2>
                <span class="ver">v{p.installed_version ?? p.version}</span>
                {#if p.category}<span class="cat">{p.category}</span>{/if}
                {#if p.update_available}<span class="upd">{$t('v2.plug.updateAvailable' as any)}</span>{/if}
                {#if !p.compatible}<span class="ko">incompatible</span>{/if}
              </div>
              <p class="pd">{p.description}</p>
              {#if p.author}<div class="pa">{p.author}</div>{/if}
              {#if !p.compatible && (p.min_tune_version || p.max_tune_version)}
                <div class="why">
                  Requiert Tune {p.min_tune_version ? `≥ ${p.min_tune_version}` : ''}{p.min_tune_version && p.max_tune_version ? ' et ' : ''}{p.max_tune_version ? `≤ ${p.max_tune_version}` : ''}.
                </div>
              {/if}
              {#if p.status === 'error' && p.error_message}
                <div class="why bad">{p.error_message}</div>
              {/if}
            </div>

            <div class="pact">
              {#if p.installed}
                <label class="sw" title={isActive(p) ? $t('settings.disable' as any) : $t('plugins.enable' as any)}>
                  <input type="checkbox" checked={isActive(p)} disabled={busy === key(p)} onchange={() => toggle(p)} />
                  <span class="slider"></span>
                </label>
                <button class="lnk danger" disabled={busy === key(p)} onclick={() => uninstall(p)}>{$t('plugins.uninstall' as any)}</button>
              {:else}
                <button class="go" disabled={!p.compatible || busy === key(p)} onclick={() => install(p)}
                  title={p.compatible ? '' : $t('v2.plug.incompatible' as any)}>
                  {busy === key(p) ? '…' : 'Installer'}
                </button>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </div>
</section>

<style>
  .v2-plug{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .top{display:flex; align-items:flex-end; gap:20px; padding:24px 30px 14px; padding-right:96px}
  .eyebrow{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em; margin-top:4px}
  .tabs{display:flex; gap:4px}
  .tabs button{display:inline-flex; align-items:center; gap:8px; border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt2); cursor:pointer; font:600 12px var(--v2-sans); padding:8px 14px; border-radius:var(--v2-r-pill)}
  .tabs button span{font:9.5px var(--v2-mono); color:var(--v2-txt3)}
  .tabs button.on{color:var(--v2-on-acc); border-color:transparent; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .tabs button.on span{color:var(--v2-on-acc); opacity:.75}
  .search{position:relative; margin-left:auto; display:flex; align-items:center; width:230px}
  .search svg{position:absolute; left:13px; width:15px; height:15px; color:var(--v2-txt3); pointer-events:none}
  .search input{width:100%; height:38px; border-radius:var(--v2-r-pill); border:1px solid var(--v2-line2);
    background:var(--v2-surface2); color:var(--v2-txt); font:12.5px var(--v2-sans); padding:0 12px 0 36px; outline:none}

  .err,.restart{display:flex; align-items:center; gap:12px; margin:0 30px 10px; padding:9px 14px; border-radius:10px; font-size:12.5px}
  .err{border:1px solid var(--v2-danger-bd); color:var(--v2-danger)}
  .err button{margin-left:auto; border:0; background:transparent; color:inherit; font-size:16px; cursor:pointer}
  .restart{border:1px solid var(--v2-acc2); background:var(--v2-acc-soft); color:var(--v2-acc-tint)}

  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:30px 0; color:var(--v2-txt3)}
  .list{display:flex; flex-direction:column; gap:10px}

  .pl{display:flex; align-items:flex-start; gap:20px; padding:16px 18px; border-radius:13px;
    border:1px solid var(--v2-line); background:var(--v2-surface2)}
  .pl.err{border-color:var(--v2-danger-bd)}
  .pi{flex:1; min-width:0}
  .ph{display:flex; align-items:baseline; gap:10px; flex-wrap:wrap}
  .ph h2{font-size:15px; font-weight:700}
  .ver{font:10px var(--v2-mono); color:var(--v2-txt3)}
  .cat,.upd,.ko{font:9.5px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; padding:2px 8px; border-radius:999px}
  .cat{color:var(--v2-txt3); border:1px solid var(--v2-line2)}
  .upd{color:var(--v2-acc-tint); border:1px solid var(--v2-acc2)}
  .ko{color:var(--v2-danger); border:1px solid var(--v2-danger-bd)}
  .pd{margin-top:7px; font-size:12.5px; line-height:1.55; color:var(--v2-txt2); max-width:74ch}
  .pa{margin-top:5px; font:10.5px var(--v2-mono); color:var(--v2-txt3)}
  .why{margin-top:8px; font-size:11.5px; color:var(--v2-txt3)}
  .why.bad{color:var(--v2-danger)}

  .pact{display:flex; align-items:center; gap:12px; flex:0 0 auto}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:var(--v2-r-pill); padding:7px 14px; font:600 12px var(--v2-sans)}
  .lnk.danger:hover:not(:disabled){border-color:var(--v2-danger-bd); color:var(--v2-danger)}
  .lnk:disabled{opacity:.45; cursor:default}
  .go{height:34px; padding:0 18px; border-radius:var(--v2-r-pill); border:0; cursor:pointer; font:700 12.5px var(--v2-sans);
    color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .go:disabled{opacity:.35; cursor:not-allowed}
  .sw{position:relative; width:44px; height:25px; cursor:pointer; flex:0 0 auto}
  .sw input{position:absolute; opacity:0; width:0; height:0}
  .slider{position:absolute; inset:0; border-radius:999px; background:var(--v2-line2); transition:.18s}
  .slider::before{content:""; position:absolute; left:3px; top:3px; width:19px; height:19px; border-radius:50%;
    background:var(--v2-knob); transition:.18s}
  .sw input:checked + .slider{background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .sw input:checked + .slider::before{transform:translateX(19px)}
</style>
