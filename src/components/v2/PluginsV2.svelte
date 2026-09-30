<script lang="ts">
  import { publierGreffons } from '../../lib/stores/greffonsStudio';
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
  import { fold, errText } from '../../lib/utils';
  import { ajouterLaBoutique } from '../../lib/catalogueGreffons';
  import { activeView } from '../../lib/stores/navigation';
  import { refreshConcertsPlugin } from '../../lib/stores/concerts';
  import { refreshCirclePlugin } from '../../lib/circle';
  import { estRefusPremium } from '../../lib/premiumRefus';
  import BandeauReinstallerGreffons from './BandeauReinstallerGreffons.svelte';
  import { sonderCrossfeedPro } from '../../lib/stores/crossfeedPro';
  import {
    greffonsNatifsTiers, etatDeChargement, ecranDuGreffon, NOMS_GREFFONS_NATIFS,
    greffonsAProposer, DESCRIPTIONS_GREFFONS_NATIFS, cleDuRefusDInstallation, CATALOGUE_GREFFONS_NATIFS,
  } from '../../lib/greffonsAudioNatifs';
  import { licenseState, isPremium } from '../../lib/stores/license';
  import { dialogs } from '../../lib/stores/dialogs';
  import { attendreRetourEtRecharger } from '../../lib/retourDuServeur';
  import { notifications } from '../../lib/stores/notifications';
  import '../../styles/tune-v2.css';

  let plugins = $state<MergedPlugin[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state<string | null>(null);
  let restartNeeded = $state(false);
  let q = $state('');
  let tab = $state<'installed' | 'all'>('installed');
  /**
   * Les greffons audio natifs TIERS (`GET /audio-plugins`, `third_party`) :
   * absents de `GET /plugins`, ils étaient invisibles ici. Liste à part, qui ne
   * touche pas à celle du dessus. Route réservée à l'administrateur : un refus
   * (403) ou une panne laisse simplement la section vide.
   */
  let natifs = $state<api.GreffonAudioNatif[]>([]);
  async function relireNatifs() {
    try { natifs = greffonsNatifsTiers((await api.getGreffonsAudioNatifs()).plugins); natifsLus = true; }
    catch { natifs = []; }
    // L'entrée « Crossfeed Pro » de la barre suit, comme Concerts et Circle.
    void sonderCrossfeedPro(null);
  }
  /**
   * Les greffons natifs du catalogue de mozaiklabs pas encore installés
   * (Crossfeed Pro). Premium : un bouton « Installer » ; sinon, la mention
   * Premium, sans bouton. `natifsLus` : tant que l'état des greffons n'est pas
   * lu, on ne propose rien (un greffon installé passerait pour absent).
   */
  let natifsLus = $state(false);
  let installation = $state<string | null>(null);
  let refusInstallation = $state<Record<string, string>>({});
  let installes = $state<Record<string, string>>({});
  const aProposer = $derived(
    natifsLus
      ? greffonsAProposer(natifs).filter((id) => {
          const nom = NOMS_GREFFONS_NATIFS[id] ? $t(NOMS_GREFFONS_NATIFS[id] as any) : id;
          return !q || fold(nom).includes(fold(q)) || fold(id).includes(fold(q));
        })
      : [],
  );
  const premium = $derived($licenseState.loaded && $isPremium);

  /**
   * L'état du catalogue pour CE serveur (`GET /audio-plugins/{id}/catalog`),
   * lu pour un compte Premium : la plateforme a-t-elle un paquet, une version
   * plus récente est-elle publiée ? Décisions de Bertrand du 29/09
   * (tune-server-rust#5419) : la mise à jour est SIGNALÉE, jamais faite
   * d'elle-même ; une plateforme sans paquet grise la carte, sans bouton.
   * Un refus ou une panne laisse simplement la carte telle qu'avant.
   */
  let catalogue = $state<Record<string, api.EtatCatalogueGreffonNatif>>({});
  async function relireCatalogue() {
    const lus: Record<string, api.EtatCatalogueGreffonNatif> = {};
    for (const id of CATALOGUE_GREFFONS_NATIFS) {
      try { lus[id] = await api.getCatalogueGreffonNatif(id); } catch { /* la carte reste telle quelle */ }
    }
    catalogue = lus;
  }
  $effect(() => { if (premium && natifsLus) void relireCatalogue(); });
  const sansPaquet = (id: string) => catalogue[id]?.available === false;

  /** Redémarrer pour activer le greffon : la route de toujours
   *  (`POST /system/restart`), après confirmation, puis recharger quand le
   *  serveur répond — le même geste que Réglages. */
  let redemarrage = $state(false);
  async function redemarrerPourActiver() {
    if (!(await dialogs.confirm($t('settings.restartConfirm' as any), { danger: true }))) return;
    redemarrage = true;
    try {
      await api.restartServer();
    } catch (e) {
      // « Failed to fetch » = le redémarrage a commencé ; seule une erreur
      // applicative arrête ici (même règle que Réglages).
      const msg = errText(e);
      if (msg !== null) { redemarrage = false; notifications.error(msg); return; }
    }
    attendreRetourEtRecharger({
      sonder: () => api.getHealth(),
      recharger: () => window.location.reload(),
      renoncer: () => { redemarrage = false; notifications.error($t('settings.updateReloadGaveUp' as any)); },
    });
  }

  async function installerDuCatalogue(id: string) {
    if (installation) return;
    installation = id;
    const { [id]: _ancien, ...autres } = refusInstallation;
    refusInstallation = autres;
    try {
      const r = await api.installerGreffonNatifDuCatalogue(id);
      installes = { ...installes, [id]: r.version };
      if (r.restart_required) restartNeeded = true;
      await relireNatifs();
      if (premium) await relireCatalogue();
    } catch (e: any) {
      const cle = estRefusPremium(e) ? cleDuRefusDInstallation('premium_required') : cleDuRefusDInstallation(e?.code);
      refusInstallation = { ...refusInstallation, [id]: cle };
    }
    installation = null;
  }

  const natifsFiltres = $derived(
    natifs.filter((g) => {
      const nom = NOMS_GREFFONS_NATIFS[g.id] ? $t(NOMS_GREFFONS_NATIFS[g.id] as any) : g.id;
      return !q || fold(nom).includes(fold(q)) || fold(g.id).includes(fold(q));
    }),
  );

  async function reload() {
    try {
      // La boutique complète la liste locale (portée de l'ancien écran) ; son
      // échec ne prive pas l'écran des greffons installés.
      const [locaux, boutique] = await Promise.all([
        api.getMergedPlugins(),
        api.getMarketplaceCatalog().catch(() => ({ plugins: [] as any[] })),
      ]);
      plugins = ajouterLaBoutique(locaux ?? [], (boutique as any)?.plugins ?? []);
      publierGreffons(plugins); error = null;
      // L'entrée « Concerts » de la barre latérale suit l'installation sans
      // attendre un rechargement de la page (tune-server-rust#2363).
      void refreshConcertsPlugin();
      // Idem pour « Tune Circle » : activer ou désactiver le greffon ici fait
      // apparaître ou disparaître son entrée sur-le-champ.
      void refreshCirclePlugin();
    }
    catch { error = $t('v2.plug.unavailable' as any); }
    loading = false;
  }
  $effect(() => { reload(); });
  $effect(() => { void relireNatifs(); });

  const filtered = $derived(
    plugins
      .filter((p) => (tab === 'installed' ? p.installed : true))
      .filter((p) => !q || fold(p.display_name || p.name).includes(fold(q)) || fold(p.description).includes(fold(q)))
  );
  const installedCount = $derived(plugins.filter((p) => p.installed).length);

  function key(p: MergedPlugin) { return p.slug ?? p.name; }

  /**
   * Phase 5 (web#1257) — la documentation des greffons n'avait de chemin que
   * par l'onglet « Docs » de l'ancien `PluginsView` (`fetch` direct). Le
   * serveur ne rend plus qu'un LIEN (`{ url }`) : on l'affiche tel quel, et
   * rien s'il est absent — pas de promesse d'une page qui n'existe pas.
   */
  let docsUrl = $state<string | null>(null);
  $effect(() => {
    api.getPluginDocsUrl()
      .then((u) => { docsUrl = u; })
      .catch(() => { docsUrl = null; });
  });
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
      // Un refus d'offre porte la sentinelle `premium_required` comme message :
      // on dit la phrase traduite, jamais le code.
      error = estRefusPremium(e) ? $t('premium.required' as any) : (e?.message ?? $t('settings.errActionFailed' as any));
    }
    busy = null;
  }
  const toggle = (p: MergedPlugin) =>
    act(p, () => (isActive(p) ? api.disablePlugin(p.name) : api.enablePlugin(p.name)));
  const install = (p: MergedPlugin) =>
    act(p, () => (p.marketplace && p.slug ? api.installMarketplacePlugin(p.slug) : api.installPlugin(p.slug ?? p.name)));
  // 🔴 Deux routes, selon l'origine — comme dans l'ancien écran. Tout passait
  // par la boutique : un greffon installé autrement ne se désinstallait pas.
  const uninstall = (p: MergedPlugin) =>
    act(p, () => (p.marketplace ? api.uninstallMarketplacePlugin(p.slug ?? p.name) : api.uninstallPlugin(p.name)));
  // La pastille « mise à jour disponible » existait sans geste pour la faire.
  const mettreAJour = (p: MergedPlugin) => act(p, () => api.updatePlugin(p.name));
  /**
   * tune-server-rust#5403 — un greffon dont le `setup()` a dépassé la borne
   * reste listé, en erreur, avec son motif (`error_reason`) et un bouton
   * Réessayer. Un serveur plus ancien n'envoie pas `error_reason` : rien ne
   * s'affiche de plus, et aucun bouton n'appelle une route qu'il n'a pas.
   */
  const peutReessayer = (p: MergedPlugin) => p.status === 'error' && !!p.error_reason;
  function motifErreur(p: MergedPlugin): string {
    if (p.error_reason === 'setup_timeout') {
      const s = Math.round((p.setup_duration_ms ?? p.setup_timeout_ms ?? 0) / 1000);
      return $t('v2.plug.errSetupTimeout' as any).replace('{s}', String(s));
    }
    return $t('v2.plug.errSetupFailed' as any);
  }
  const reessayer = (p: MergedPlugin) => act(p, () => api.retryPlugin(p.name));
