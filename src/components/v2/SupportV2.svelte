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
  import { currentZone } from '../../lib/stores/zones';
  import { t } from '../../lib/i18n';
  import { dateEtHeure } from '../../lib/dates';
  import { zones } from '../../lib/stores/zones';
  import { currentVersion } from '../../lib/stores/updates';
  import { copyText } from '../../lib/utils';
  import { modeleSysteme, mermaidSysteme, planSysteme } from '../../lib/schemaSysteme';
  import '../../styles/tune-v2.css';

  /**
   * TROIS volets, comme l'écran du client actuel.
   *
   * Bertrand, 05/09/2026 : « Vue support incomplète comparée à la v0, et
   * onglet visualiser son système (avec le schéma mermaid affiché) ». Le
   * nouvel écran n'avait QUE les tickets : ni diagnostic, ni fiche système.
   * Or c'est le diagnostic qu'on regarde en premier quand quelque chose ne va
   * pas, et la fiche que le support demande ensuite.
   */
  type Volet = 'diagnostic' | 'tickets' | 'systeme';
  let volet = $state<Volet>('diagnostic');

  /* ---------------- Diagnostic ---------------- */
  let diagEnCours = $state(true);
  let baseEtat = $state<any | null>(null);
  let baseMuette = $state(false);
  let analyse = $state<boolean | null>(null);
  let sante = $state<any | null>(null);
  let versionServeur = $state<string | null>(null);

  async function diagnostiquer() {
    diagEnCours = true;
    const T = 8_000;
    // Quatre sondes INDÉPENDANTES : celle qui échoue ne prive pas des autres.
    // Une seule `await` en chaîne aurait fait d'un serveur sans tableau de bord
    // administrateur un écran vide.
    const [db, scan, admin, health] = await Promise.all([
      api.withTimeout(api.getDatabaseStatus(), T, 'db-status').catch(() => null),
      api.withTimeout(api.getScanStatus(), T, 'scan-status').catch(() => null),
      api.withTimeout(api.getAdminHealth(), T, 'admin-health').catch(() => null),
      api.withTimeout(api.getHealth(), T, 'health').catch(() => null),
    ]);
    baseEtat = db;
    baseMuette = db === null;
    analyse = scan ? !!(scan as any).scanning : null;
    sante = admin;
    versionServeur = (health as any)?.version ?? null;
    diagEnCours = false;
  }
  $effect(() => { if (volet === 'diagnostic') void diagnostiquer(); });

  /* ---------------- Mon système ---------------- */
  const schema = $derived(modeleSysteme($zones, String($currentVersion ?? '')));
  const plan = $derived(planSysteme(schema));
  let copie = $state(false);

  /**
   * RENDU MERMAID, demandé par Bertrand le 05/09/2026 après que je lui aie
   * proposé le dessin fait main pour éviter le poids de la bibliothèque.
   *
   * 🔴 Chargée en IMPORT DIFFÉRÉ, et c'est ce qui rend la demande tenable :
   * `mermaid` pèse plus que tout le reste du client réuni. Un `import` en tête
   * de fichier l'aurait mise dans le paquet principal, que tout le monde
   * télécharge au premier écran. En `await import(…)`, l'outil de construction
   * la met dans un morceau à part, chargé le jour où l'on ouvre cet onglet — et
   * jamais avant.
   *
   * Le dessin fait main RESTE, en secours : si la bibliothèque ne se charge pas
   * — réseau coupé, morceau absent — on montre le schéma plutôt qu'un vide.
   */
  let svgMermaid = $state<string | null>(null);
  let mermaidEchec = $state(false);
  let mermaidSeq = 0;

  $effect(() => {
    if (volet !== 'systeme' || !plan.boites.length) return;
    const texte = mermaidSysteme(schema);
    const sombre = document.documentElement.getAttribute('data-theme') !== 'light';
    const mien = ++mermaidSeq;
    (async () => {
      try {
        const m = (await import('mermaid')).default;
        m.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          // Le thème suit celui du client : un schéma clair sur fond sombre
          // serait une tache blanche au milieu de l'écran.
          theme: sombre ? 'dark' : 'default',
          flowchart: { curve: 'basis', htmlLabels: false },
        });
        // L'identifiant doit être unique : Mermaid pose des `id` dans le SVG,
        // et deux rendus successifs sous le même nom se marchent dessus.
        const { svg } = await m.render(`sys${mien}`, texte);
        if (mien === mermaidSeq) { svgMermaid = svg; mermaidEchec = false; }
      } catch {
        if (mien === mermaidSeq) { svgMermaid = null; mermaidEchec = true; }
      }
    })();
  });
  async function copierSchema() {
    try {
      await copyText(mermaidSysteme(schema));
      copie = true;
      setTimeout(() => (copie = false), 2000);
    } catch { /* presse-papiers indisponible */ }
  }

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

  /**
   * OUVRIR un ticket — le geste manquait (Bertrand, 04/09/2026 : « la vue
   * sidebar Support n'est pas implémentée en v2 », « complètement »).
   *
   * L'écran savait lire les fils et y répondre, mais pas en commencer un : il
   * fallait retourner au client actuel pour écrire au support. Troisième cas du
   * même motif après les collections et les radios —
   * `createSupportTicketMultipart` existe et n'avait qu'un appelant,
   * `SupportView.svelte`.
   *
   * MULTIPART, et non JSON : la route accepte des pièces jointes. C'est le
   * piège qui a fait échouer l'import Roon/Plex — un client qui envoie du JSON
   * à une route multipart reçoit un 415 sans rien comprendre.
   */
  let redaction = $state(false);
  let sujet = $state('');
  let corps = $state('');
  let categorie = $state('other');
  let zone = $state('');
  let joindreDiag = $state(true);
  let fichiers = $state<File[]>([]);
  let envoi = $state(false);

  /**
   * Les SIX catégories réellement traduites.
   *
   * Le client actuel en propose cinq, dont deux — `support.category.library` et
   * `support.category.hardware` — qui n'existent dans AUCUNE des onze langues :
   * elles s'affichent en clé brute. `check-i18n` ne l'attrape pas, il vérifie
   * le français en dur et la parité des locales, pas les clés citées sans
   * exister. Défaut relevé le 04/09/2026 ; on ne le reproduit pas ici.
   */
  const CATEGORIES = [
    { v: 'playback', k: 'support.category.playback' },
    { v: 'scan', k: 'support.category.scan' },
    { v: 'streaming', k: 'support.category.streaming' },
    { v: 'audio', k: 'support.category.audio' },
    { v: 'license', k: 'support.category.license' },
    { v: 'other', k: 'support.category.other' },
  ];

  // La zone concernée est pré-remplie avec celle qu'on écoute : c'est presque
  // toujours celle dont on vient se plaindre, et la retaper est une corvée.
  let zonePreremplie = false;
  $effect(() => {
    const z = $currentZone;
    if (!zonePreremplie && z?.name) { zone = z.name; zonePreremplie = true; }
  });

  const peutEnvoyer = $derived(sujet.trim().length > 0 && corps.trim().length > 0 && !envoi);

  async function envoyer() {
    if (!peutEnvoyer) return;
    envoi = true;
    try {
      const form = new FormData();
      form.append('subject', sujet.trim());
      form.append('body', corps.trim());
      form.append('category', categorie);
      if (zone.trim()) form.append('zone', zone.trim());

      // Journaux et fiche système : OPTIONNELS et retro-compatibles (#1073).
      // Un serveur plus ancien ignore simplement ces champs — on n'échoue donc
      // pas l'envoi si l'un des deux ne répond pas.
      if (joindreDiag) {
        try { form.append('logs', await api.getBugReportMarkdown()); } catch { /* sans les journaux */ }
        try { form.append('system', JSON.stringify(await api.getSystemProfile())); } catch { /* sans la fiche */ }
      }
      for (const f of fichiers) form.append('attachments[]', f, f.name);

      await api.createSupportTicketMultipart(form);
      sujet = ''; corps = ''; categorie = 'other'; fichiers = []; redaction = false;
      rechargerTickets();
    } catch (e: any) {
      // Le délai remonté par le serveur DOIT survivre jusqu'ici : sans lui,
      // l'écran ne sait pas dire quand réessayer (#2178).
      const attente = (e as any)?.retryAfter;
      error = attente
        ? $t('v2.sup.errRateLimited' as any).replace('{delay}', String(attente))
        : (e?.message ?? $t('v2.sup.errSend' as any));
    }
    envoi = false;
  }

  function rechargerTickets() {
    const key = licenseKey;
    if (!key) return;
    api.getSupportTickets(key).then((r) => { tickets = r?.tickets ?? []; }).catch(() => {});
  }

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
    {#if licenseKey && !redaction}
      <button class="neuve" onclick={() => (redaction = true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        {$t('v2.sup.newTicket' as any)}
      </button>
    {/if}
  </header>

  <nav class="volets" role="tablist">
    <button class:on={volet === 'diagnostic'} role="tab" aria-selected={volet === 'diagnostic'}
      onclick={() => (volet = 'diagnostic')}>{$t('v2.sup.tabDiag' as any)}</button>
    <button class:on={volet === 'tickets'} role="tab" aria-selected={volet === 'tickets'}
      onclick={() => (volet = 'tickets')}>{$t('v2.sup.tabTickets' as any)}</button>
    <button class:on={volet === 'systeme'} role="tab" aria-selected={volet === 'systeme'}
      onclick={() => (volet = 'systeme')}>{$t('v2.sup.tabSystem' as any)}</button>
  </nav>

  {#if error}<div class="err">{error}<button onclick={() => (error = null)} aria-label="Fermer">×</button></div>{/if}

  <div class="scroll">
    {#if volet === 'diagnostic'}
      <div class="diag">
        <div class="dl">
          <div class="dr"><span class="dk">{$t('v2.sup.diagServer' as any)}</span>
            <span class="dv" class:ok={!!versionServeur} class:ko={!diagEnCours && !versionServeur}>
              {diagEnCours ? '…' : versionServeur ? `v${versionServeur}` : $t('v2.sup.diagUnreachable' as any)}</span></div>
          <div class="dr"><span class="dk">{$t('v2.sup.diagDb' as any)}</span>
            <span class="dv" class:ok={!!baseEtat} class:ko={baseMuette}>
              {diagEnCours ? '…' : baseMuette ? $t('v2.sup.diagUnreachable' as any) : $t('v2.sup.diagOk' as any)}</span></div>
          <div class="dr"><span class="dk">{$t('v2.sup.diagScan' as any)}</span>
            <span class="dv">
              {diagEnCours ? '…' : analyse === null ? '—' : analyse ? $t('v2.sup.diagScanning' as any) : $t('v2.sup.diagIdle' as any)}</span></div>
          <div class="dr"><span class="dk">{$t('v2.sup.diagZones' as any)}</span>
            <span class="dv">{$zones.length}</span></div>
          {#if sante}
            <!-- L'espace disque ne vient QUE du tableau de bord administrateur :
                 absent sur un serveur qui ne l'expose pas, et une ligne vide y
                 vaudrait mieux qu'un zéro qui ressemble à un disque plein. -->
            <div class="dr"><span class="dk">{$t('v2.sup.diagDisk' as any)}</span>
              <span class="dv">{(sante as any)?.disk?.free_human ?? (sante as any)?.disk_free ?? '—'}</span></div>
          {/if}
        </div>
        <button class="lnk" onclick={diagnostiquer} disabled={diagEnCours}>
          {diagEnCours ? $t('v2.sup.diagChecking' as any) : $t('v2.sup.diagRefresh' as any)}
        </button>
      </div>

    {:else if volet === 'systeme'}
      <div class="sys">
        <p class="sub">{$t('v2.sup.sysHint' as any)}</p>
        {#if !plan.boites.length}
          <div class="notice"><p>{$t('v2.sup.sysEmpty' as any)}</p></div>
        {:else}
          <!-- Le schéma est DESSINÉ, pas rendu par Mermaid : la bibliothèque
               pèse environ un demi-Mo sur un paquet de 4,6 Mo, pour un graphe
               à trois niveaux. Le texte Mermaid reste copiable ci-dessous —
               c'est la forme que le support attend, et les deux sortent du
               même modèle. -->
          {#if svgMermaid}
            <!-- Rendu par Mermaid. `@html` sur une chaîne que NOUS produisons :
                 elle sort de `mermaidSysteme`, qui échappe déjà les libellés en
                 entités numériques, et Mermaid tourne en `securityLevel:
                 strict`. Aucune entrée de l'utilisateur n'y arrive telle
                 quelle. -->
            <div class="schema mermaid">{@html svgMermaid}</div>
          {:else}
          <div class="schema">
            <svg viewBox="0 0 {plan.largeur} {plan.hauteur}" width={plan.largeur} height={plan.hauteur}
              role="img" aria-label={$t('v2.sup.tabSystem' as any)}>
              {#each plan.traits as tr, i (i)}
                <path d="M{tr.x1} {tr.y1} C{tr.x1 + 36} {tr.y1}, {tr.x2 - 36} {tr.y2}, {tr.x2} {tr.y2}"
                  class="lien" class:off={tr.horsLigne} />
              {/each}
              {#each plan.boites as b, i (i)}
                <g class="bx {b.genre}" class:off={b.horsLigne}>
                  <rect x={b.x} y={b.y} width={b.l} height={b.h} rx="10" />
                  <text x={b.x + b.l / 2} y={b.y + b.h / 2 + 4} text-anchor="middle">{b.texte}</text>
                </g>
              {/each}
            </svg>
          </div>
          {#if mermaidEchec}<p class="sub">{$t('v2.sup.sysFallback' as any)}</p>{/if}
          {/if}
          <button class="lnk" onclick={copierSchema}>
            {copie ? $t('v2.sup.sysCopied' as any) : $t('v2.sup.sysCopy' as any)}
          </button>
        {/if}
      </div>

    {:else if !licenseKey}
      <div class="notice">
        <p>
          Le suivi des tickets est lié à votre <b>clé de licence</b>. Aucune clé n'est
          enregistrée sur ce serveur, il n'y a donc aucun fil à afficher.
        </p>
        <p class="sub">
          {$t('v2.sup.licenceA' as any)} <b>{$t('v2.sup.licenceWhere' as any)}</b>.
        </p>
      </div>
    {:else if redaction}
      <!--
        Rédaction d'un ticket. Elle remplace la liste plutôt que de s'ouvrir
        au-dessus : on écrit au support d'une traite, et la liste n'apporte
        rien pendant ce temps.
      -->
      <form class="redac" onsubmit={(e) => { e.preventDefault(); void envoyer(); }}>
        <label class="champ">
          <span>{$t('v2.sup.subject' as any)}</span>
          <input class="txt" bind:value={sujet} maxlength="160" required />
        </label>

        <div class="deux">
          <label class="champ">
            <span>{$t('v2.sup.category' as any)}</span>
            <select class="sel" bind:value={categorie}>
              {#each CATEGORIES as c (c.v)}<option value={c.v}>{$t(c.k as any)}</option>{/each}
            </select>
          </label>
          <label class="champ">
            <span>{$t('v2.sup.zone' as any)}</span>
            <input class="txt" bind:value={zone} placeholder={$t('v2.sup.zoneHint' as any)} />
          </label>
        </div>

        <label class="champ">
          <span>{$t('v2.sup.body' as any)}</span>
          <textarea class="txt zone" bind:value={corps} rows="8" required></textarea>
        </label>

        <label class="case">
          <input type="checkbox" bind:checked={joindreDiag} />
          <span>
            {$t('v2.sup.attachDiag' as any)}
            <em>{$t('v2.sup.attachDiagHint' as any)}</em>
          </span>
        </label>

        <label class="champ">
          <span>{$t('v2.sup.files' as any)}</span>
          <input type="file" multiple
            onchange={(e) => { fichiers = Array.from((e.currentTarget as HTMLInputElement).files ?? []); }} />
          {#if fichiers.length}
            <em class="fnoms">{fichiers.map((f) => f.name).join(', ')}</em>
          {/if}
        </label>

        <div class="actions">
          <button type="submit" class="go" disabled={!peutEnvoyer}>
            {envoi ? $t('v2.sup.sending' as any) : $t('v2.sup.send' as any)}
          </button>
          <button type="button" class="lnk" onclick={() => (redaction = false)}>{$t('v2.zone.cancel' as any)}</button>
        </div>
      </form>

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
  .neuve{display:inline-flex; align-items:center; gap:8px; height:38px; padding:0 16px; margin-left:auto;
    border-radius:var(--v2-r-pill); border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt2); cursor:pointer; font:600 12.5px var(--v2-sans); white-space:nowrap}
  .neuve:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .neuve svg{width:16px; height:16px}

  .redac{display:flex; flex-direction:column; gap:16px; max-width:760px; padding-top:6px}
  .redac .deux{display:grid; grid-template-columns:1fr 1fr; gap:16px}
  .champ{display:flex; flex-direction:column; gap:6px}
  .champ > span{font:600 10.5px var(--v2-mono); letter-spacing:.05em; color:var(--v2-txt3); text-transform:uppercase}
  .txt{height:38px; border-radius:9px; border:1px solid var(--v2-line2); background:var(--v2-surface2);
    color:var(--v2-txt); font:13.5px var(--v2-sans); padding:0 12px; outline:none; width:100%}
  .txt.zone{height:auto; padding:11px 12px; line-height:1.6; resize:vertical; font-family:var(--v2-sans)}
  .txt:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .sel{height:38px; border-radius:9px; border:1px solid var(--v2-line2); background:var(--v2-surface2);
    color:var(--v2-txt); font:13.5px var(--v2-sans); padding:0 10px; outline:none; cursor:pointer; width:100%}
  .case{display:flex; align-items:flex-start; gap:10px; font-size:13px}
  .case em{display:block; margin-top:3px; font-style:normal; font-size:12px; color:var(--v2-txt3); line-height:1.55}
  .fnoms{font-style:normal; font-size:12px; color:var(--v2-txt3)}
  .redac .actions{display:flex; align-items:center; gap:10px}
  .redac .go{height:40px; padding:0 20px; border-radius:var(--v2-r-pill); border:0; cursor:pointer;
    font:700 13px var(--v2-sans); background:var(--v2-acc1); color:var(--v2-on-acc)}
  .redac .go:disabled{opacity:.5; cursor:default}
  .redac .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:999px; padding:7px 15px; font:600 11.5px var(--v2-sans)}
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

  /* Volets — meme barre que Podcasts et Streaming. */
  .volets{display:flex; gap:2px; padding:0 30px; border-bottom:1px solid var(--v2-line); margin-bottom:14px}
  .volets button{position:relative; border:0; background:transparent; color:var(--v2-txt2); cursor:pointer;
    padding:10px 14px; font:600 13px var(--v2-sans)}
  .volets button:hover{color:var(--v2-txt)}
  .volets button.on{color:var(--v2-txt)}
  .volets button.on::after{content:""; position:absolute; left:10px; right:10px; bottom:-1px; height:2px;
    background:linear-gradient(90deg,var(--v2-acc1),var(--v2-acc2))}

  /* Diagnostic */
  .diag{padding:6px 30px 30px; display:flex; flex-direction:column; align-items:flex-start; gap:16px}
  .dl{width:100%; max-width:560px; display:flex; flex-direction:column; gap:1px}
  .dr{display:flex; align-items:center; justify-content:space-between; gap:16px; padding:11px 14px;
    border-radius:9px; background:var(--v2-surface2)}
  .dk{font-size:13.5px; color:var(--v2-txt2)}
  .dv{font:12px var(--v2-mono); color:var(--v2-txt)}
  .dv.ok{color:var(--v2-acc1)}
  .dv.ko{color:var(--v2-danger)}

  /* Mon systeme */
  .sys{padding:6px 30px 30px; display:flex; flex-direction:column; align-items:flex-start; gap:16px}
  .sys .sub{font-size:13px; color:var(--v2-txt3); max-width:620px; line-height:1.5}
  .schema{width:100%; overflow-x:auto; padding:6px 0}
  .schema svg{max-width:none}
  /* Mermaid pose ses propres couleurs : on ne lui impose que la place. */
  .schema.mermaid{display:flex; justify-content:flex-start}
  .schema.mermaid :global(svg){max-width:none; height:auto}
  .schema .lien{fill:none; stroke:var(--v2-line2); stroke-width:1.6}
  .schema .lien.off{stroke-dasharray:4 4}
  .schema .bx rect{fill:var(--v2-surface2); stroke:var(--v2-line2); stroke-width:1}
  .schema .bx text{fill:var(--v2-txt); font:12px var(--v2-sans)}
  .schema .bx.serveur rect{fill:var(--v2-acc-soft); stroke:var(--v2-acc2)}
  .schema .bx.appareil rect{fill:transparent}
  /* Hors ligne : pointilles, comme le `stroke-dasharray` du Mermaid d'origine. */
  .schema .bx.off rect{stroke-dasharray:4 4}
  .schema .bx.off text{fill:var(--v2-txt3)}
</style>
