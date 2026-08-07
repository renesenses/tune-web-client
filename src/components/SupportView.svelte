<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import * as api from '../lib/api';
  import { t } from '../lib/i18n';
  import { zones, currentZone } from '../lib/stores/zones';
  import { licenseState, isPremium } from '../lib/stores/license';
  import { updateAvailable, latestVersion, currentVersion } from '../lib/stores/updates';
  import { activeView, settingsInitialTab } from '../lib/stores/navigation';
  import { refreshSupportUnread } from '../lib/stores/support';

  // Garde anti-écriture après démontage (même motif que DiagnosticsView).
  let destroyed = false;
  onDestroy(() => {
    destroyed = true;
    // Libère les URL d'aperçu (createObjectURL) des pièces jointes en attente.
    for (const p of attachments) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
  });

  // --- Sous-onglets (même pattern que le mode Expert de EqualizerView) ---
  type Tab = 'diagnostic' | 'tickets' | 'new' | 'system';
  let tab = $state<Tab>('diagnostic');

  function switchTab(next: Tab) {
    tab = next;
    error = null;
    if (next !== 'tickets') sentOk = false;
    if (next === 'tickets' && !ticketsLoaded) loadTickets();
    if (next === 'system' && !profileLoaded) loadProfile();
  }

  let error = $state<string | null>(null);

  // apiPost lève Error(status) ; on traduit les cas utiles (cf. #1267 : toujours
  // exposer le statut HTTP non mappé plutôt qu'un générique aveugle).
  function friendlyError(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e);
    const tr = get(t);
    const httpStatus = (e as { status?: number })?.status;
    // Erreurs de pièces jointes (400 type/nombre, 413 trop gros) : le serveur
    // renvoie déjà un message FR explicite — on l'affiche tel quel.
    if ((httpStatus === 400 || httpStatus === 413) && msg && !/^\d{3}$/.test(msg)) return msg;
    if (msg.includes('412')) return tr('support.errorNotConnected');
    if (msg.includes('403')) return tr('support.errorPremiumOnly');
    if (msg.includes('401')) return tr('support.errorSessionExpired');
    const status = msg.match(/\b(\d{3})\b/)?.[1];
    return status ? `${tr('support.errorGeneric')} (${status})` : tr('support.errorGeneric');
  }

  function fmtDate(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString();
  }

  function fmtDateTime(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleString();
  }

  // ============================================================
  // Volet 1 — Diagnostic
  // ============================================================
  type DiagState = 'ok' | 'warn' | 'err' | 'loading';
  interface DiagRow {
    id: string;
    label: string;
    state: DiagState;
    text: string;
    action?: { label: string; run: () => void };
  }

  let diagLoading = $state(true);
  let dbStatus = $state<any | null>(null);
  let dbFailed = $state(false);
  let scanning = $state<boolean | null>(null);
  let adminHealth = $state<api.AdminHealth | null>(null);
  let serverVersion = $state<string | null>(null);

  async function runDiagnostics() {
    diagLoading = true;
    const T = 8_000;
    const [db, scan, admin, health] = await Promise.all([
      api.withTimeout(api.getDatabaseStatus(), T, 'db-status').catch(() => null),
      api.withTimeout(api.getScanStatus(), T, 'scan-status').catch(() => null),
      // Espace disque : dispo seulement via le dashboard admin ; masqué sinon.
      api.withTimeout(api.getAdminHealth(), T, 'admin-health').catch(() => null),
      api.withTimeout(api.getHealth(), T, 'health').catch(() => null),
    ]);
    if (destroyed) return;
    dbStatus = db;
    dbFailed = db === null;
    scanning = scan ? !!(scan as any).scanning : null;
    adminHealth = admin;
    serverVersion = (health as any)?.version ?? null;
    diagLoading = false;
  }

  function goToSettingsSystem() {
    settingsInitialTab.set('system');
    activeView.set('settings');
  }

  function tr1(key: string, vars?: Record<string, string | number>): string {
    let s = get(t)(key);
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  }

  // Lignes calculées : chaque point = pastille + texte + action contextuelle.
  const diagRows: DiagRow[] = $derived.by(() => {
    const tr = $t;
    const rows: DiagRow[] = [];

    // Version — réutilise le mécanisme update-check existant (store updates :
    // endpoint serveur + repli GitHub, pollé au démarrage).
    {
      const cur = $currentVersion ?? serverVersion;
      let state: DiagState = 'loading';
      let text = tr('support.diag.versionUnknown');
      let action: DiagRow['action'] | undefined;
      if ($updateAvailable && $latestVersion) {
        state = 'warn';
        text = tr1('support.diag.versionOutdated', { latest: $latestVersion, current: cur ?? '?' });
        action = { label: tr('support.diag.update'), run: goToSettingsSystem };
      } else if (cur) {
        state = 'ok';
        text = tr1('support.diag.versionOk', { version: cur });
      } else {
        state = 'warn';
      }
      rows.push({ id: 'version', label: tr('support.diag.version'), state, text, action });
    }

    // Base de données
    if (diagLoading) {
      rows.push({ id: 'db', label: tr('support.diag.database'), state: 'loading', text: tr('support.diag.checking') });
    } else if (dbFailed) {
      rows.push({ id: 'db', label: tr('support.diag.database'), state: 'err', text: tr('support.diag.dbError') });
    } else {
      // Le serveur ne renvoie pas de champ `connected` : la réponse vaut preuve
      // de connexion (même leçon que DiagnosticsView, Villerio 26/07).
      const engine = dbStatus?.engine ?? 'sqlite';
      rows.push({ id: 'db', label: tr('support.diag.database'), state: 'ok', text: tr1('support.diag.dbOk', { engine }) });
    }

    // Zones en ligne (x/y) — store global maintenu par App.svelte.
    {
      const list = $zones;
      const total = list.length;
      const online = list.filter((z) => z.online !== false).length;
      let state: DiagState = 'ok';
      let text = tr1('support.diag.zonesOnline', { online, total });
      if (total === 0) {
        state = 'warn';
        text = tr('support.diag.zonesNone');
      } else if (online === 0) {
        state = 'err';
      } else if (online < total) {
        state = 'warn';
      }
      rows.push({
        id: 'zones',
        label: tr('support.diag.zones'),
        state,
        text,
        action: { label: tr('support.diag.viewZones'), run: () => activeView.set('zonemanager') },
      });
    }

    // Scan
    if (scanning !== null) {
      rows.push({
        id: 'scan',
        label: tr('support.diag.scan'),
        state: scanning ? 'warn' : 'ok',
        text: scanning ? tr('support.diag.scanRunning') : tr('support.diag.scanIdle'),
      });
    }

    // Licence
    {
      const lic = $licenseState;
      const premium = $isPremium;
      rows.push({
        id: 'license',
        label: tr('support.diag.license'),
        state: premium ? 'ok' : 'warn',
        text: premium
          ? lic.tier.charAt(0).toUpperCase() + lic.tier.slice(1)
          : tr('support.diag.licenseFree'),
        action: premium ? undefined : { label: tr('support.diag.viewLicense'), run: goToSettingsSystem },
      });
    }

    // Espace disque — uniquement si l'API existante y donne accès.
    if (adminHealth && adminHealth.disk_total_gb > 0) {
      const free = adminHealth.disk_free_gb;
      const total = adminHealth.disk_total_gb;
      const ratio = free / total;
      const state: DiagState = free < 2 ? 'err' : ratio < 0.1 ? 'warn' : 'ok';
      rows.push({
        id: 'disk',
        label: tr('support.diag.disk'),
        state,
        text: tr1('support.diag.diskValue', { free: free.toFixed(1), total: Math.round(total) }),
      });
    }

    return rows;
  });

  // ============================================================
  // Volet 2 — Tickets (contrat mozaiklabs.fr, serveur en déploiement)
  // ============================================================
  let ticketsLoaded = $state(false);
  let ticketsLoading = $state(false);
  /** true = l'API mozaiklabs a répondu en erreur (pas encore déployée…) :
   *  message doux, jamais d'écran cassé. */
  let ticketsUnavailable = $state(false);
  let tickets = $state<api.SupportTicketSummary[]>([]);
  let currentTicket = $state<api.SupportTicketSummary | null>(null);
  let replies = $state<api.SupportTicketReply[]>([]);
  let detailLoading = $state(false);
  let replyBody = $state('');
  let sendingReply = $state(false);

  const licenseKey = $derived($licenseState.licenseKey);

  const STATUS_LABEL: Record<string, string> = {
    open: 'support.status.open',
    answered: 'support.status.answered',
    resolved: 'support.status.resolved',
  };

  async function loadTickets() {
    const key = licenseKey;
    if (!key) {
      ticketsLoaded = true;
      return;
    }
    ticketsLoading = true;
    ticketsUnavailable = false;
    try {
      const data = await api.getSupportTickets(key);
      if (destroyed) return;
      tickets = data?.tickets ?? [];
    } catch {
      if (destroyed) return;
      ticketsUnavailable = true;
    } finally {
      if (!destroyed) {
        ticketsLoading = false;
        ticketsLoaded = true;
      }
    }
  }

  async function openTicket(id: number) {
    const key = licenseKey;
    if (!key) return;
    detailLoading = true;
    ticketsUnavailable = false;
    try {
      const data = await api.getSupportTicket(id, key);
      if (destroyed) return;
      currentTicket = data?.ticket ?? null;
      replies = data?.replies ?? [];
      // Marquer lu (silencieux) et rafraîchir la pastille sidebar.
      if (currentTicket && currentTicket.unread_count > 0) {
        api.markSupportTicketRead(id, key).then(() => refreshSupportUnread()).catch(() => {});
        tickets = tickets.map((tk) => (tk.id === id ? { ...tk, unread_count: 0 } : tk));
      }
    } catch {
      if (destroyed) return;
      ticketsUnavailable = true;
    } finally {
      if (!destroyed) detailLoading = false;
    }
  }

  async function sendReply() {
    const key = licenseKey;
    if (!key || !currentTicket || !replyBody.trim()) return;
    sendingReply = true;
    error = null;
    try {
      await api.postSupportTicketReply(currentTicket.id, key, replyBody.trim());
      if (destroyed) return;
      replyBody = '';
      await openTicket(currentTicket.id);
    } catch (e) {
      if (!destroyed) error = friendlyError(e);
    } finally {
      if (!destroyed) sendingReply = false;
    }
  }

  function closeTicket() {
    currentTicket = null;
    replies = [];
    replyBody = '';
    error = null;
  }

  // ============================================================
  // Volet 3 — Nouveau ticket enrichi
  // ============================================================
  let subject = $state('');
  let body = $state('');
  let category = $state('other');
  let zoneName = $state('');
  let attachLogs = $state(true); // cochée par défaut
  let submitting = $state(false);
  let sentOk = $state(false);
  let zonePrefilled = false;

  // --- Pièces jointes (parité avec la validation Laravel/serveur Tune) ---
  const ATTACH_ALLOWED_EXT = ['png', 'jpg', 'jpeg', 'log', 'txt', 'zip', 'json', 'csv', 'xml', 'md'];
  const ATTACH_ACCEPT = '.png,.jpg,.jpeg,.log,.txt,.zip,.json,.csv,.xml,.md';
  const ATTACH_MAX_FILES = 5;
  const ATTACH_MAX_BYTES = 50 * 1024 * 1024; // 50 Mo

  interface PickedFile { file: File; previewUrl?: string }
  let attachments = $state<PickedFile[]>([]);
  let attachError = $state<string | null>(null);
  let dragOver = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();

  function extOf(name: string): string {
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
  }
  function isImageFile(f: File): boolean {
    return f.type.startsWith('image/') || ['png', 'jpg', 'jpeg'].includes(extOf(f.name));
  }
  function fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  function addFiles(list: FileList | File[]) {
    attachError = null;
    for (const f of Array.from(list)) {
      if (attachments.length >= ATTACH_MAX_FILES) {
        attachError = tr1('support.attach.tooMany', { max: ATTACH_MAX_FILES });
        break;
      }
      if (!ATTACH_ALLOWED_EXT.includes(extOf(f.name))) {
        attachError = tr1('support.attach.badType', { name: f.name });
        continue;
      }
      if (f.size > ATTACH_MAX_BYTES) {
        attachError = tr1('support.attach.tooBig', { name: f.name });
        continue;
      }
      // Anti-doublon (même nom + même taille).
      if (attachments.some((p) => p.file.name === f.name && p.file.size === f.size)) continue;
      const previewUrl = isImageFile(f) ? URL.createObjectURL(f) : undefined;
      attachments = [...attachments, { file: f, previewUrl }];
    }
  }

  function onFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files) addFiles(input.files);
    input.value = ''; // autorise re-sélectionner le même fichier
  }

  function removeAttachment(idx: number) {
    const p = attachments[idx];
    if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl);
    attachments = attachments.filter((_, i) => i !== idx);
    attachError = null;
  }

  function clearAttachments() {
    for (const p of attachments) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    attachments = [];
    attachError = null;
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  }
  function onDragOver(e: DragEvent) { e.preventDefault(); dragOver = true; }
  function onDragLeave() { dragOver = false; }

  const CATEGORIES = [
    { value: 'playback', label: 'support.category.playback' },
    { value: 'library', label: 'support.category.library' },
    { value: 'streaming', label: 'support.category.streaming' },
    { value: 'hardware', label: 'support.category.hardware' },
    { value: 'other', label: 'support.category.other' },
  ];

  // Préremplit la zone concernée avec la zone active (une seule fois).
  $effect(() => {
    const cz = $currentZone;
    if (!zonePrefilled && cz?.name) {
      zoneName = cz.name;
      zonePrefilled = true;
    }
  });

  async function submitTicket() {
    if (!subject.trim() || !body.trim()) return;
    submitting = true;
    error = null;
    sentOk = false;
    try {
      // Logs + fiche système, optionnels et rétro-compatibles (#1073) : un
      // serveur plus ancien ignore simplement ces champs.
      let logs: string | undefined;
      let system: Record<string, unknown> | undefined;
      if (attachLogs) {
        try { logs = await api.getBugReportMarkdown(); } catch { /* sans les logs */ }
        try { system = await api.getSystemProfile(); } catch { /* sans la fiche */ }
      }

      if (attachments.length > 0) {
        // Avec pièces jointes → multipart. Le navigateur pose le boundary.
        const form = new FormData();
        form.append('subject', subject.trim());
        form.append('body', body.trim());
        form.append('category', category);
        if (zoneName) form.append('zone', zoneName);
        if (logs) form.append('logs', logs);
        if (system) form.append('system', JSON.stringify(system));
        for (const p of attachments) form.append('attachments[]', p.file, p.file.name);
        await api.createSupportTicketMultipart(form);
      } else {
        // Sans pièce jointe → chemin JSON historique inchangé.
        const payload: Record<string, unknown> = {
          subject: subject.trim(),
          body: body.trim(),
          category,
        };
        if (zoneName) payload.zone = zoneName;
        if (logs) payload.logs = logs;
        if (system) payload.system = system;
        await api.apiPost('/support/tickets', payload);
      }
      if (destroyed) return;
      subject = '';
      body = '';
      category = 'other';
      clearAttachments();
      sentOk = true;
      tab = 'tickets';
      await loadTickets();
    } catch (e) {
      if (!destroyed) error = friendlyError(e);
    } finally {
      if (!destroyed) submitting = false;
    }
  }

  // ============================================================
  // Volet 4 — Mon système
  // ============================================================
  interface SysRow { label: string; value: string }
  interface SysSection { key: string; title: string; rows: SysRow[] }

  let profileLoaded = $state(false);
  let profileLoading = $state(false);
  /** true = fiche composée localement (GET /system/profile absent du serveur). */
  let profileFallback = $state(false);
  let sysSections = $state<SysSection[]>([]);
  let sysCopied = $state(false);

  const SECTION_TITLES: Record<string, string> = {
    server: 'support.sys.server',
    library: 'support.sys.library',
    zones: 'support.sys.zones',
    license: 'support.sys.license',
    settings: 'support.sys.settings',
  };

  function prettify(key: string): string {
    return key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  }

  function fmtValue(v: unknown): string {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? '✓' : '✗';
    if (Array.isArray(v)) return v.map((x) => fmtValue(x)).join(', ');
    if (typeof v === 'object') {
      return Object.entries(v as Record<string, unknown>)
        .map(([k, val]) => `${prettify(k)}: ${fmtValue(val)}`)
        .join(' · ');
    }
    return String(v);
  }

  function sectionTitle(key: string): string {
    const mapped = SECTION_TITLES[key];
    return mapped ? get(t)(mapped) : prettify(key);
  }

  /** Rend n'importe quelle forme de fiche (objet de sections) en lignes lisibles. */
  function profileToSections(profile: Record<string, unknown>): SysSection[] {
    const sections: SysSection[] = [];
    for (const [key, value] of Object.entries(profile)) {
      const rows: SysRow[] = [];
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object') {
            const o = item as Record<string, unknown>;
            const label = typeof o.name === 'string' ? o.name : `#${rows.length + 1}`;
            const rest = Object.entries(o).filter(([k]) => k !== 'name');
            rows.push({ label, value: rest.map(([k, v]) => `${prettify(k)}: ${fmtValue(v)}`).join(' · ') });
          } else {
            rows.push({ label: `#${rows.length + 1}`, value: fmtValue(item) });
          }
        }
      } else if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          rows.push({ label: prettify(k), value: fmtValue(v) });
        }
      } else {
        rows.push({ label: prettify(key), value: fmtValue(value) });
      }
      if (rows.length > 0) sections.push({ key, title: sectionTitle(key), rows });
    }
    return sections;
  }

  /** Repli local : compose la fiche depuis les API existantes (health + stats +
   *  zones + licence) tant que le serveur n'expose pas /system/profile. */
  async function buildLocalProfile(): Promise<Record<string, unknown>> {
    const T = 8_000;
    const [health, stats, db] = await Promise.all([
      api.withTimeout(api.getHealth(), T, 'health').catch(() => null),
      api.withTimeout(api.getStats(), T, 'stats').catch(() => null),
      api.withTimeout(api.getDatabaseStatus(), T, 'db').catch(() => null),
    ]);
    const lic = get(licenseState);
    const profile: Record<string, unknown> = {};
    profile.server = {
      version: (health as any)?.version ?? $currentVersion ?? null,
      client_version: __APP_VERSION__,
      database: (db as any)?.engine ?? null,
      status: (health as any)?.status ?? null,
    };
    if (stats) {
      profile.library = {
        tracks: (stats as any).tracks,
        albums: (stats as any).albums,
        artists: (stats as any).artists,
      };
    }
    const zoneList = get(zones);
    if (zoneList.length > 0) {
      profile.zones = zoneList.map((z) => ({
        name: z.name,
        output: z.output_type ?? 'local',
        // Appareil : override utilisateur > détection UPnP.
        device: [z.brand ?? z.detected_manufacturer, z.model ?? z.detected_model]
          .filter(Boolean)
          .join(' · ') || null,
        state: z.state ?? 'idle',
        online: z.online !== false,
      }));
    }
    profile.license = {
      tier: lic.tier,
      expires_at: lic.expiresAt,
      zone_limit: lic.zoneLimit,
    };
    return profile;
  }

  async function loadProfile() {
    profileLoading = true;
    profileFallback = false;
    try {
      const profile = await api.getSystemProfile();
      if (destroyed) return;
      sysSections = profileToSections(profile ?? {});
    } catch {
      // 404 (serveur pas encore à jour) → fiche composée localement.
      if (destroyed) return;
      profileFallback = true;
      const local = await buildLocalProfile();
      if (destroyed) return;
      sysSections = profileToSections(local);
    } finally {
      if (!destroyed) {
        profileLoading = false;
        profileLoaded = true;
      }
    }
  }

  async function copyProfile() {
    const lines: string[] = [`Tune — ${get(t)('support.tab.system')} — ${new Date().toISOString()}`];
    for (const s of sysSections) {
      lines.push('');
      lines.push(`## ${s.title}`);
      for (const r of s.rows) lines.push(`${r.label}: ${r.value}`);
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      sysCopied = true;
      setTimeout(() => { if (!destroyed) sysCopied = false; }, 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  }

  onMount(() => {
    runDiagnostics();
  });
</script>

<div class="support-view">
  <header class="support-header">
    <h1>{$t('support.title')}</h1>
    <div class="support-tabs">
      <button class="support-tab" class:active={tab === 'diagnostic'} onclick={() => switchTab('diagnostic')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
        {$t('support.tab.diagnostic')}
      </button>
      <button class="support-tab" class:active={tab === 'tickets'} onclick={() => switchTab('tickets')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
        {$t('support.tab.tickets')}
      </button>
      <button class="support-tab" class:active={tab === 'new'} onclick={() => switchTab('new')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        {$t('support.tab.new')}
      </button>
      <button class="support-tab" class:active={tab === 'system'} onclick={() => switchTab('system')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        {$t('support.tab.system')}
      </button>
    </div>
  </header>

  {#if error}
    <div class="support-error" role="alert">{error}</div>
  {/if}

  {#if tab === 'diagnostic'}
    <!-- =================== Volet Diagnostic =================== -->
    <div class="diag-panel">
      <ul class="diag-list">
        {#each diagRows as row (row.id)}
          <li class="diag-row">
            <span class="diag-dot diag-{row.state}"></span>
            <span class="diag-label">{row.label}</span>
            <span class="diag-text">{row.state === 'loading' ? $t('support.diag.checking') : row.text}</span>
            {#if row.action}
              <button class="btn-ghost diag-action" onclick={row.action.run}>{row.action.label}</button>
            {/if}
          </li>
        {/each}
      </ul>
      <button class="btn-ghost diag-refresh" onclick={runDiagnostics} disabled={diagLoading}>
        {diagLoading ? $t('support.diag.checking') : $t('support.diag.refresh')}
      </button>
    </div>

  {:else if tab === 'tickets'}
    <!-- =================== Volet Tickets =================== -->
    {#if sentOk}
      <div class="support-success">{$t('support.ticketSent')}</div>
    {/if}
    {#if !licenseKey}
      <div class="support-soft">{$t('support.licenseRequired')}</div>
    {:else if currentTicket}
      <div class="ticket-detail">
        <button class="btn-ghost" onclick={closeTicket}>← {$t('support.back')}</button>
        <div class="ticket-meta">
          <h2>{currentTicket.subject}</h2>
          <span class="badge status-{currentTicket.status}">{STATUS_LABEL[currentTicket.status] ? $t(STATUS_LABEL[currentTicket.status]) : currentTicket.status}</span>
        </div>
        {#if detailLoading}
          <p class="support-loading">{$t('support.loading')}</p>
        {:else}
          <div class="messages">
            {#each replies as m (m.id)}
              <div class="message {m.author === 'team' ? 'from-staff' : 'from-user'}">
                <div class="message-author">{m.author === 'team' ? $t('support.staffAuthor') : $t('support.you')}</div>
                <div class="message-body">{m.body}</div>
                <div class="message-date">{fmtDateTime(m.created_at)}</div>
              </div>
            {/each}
          </div>
          <form class="reply-form" onsubmit={(e) => { e.preventDefault(); sendReply(); }}>
            <textarea bind:value={replyBody} rows="4" placeholder={$t('support.replyPlaceholder')}></textarea>
            <button class="btn-primary" type="submit" disabled={sendingReply || !replyBody.trim()}>
              {sendingReply ? $t('support.sending') : $t('support.reply')}
            </button>
          </form>
        {/if}
      </div>
    {:else if ticketsLoading}
      <p class="support-loading">{$t('support.loading')}</p>
    {:else if ticketsUnavailable}
      <!-- API mozaiklabs pas encore déployée / injoignable : message doux. -->
      <div class="support-soft">{$t('support.threadsSoon')}</div>
    {:else if tickets.length === 0}
      <div class="support-empty">
        <p class="empty-title">{$t('support.empty')}</p>
        <p>{$t('support.emptyHint')}</p>
        <button class="btn-primary" onclick={() => switchTab('new')}>{$t('support.newTicket')}</button>
      </div>
    {:else}
      <ul class="ticket-list">
        {#each tickets as ticket (ticket.id)}
          <li>
            <button class="ticket-row" onclick={() => openTicket(ticket.id)}>
              {#if ticket.unread_count > 0}
                <span class="unread-dot" title={$t('support.newReply')}></span>
              {/if}
              <span class="ticket-subject" class:unread={ticket.unread_count > 0}>{ticket.subject}</span>
              <span class="badge status-{ticket.status}">{STATUS_LABEL[ticket.status] ? $t(STATUS_LABEL[ticket.status]) : ticket.status}</span>
              <span class="ticket-date">{fmtDate(ticket.last_reply_at ?? ticket.updated_at ?? ticket.created_at)}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}

  {:else if tab === 'new'}
    <!-- =================== Volet Nouveau ticket =================== -->
    <form class="support-form" onsubmit={(e) => { e.preventDefault(); submitTicket(); }}>
      <label>
        <span>{$t('support.subject')}</span>
        <input type="text" bind:value={subject} maxlength="150" placeholder={$t('support.subjectPlaceholder')} required />
      </label>
      <div class="form-grid">
        <label>
          <span>{$t('support.category')}</span>
          <select bind:value={category}>
            {#each CATEGORIES as c}
              <option value={c.value}>{$t(c.label)}</option>
            {/each}
          </select>
        </label>
        <label>
          <span>{$t('support.zone')}</span>
          <select bind:value={zoneName}>
            <option value="">{$t('support.zoneNone')}</option>
            {#each $zones as z (z.id)}
              <option value={z.name}>{z.name}</option>
            {/each}
          </select>
        </label>
      </div>
      <label>
        <span>{$t('support.description')}</span>
        <textarea bind:value={body} rows="8" placeholder={$t('support.descriptionPlaceholder')} required></textarea>
      </label>
      <label class="attach-row">
        <input type="checkbox" bind:checked={attachLogs} />
        <span>{$t('support.attachLogs')}</span>
      </label>
      <p class="support-hint">{$t('support.autoAttach')}</p>

      <!-- Pièces jointes : sélecteur de fichiers + glisser-déposer -->
      <div class="attach-files">
        <span class="attach-files-label">{$t('support.attach.label')}</span>
        <div
          class="dropzone"
          class:dragover={dragOver}
          role="button"
          tabindex="0"
          onclick={() => fileInput?.click()}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput?.click(); } }}
          ondragover={onDragOver}
          ondragleave={onDragLeave}
          ondrop={onDrop}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="22" height="22">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span class="dropzone-text">{$t('support.attach.dropHint')}</span>
          <span class="dropzone-sub">{$t('support.attach.constraints')}</span>
        </div>
        <input
          class="attach-input"
          type="file"
          bind:this={fileInput}
          accept={ATTACH_ACCEPT}
          multiple
          onchange={onFileInput}
        />
        {#if attachError}
          <p class="attach-error">{attachError}</p>
        {/if}
        {#if attachments.length > 0}
          <ul class="attach-list">
            {#each attachments as p, i (p.file.name + p.file.size)}
              <li class="attach-item">
                {#if p.previewUrl}
                  <img class="attach-thumb" src={p.previewUrl} alt={p.file.name} />
                {:else}
                  <span class="attach-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                  </span>
                {/if}
                <span class="attach-name" title={p.file.name}>{p.file.name}</span>
                <span class="attach-size">{fmtSize(p.file.size)}</span>
                <button
                  type="button"
                  class="attach-remove"
                  title={$t('support.attach.remove')}
                  aria-label={$t('support.attach.remove')}
                  onclick={() => removeAttachment(i)}
                >×</button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <button class="btn-primary" type="submit" disabled={submitting || !subject.trim() || !body.trim()}>
        {submitting ? $t('support.sending') : $t('support.sendTicket')}
      </button>
    </form>

  {:else if tab === 'system'}
    <!-- =================== Volet Mon système =================== -->
    {#if profileLoading}
      <p class="support-loading">{$t('support.loading')}</p>
    {:else if sysSections.length === 0}
      <div class="support-soft">{$t('support.sys.empty')}</div>
    {:else}
      <div class="sys-panel">
        <div class="sys-toolbar">
          {#if profileFallback}
            <span class="sys-fallback-note">{$t('support.sys.localFallback')}</span>
          {/if}
          <button class="btn-primary" onclick={copyProfile}>
            {sysCopied ? $t('support.sys.copied') : $t('support.sys.copy')}
          </button>
        </div>
        {#each sysSections as section (section.key)}
          <section class="sys-section">
            <h3>{section.title}</h3>
            <dl>
              {#each section.rows as row}
                <div class="sys-row">
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              {/each}
            </dl>
          </section>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .support-view {
    max-width: 820px;
    margin: 0 auto;
    padding: 1.5rem;
    color: var(--text, #e8e8ea);
  }
  .support-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 1rem;
    margin-bottom: 1.25rem;
  }
  .support-header h1 {
    font-size: 1.4rem;
    margin: 0;
  }

  /* Sous-onglets — même pattern visuel que les eq-mode-tabs d'EqualizerView. */
  .support-tabs {
    display: flex;
    gap: 4px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    padding: 3px;
  }
  .support-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--tune-text-muted, #a0a0a8);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .support-tab:hover { color: var(--tune-text, #e8e8ea); }
  .support-tab.active {
    background: var(--tune-accent, #6c5ce7);
    color: white;
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
  .support-success {
    background: rgba(75, 200, 130, 0.12);
    border: 1px solid rgba(75, 200, 130, 0.4);
    color: #4bc882;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
  }
  /* Message doux (API pas encore déployée, licence absente…) — informatif, pas alarmant. */
  .support-soft {
    background: var(--surface, #1c1c22);
    border: 1px solid var(--border, #33333a);
    color: var(--text-muted, #a0a0a8);
    padding: 1rem 1.25rem;
    border-radius: 8px;
    text-align: center;
  }

  /* --- Diagnostic --- */
  .diag-list {
    list-style: none;
    margin: 0 0 1rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .diag-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: var(--surface, #1c1c22);
    border: 1px solid var(--border, #33333a);
    border-radius: 8px;
    padding: 0.75rem 1rem;
  }
  .diag-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .diag-ok { background: #4bc882; box-shadow: 0 0 6px rgba(75, 200, 130, 0.5); }
  .diag-warn { background: #ffb347; box-shadow: 0 0 6px rgba(255, 179, 71, 0.5); }
  .diag-err { background: #ff5c6c; box-shadow: 0 0 6px rgba(255, 92, 108, 0.5); }
  .diag-loading { background: var(--text-muted, #a0a0a8); opacity: 0.5; }
  .diag-label {
    font-weight: 600;
    min-width: 160px;
  }
  .diag-text {
    flex: 1;
    color: var(--text-muted, #a0a0a8);
    font-size: 0.9rem;
  }
  .diag-action {
    font-size: 0.82rem;
    padding: 0.35rem 0.7rem;
    white-space: nowrap;
  }
  .diag-action:hover { border-color: var(--accent, #6c5ce7); color: var(--text, #e8e8ea); }
  .diag-refresh { font-size: 0.85rem; }

  /* --- Formulaires --- */
  .support-form,
  .reply-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  @media (max-width: 560px) {
    .form-grid { grid-template-columns: 1fr; }
  }
  .support-form label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.9rem;
    color: var(--text-muted, #a0a0a8);
  }
  .support-form label.attach-row {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    color: var(--text, #e8e8ea);
    cursor: pointer;
  }
  .attach-row input[type='checkbox'] {
    accent-color: var(--accent, #6c5ce7);
    width: 16px;
    height: 16px;
  }
  .support-form input[type='text'],
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

  /* --- Pièces jointes --- */
  .attach-files {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .attach-files-label {
    font-size: 0.9rem;
    color: var(--text-muted, #a0a0a8);
  }
  .attach-input {
    display: none;
  }
  .dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: 1.25rem 1rem;
    border: 1.5px dashed var(--border, #33333a);
    border-radius: 10px;
    background: var(--surface, #1c1c22);
    color: var(--text-muted, #a0a0a8);
    cursor: pointer;
    text-align: center;
    transition: border-color 0.15s, background 0.15s, color 0.15s;
  }
  .dropzone:hover,
  .dropzone:focus-visible {
    border-color: var(--accent, #6c5ce7);
    color: var(--text, #e8e8ea);
    outline: none;
  }
  .dropzone.dragover {
    border-color: var(--accent, #6c5ce7);
    background: rgba(108, 92, 231, 0.1);
    color: var(--text, #e8e8ea);
  }
  .dropzone-text {
    font-size: 0.9rem;
    font-weight: 500;
  }
  .dropzone-sub {
    font-size: 0.78rem;
    opacity: 0.8;
  }
  .attach-error {
    margin: 0;
    font-size: 0.82rem;
    color: #ff8a95;
  }
  .attach-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .attach-item {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    background: var(--surface, #1c1c22);
    border: 1px solid var(--border, #33333a);
    border-radius: 8px;
    padding: 0.45rem 0.6rem;
  }
  .attach-thumb {
    width: 34px;
    height: 34px;
    object-fit: cover;
    border-radius: 6px;
    flex-shrink: 0;
  }
  .attach-icon {
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-muted, #a0a0a8);
    flex-shrink: 0;
  }
  .attach-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.88rem;
    color: var(--text, #e8e8ea);
  }
  .attach-size {
    font-size: 0.78rem;
    color: var(--text-muted, #a0a0a8);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .attach-remove {
    background: transparent;
    border: none;
    color: var(--text-muted, #a0a0a8);
    font-size: 1.35rem;
    line-height: 1;
    cursor: pointer;
    padding: 0 0.35rem;
    border-radius: 6px;
    flex-shrink: 0;
  }
  .attach-remove:hover {
    color: #ff8a95;
  }

  /* --- Tickets --- */
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
  .unread-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent, #6c5ce7);
    flex-shrink: 0;
  }
  .ticket-subject {
    flex: 1;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ticket-subject.unread { font-weight: 700; }
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
  .status-answered { background: rgba(108, 155, 231, 0.18); color: #6c9be7; }
  .status-resolved { background: rgba(75, 200, 130, 0.18); color: #4bc882; }
  .support-empty {
    text-align: center;
    padding: 3rem 1rem;
    color: var(--text-muted, #a0a0a8);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
  .empty-title {
    font-size: 1.05rem;
    color: var(--text, #e8e8ea);
    margin-bottom: 0.35rem;
  }
  .ticket-detail {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .ticket-detail > .btn-ghost { align-self: flex-start; }
  .ticket-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .ticket-meta h2 {
    font-size: 1.15rem;
    margin: 0;
  }
  .messages {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
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

  /* --- Mon système --- */
  .sys-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .sys-toolbar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 1rem;
  }
  .sys-fallback-note {
    font-size: 0.8rem;
    color: var(--text-muted, #a0a0a8);
    flex: 1;
  }
  .sys-section {
    background: var(--surface, #1c1c22);
    border: 1px solid var(--border, #33333a);
    border-radius: 10px;
    padding: 1rem 1.25rem;
  }
  .sys-section h3 {
    margin: 0 0 0.75rem;
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--tune-accent, #6c5ce7);
  }
  .sys-section dl { margin: 0; }
  .sys-row {
    display: flex;
    gap: 1rem;
    padding: 0.35rem 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
  .sys-row:last-child { border-bottom: none; }
  .sys-row dt {
    min-width: 180px;
    color: var(--text-muted, #a0a0a8);
    font-size: 0.88rem;
  }
  .sys-row dd {
    margin: 0;
    font-size: 0.88rem;
    word-break: break-word;
  }
</style>