</script>

<section class="v2-plug tune-v2">
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">Studio</div>
      <h1>{$t('v2.nav.plugins' as any)}</h1>
    </div>
    <div class="v2-actions">
      <!-- La recherche AVANT les onglets, comme partout ailleurs. Et son invite
           était « Filtrer » en dur : du français dans une interface anglaise,
           exactement ce qu'Alex Campbell a signalé le 08/09/2026. -->
      <div class="v2-rech">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input placeholder={$t('v2.tool.filter' as any)} aria-label={$t('v2.tool.filter' as any)} bind:value={q} />
      </div>
      <nav class="tabs">
        <button class:on={tab === 'installed'} onclick={() => (tab = 'installed')}>{$t('v2.plug.installedTab' as any)}<span>{installedCount}</span></button>
        <button class:on={tab === 'all'} onclick={() => (tab = 'all')}>{$t('v2.lbl.catalogue' as any)}<span>{plugins.length}</span></button>
      </nav>
    </div>
  </header>

  {#if error}<div class="err">{error}<button onclick={() => (error = null)} aria-label="Fermer">×</button></div>{/if}
  {#if restartNeeded}
    <div class="restart">{$t('v2.plug.restartNeeded' as any)}</div>
  {/if}
  <!-- tune-server-rust#4861 : greffons payants absents d'un compte Premium. -->
  <BandeauReinstallerGreffons onReinstalle={(r) => { if (r) restartNeeded = true; reload(); }} />
  {#if docsUrl}
    <p class="docs"><a href={docsUrl} target="_blank" rel="noopener noreferrer">{$t('v2.plug.docs' as any)} ↗</a></p>
  {/if}

  <div class="scroll">
    {#if loading}
      <div class="state">{$t('v2.tool.loading' as any)}</div>
    {:else if !filtered.length}
      <div class="state">{$t((tab === 'installed' ? 'v2.plug.emptyInstalled' : 'v2.plug.empty') as any)}</div>
    {:else}
      <div class="list">
        {#each filtered as p (key(p))}
          <article class="pl" class:err={p.status === 'error'}>
            <div class="pi">
              <div class="ph">
                <h2>{p.name === 'concerts' ? $t('concerts.greffonNom' as any) : (p.display_name || p.name)}</h2>
                <span class="ver">v{p.installed_version ?? p.version}</span>
                {#if p.category}<span class="cat">{p.category}</span>{/if}
                {#if p.update_available}<span class="upd">{$t('v2.plug.updateAvailable' as any)}</span>{/if}
                {#if p.premium}<span class="prem">{$t('v2.plug.premium' as any)}</span>{/if}
                {#if !p.compatible}<span class="ko">{$t('v2.lbl.incompatible' as any)}</span>{/if}
              </div>
              <!-- Le serveur ne rend que le nom technique et une phrase anglaise
                   pour les greffons natifs : Concerts porte les siens, traduits. -->
              <p class="pd">{p.name === 'concerts' ? $t('concerts.greffonDescription' as any) : p.description}</p>
              {#if p.author}<div class="pa">{p.author}</div>{/if}
              {#if !p.compatible && (p.min_tune_version || p.max_tune_version)}
                <div class="why">
                  {$t('v2.plug.requiresTune' as any).replace('{plage}', [p.min_tune_version ? `≥ ${p.min_tune_version}` : '', p.max_tune_version ? `≤ ${p.max_tune_version}` : ''].filter(Boolean).join(` ${$t('v2.common.and' as any)} `))}
                </div>
              {/if}
              {#if peutReessayer(p)}
                <div class="why bad" data-motif={p.error_reason}>{motifErreur(p)}</div>
              {/if}
              {#if p.status === 'error' && p.error_message}
                <div class="why bad">{p.error_message}</div>
              {/if}
            </div>

            <div class="pact">
              {#if p.installed}
                {#if peutReessayer(p)}
                  <button class="lnk reessayer" disabled={busy === key(p)} onclick={() => reessayer(p)}>
                    {busy === key(p) ? '…' : $t('v2.plug.retry' as any)}
                  </button>
                {/if}
                <!-- Pont Roon (#4349) : son écran d'import s'ouvre depuis sa
                     carte. Seulement s'il tourne — éteint, ses routes ne sont
                     pas montées et l'écran n'aurait rien à lire. -->
                {#if p.name === 'pont-roon' && isActive(p)}
                  <button class="lnk" onclick={() => activeView.set('pontroon')}>{$t('common.open' as any)}</button>
                {/if}
                {#if p.name === 'cd' && isActive(p)}
                  <button class="lnk ouvrir-cd" onclick={() => activeView.set('lecturecd')}>{$t('common.open' as any)}</button>
                {/if}
                {#if p.name === 'concerts' && isActive(p)}
                  <button class="lnk ouvrir-concerts" onclick={() => activeView.set('concerts')}>{$t('common.open' as any)}</button>
                {/if}
                {#if p.name === 'circle' && isActive(p)}
                  <button class="lnk ouvrir-circle" onclick={() => activeView.set('circle')}>{$t('common.open' as any)}</button>
                {/if}
                <label class="sw" title={isActive(p) ? $t('settings.disable' as any) : $t('plugins.enable' as any)}>
                  <input type="checkbox" checked={isActive(p)} disabled={busy === key(p)} onchange={() => toggle(p)} />
                  <span class="slider"></span>
                </label>
                {#if p.update_available}
                  <button class="lnk" disabled={busy === key(p)} onclick={() => mettreAJour(p)}>{$t('plugins.update' as any)}</button>
                {/if}
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

    {#if !loading && (natifsFiltres.length || aProposer.length)}
      <!-- Greffons audio natifs tiers : état de chargement et écran de réglage. -->
      <h3 class="sect" data-natifs>{$t('v2.plug.nativeTitle' as any)}</h3>
      <div class="list">
        {#each aProposer as id (id)}
          <!-- Au catalogue de mozaiklabs, pas encore sur ce serveur. -->
          <article class="pl" class:grise={premium && sansPaquet(id)} data-catalogue={id}>
            <div class="pi">
              <div class="ph">
                <h2>{NOMS_GREFFONS_NATIFS[id] ? $t(NOMS_GREFFONS_NATIFS[id] as any) : id}</h2>
                <span class="cat">{$t('v2.plug.nativeBadge' as any)}</span>
                <span class="prem">{$t('v2.plug.premium' as any)}</span>
              </div>
              {#if DESCRIPTIONS_GREFFONS_NATIFS[id]}<p class="pd">{$t(DESCRIPTIONS_GREFFONS_NATIFS[id] as any)}</p>{/if}
              {#if !premium}
                <div class="why" data-premium-seulement>{$t('v2.plug.catalogPremiumOnly' as any)}</div>
              {/if}
              {#if premium && sansPaquet(id)}
                <div class="why" data-sans-paquet>
                  <span>{$t('v2.plug.catalogNoPackage' as any)}</span>
                  <span class="ver">{catalogue[id].target}</span>
                </div>
              {/if}
              {#if refusInstallation[id]}<div class="why bad" data-refus>{$t(refusInstallation[id] as any)}</div>{/if}
            </div>
            <div class="pact">
              {#if premium && !sansPaquet(id)}
                <button class="go installer-natif" disabled={installation !== null} onclick={() => installerDuCatalogue(id)}>
                  {installation === id ? $t('v2.plug.catalogInstalling' as any) : $t('v2.plug.catalogInstall' as any)}
                </button>
              {/if}
            </div>
          </article>
        {/each}
        {#each natifsFiltres as g (g.id)}
          {@const etat = etatDeChargement(g)}
          {@const ecran = ecranDuGreffon(g)}
          <article class="pl" class:err={etat === 'erreur'} data-natif={g.id}>
            <div class="pi">
              <div class="ph">
                <h2>{NOMS_GREFFONS_NATIFS[g.id] ? $t(NOMS_GREFFONS_NATIFS[g.id] as any) : g.id}</h2>
                <span class="cat">{$t('v2.plug.nativeBadge' as any)}</span>
                <span class="etat" class:ok={etat === 'charge'} data-etat={etat}>{$t(`v2.plug.native_${etat}` as any)}</span>
                {#if g.version ?? installes[g.id]}<span class="ver" data-version>v{g.version ?? installes[g.id]}</span>{/if}
              </div>
              <p class="pd">{$t('v2.plug.nativeHint' as any)}</p>
              {#if g.error}<div class="why bad">{g.error}</div>{/if}
              {#if installes[g.id] && etat === 'non_charge'}<div class="why" data-redemarrer>{$t('v2.plug.catalogInstalled' as any)}</div>{/if}
              {#if premium && catalogue[g.id]?.update_available}
                <div class="why" data-maj>{$t('v2.plug.catalogUpdateAvailable' as any).replace('{version}', catalogue[g.id].latest_version ?? '')}</div>
              {/if}
              {#if refusInstallation[g.id]}<div class="why bad" data-refus>{$t(refusInstallation[g.id] as any)}</div>{/if}
            </div>
            <div class="pact">
              {#if premium && catalogue[g.id]?.update_available}
                <button class="go maj-natif" disabled={installation !== null} onclick={() => installerDuCatalogue(g.id)}>
                  {installation === g.id ? $t('v2.plug.catalogInstalling' as any) : $t('v2.plug.catalogUpdate' as any)}
                </button>
              {/if}
              {#if installes[g.id]}
                <button class="lnk redemarrer-serveur" disabled={redemarrage} onclick={redemarrerPourActiver}>{$t('v2.plug.catalogRestart' as any)}</button>
              {/if}
              {#if ecran}
                <button class="lnk ouvrir-natif" onclick={() => activeView.set(ecran)}>{$t('v2.plug.nativeSettings' as any)}</button>
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
  .tabs{display:flex; gap:4px}
  .tabs button{display:inline-flex; align-items:center; gap:8px; border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt2); cursor:pointer; font:600 12px var(--v2-sans); padding:8px 14px; border-radius:var(--v2-r-pill)}
  .tabs button span{font:9.5px var(--v2-mono); color:var(--v2-txt3)}
  .tabs button.on{color:var(--v2-on-acc); border-color:transparent; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .tabs button.on span{color:var(--v2-on-acc); opacity:.75}

  .err,.restart{display:flex; align-items:center; gap:12px; margin:0 30px 10px; padding:9px 14px; border-radius:10px; font-size:12.5px}
  .err{border:1px solid var(--v2-danger-bd); color:var(--v2-danger)}
  .err button{margin-left:auto; border:0; background:transparent; color:inherit; font-size:16px; cursor:pointer}
  .restart{border:1px solid var(--v2-acc2); background:var(--v2-acc-soft); color:var(--v2-acc-tint)}
  .docs{margin:0 30px 10px; font-size:12.5px}
  .docs a{color:var(--v2-acc-tint)}

  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:30px 0; color:var(--v2-txt3)}
  .list{display:flex; flex-direction:column; gap:10px}
  .sect{margin:22px 0 10px; font:10px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3)}
  .etat{font:9.5px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; padding:2px 8px; border-radius:999px;
    color:var(--v2-txt3); border:1px solid var(--v2-line2)}
  .etat.ok{color:var(--v2-acc-tint); border-color:var(--v2-acc2)}
  .pl.err .etat{color:var(--v2-danger); border-color:var(--v2-danger-bd)}

  .pl{display:flex; align-items:flex-start; gap:20px; padding:16px 18px; border-radius:13px;
    border:1px solid var(--v2-line); background:var(--v2-surface2)}
  .pl.err{border-color:var(--v2-danger-bd)}
  .pi{flex:1; min-width:0}
  .ph{display:flex; align-items:baseline; gap:10px; flex-wrap:wrap}
  .ph h2{font-size:15px; font-weight:700}
  .ver{font:10px var(--v2-mono); color:var(--v2-txt3)}
  .cat,.upd,.ko,.prem{font:9.5px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; padding:2px 8px; border-radius:999px}
  .cat{color:var(--v2-txt3); border:1px solid var(--v2-line2)}
  .upd{color:var(--v2-acc-tint); border:1px solid var(--v2-acc2)}
  .ko{color:var(--v2-danger); border:1px solid var(--v2-danger-bd)}
  .prem{color:var(--v2-acc-tint); background:var(--v2-acc-soft)}
  .pd{margin-top:7px; font-size:12.5px; line-height:1.55; color:var(--v2-txt2); max-width:74ch}
  .pa{margin-top:5px; font:10.5px var(--v2-mono); color:var(--v2-txt3)}
  .why{margin-top:8px; font-size:11.5px; color:var(--v2-txt3)}
  .why.bad{color:var(--v2-danger)}
  .pl.grise{opacity:.55}

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
