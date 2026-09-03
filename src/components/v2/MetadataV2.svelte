<script lang="ts">
  /**
   * Métadonnées — nouveau client (direction Levente). Niveau Expert.
   *
   * PÉRIMÈTRE ASSUMÉ : ce n'est PAS l'éditeur de tags de l'écran actuel. Cet
   * écran couvre les deux choses qui demandent une DÉCISION :
   *   - les propositions de la communauté, à accepter ou refuser ;
   *   - les albums douteux, que le serveur signale avec ses raisons.
   * L'édition champ par champ reste dans l'écran actuel, et on y renvoie.
   *
   * `accept: false` n'est pas un rejet muet : c'est une VOIX pour la valeur
   * qu'on possède déjà. L'écran le dit, sinon on croit jeter l'information.
   */
  import * as api from '../../lib/api';
  import type { MetadataProposal, DoubtfulAlbum } from '../../lib/api';
  import { formatNumber } from '../../lib/utils';
  import AlbumArt from '../AlbumArt.svelte';
  // L'arbre des genres du client actuel, REPRIS tel quel plutôt que réécrit :
  // 426 lignes qui savent charger, renommer, fusionner et enregistrer. Le
  // dupliquer en style v2 aurait été quatre cents lignes de risque pour un
  // habillage. Il est habillé par le conteneur, voir `.gt-v2`.
  import GenreTreeView from '../GenreTreeView.svelte';
  import '../../styles/tune-v2.css';

  type Tab = 'proposals' | 'doubtful' | 'genres';
  let tab = $state<Tab>('proposals');

  let proposals = $state<MetadataProposal[]>([]);
  let pending = $state(0);
  let autoApply = $state(false);
  let pLoading = $state(true);
  let doubtful = $state<DoubtfulAlbum[]>([]);
  let dLoading = $state(false);
  let dLoaded = false;
  let error = $state<string | null>(null);
  let busy = $state<number | null>(null);

  async function loadProposals() {
    pLoading = true;
    try {
      const r = await api.listMetadataProposals();
      proposals = r?.proposals ?? []; pending = r?.pending ?? 0; autoApply = !!r?.auto_apply;
      error = null;
    } catch { error = 'Propositions indisponibles sur ce serveur.'; }
    pLoading = false;
  }
  $effect(() => { loadProposals(); });

  // Les albums douteux ne sont chargés qu'à l'ouverture de leur onglet.
  $effect(() => {
    if (tab !== 'doubtful' || dLoaded) return;
    dLoaded = true; dLoading = true;
    api.getDoubtfulAlbums()
      .then((r) => { doubtful = r ?? []; })
      .catch(() => { error = 'Liste indisponible.'; })
      .finally(() => { dLoading = false; });
  });

  async function decide(p: MetadataProposal, accept: boolean) {
    if (busy != null) return;
    busy = p.id;
    try {
      await api.decideMetadataProposal(p.id, accept);
      proposals = proposals.filter((x) => x.id !== p.id);
      pending = Math.max(0, pending - 1);
    } catch { error = 'Décision non enregistrée.'; }
    busy = null;
  }
  async function toggleAuto() {
    const next = !autoApply;
    autoApply = next;
    try { await api.setMetadataProposalsAutoApply(next); }
    catch { autoApply = !next; error = 'Réglage non enregistré.'; }
  }

  const FIELDS: Record<string, string> = {
    title: 'Titre', artist: 'Artiste', album: 'Album', genre: 'Genre',
    year: 'Année', label: 'Label', composer: 'Compositeur',
  };
  const REASONS: Record<string, string> = {
    no_year: 'Année manquante', no_genre: 'Genre manquant', no_cover: 'Pochette manquante',
    no_artist: 'Artiste manquant', unknown_artist: 'Artiste inconnu',
  };
</script>

<section class="v2-meta tune-v2">
  <header class="top">
    <div>
      <div class="eyebrow">Studio</div>
      <h1>Métadonnées</h1>
    </div>
    <nav class="tabs">
      <button class:on={tab === 'proposals'} onclick={() => (tab = 'proposals')}>Propositions<span>{formatNumber(pending)}</span></button>
      <button class:on={tab === 'doubtful'} onclick={() => (tab = 'doubtful')}>Albums douteux{#if dLoaded}<span>{formatNumber(doubtful.length)}</span>{/if}</button>
      <button class:on={tab === 'genres'} onclick={() => (tab = 'genres')}>Arbre des genres</button>
    </nav>
  </header>

  {#if error}<div class="err">{error}<button onclick={() => (error = null)} aria-label="Fermer">×</button></div>{/if}

  <div class="scroll">
    {#if tab === 'proposals'}
      <div class="auto">
        <div class="al">
          <span>Appliquer automatiquement</span>
          <span class="hint">Les propositions largement partagées sont adoptées sans vous demander.</span>
        </div>
        <label class="sw">
          <input type="checkbox" checked={autoApply} onchange={toggleAuto} />
          <span class="slider"></span>
        </label>
      </div>

      {#if pLoading}
        <div class="state">Chargement des propositions…</div>
      {:else if !proposals.length}
        <div class="state">Aucune proposition en attente.</div>
      {:else}
        <p class="note">
          Refuser n'efface rien : c'est une <b>voix pour la valeur que vous possédez déjà</b>.
        </p>
        <div class="list">
          {#each proposals as p (p.id)}
            <article class="prop">
              <div class="pw">
                <div class="pt">{p.title ?? '—'}{#if p.artist}<em>{p.artist}</em>{/if}</div>
                <div class="pf">{FIELDS[p.field] ?? p.field}</div>
                <div class="diff">
                  <span class="cur">{p.current ?? '—'}</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                  <span class="new">{p.proposed ?? '—'}</span>
                </div>
                <div class="src">{formatNumber(p.servers_count)} bibliothèque{p.servers_count > 1 ? 's' : ''} portent cette valeur</div>
              </div>
              <div class="pa">
                <button class="go" disabled={busy === p.id} onclick={() => decide(p, true)}>Accepter</button>
                <button class="lnk" disabled={busy === p.id} onclick={() => decide(p, false)}>Garder la mienne</button>
              </div>
            </article>
          {/each}
        </div>
      {/if}

    {:else if tab === 'genres'}
      <!--
        L'arbre des genres, demandé par Bertrand le 03/09/2026 en troisième
        onglet.

        Il vient du client actuel, sans modification. Le conteneur redéfinit les
        sept variables `--tune-*` qu'il utilise à partir de la palette `--v2-*` :
        c'est ce qui l'accorde à cet écran sans toucher une ligne du composant,
        ni le figer dans une seule apparence. Sans cela, il aurait été un îlot
        à l'ancien thème au milieu du nouveau.
      -->
      <div class="gt-v2">
        <GenreTreeView />
      </div>

    {:else if dLoading}
      <div class="state">Chargement…</div>
    {:else if !doubtful.length}
      <div class="state">Aucun album signalé.</div>
    {:else}
      <div class="dgrid">
        {#each doubtful as a (a.id)}
          <article class="dcard">
            <span class="cv"><AlbumArt coverPath={a.cover_path} albumId={a.id} size={0} alt={a.title} fallbackInitials={a.title?.slice(0,1)} /></span>
            <div class="dm">
              <div class="dt">{a.title}</div>
              <div class="da">{a.artist_resolved ?? a.artist_name ?? 'Artiste inconnu'}</div>
              <div class="drs">
                {#each a.reasons as r (r)}<span class="r">{REASONS[r] ?? r}</span>{/each}
              </div>
            </div>
          </article>
        {/each}
      </div>
    {/if}

    <!-- Pas de bouton « ouvrir l'éditeur » : la vue `metadata` est CET écran
         désormais, un lien y renverrait sur lui-même. On dit où c'est, sans
         promettre un raccourci qui tourne en rond. -->
    {#if tab !== 'genres'}
      <p class="foot">
        L'édition champ par champ et l'enrichissement par lot ne sont pas repris ici :
        ils restent dans le client actuel, hors du drapeau <code>?v2</code>.
        L'avancement de l'enrichissement se suit dans <b>Processing</b>.
      </p>
    {/if}
  </div>
</section>

<style>
  /*
    Habillage de l'arbre des genres repris du client actuel.

    Il n'utilise que SEPT variables `--tune-*` — je les ai comptées. Les
    redéfinir ici depuis la palette `--v2-*` l'accorde à cet écran sans
    modifier une ligne du composant : il reste utilisable tel quel dans le
    client actuel, où ces variables gardent leurs valeurs d'origine.

    `--tune-accent-rgb` est un TRIPLET, pas une couleur : il sert dans des
    `rgba(var(...), .15)`. La palette v2 n'en publie aucun ; on garde donc la
    valeur de repli du composant plutôt que d'inventer une conversion qui
    casserait au premier changement de thème.
  */
  .gt-v2{
    --tune-bg: var(--v2-bg);
    --tune-surface: var(--v2-surface);
    --tune-text: var(--v2-txt);
    --tune-text-muted: var(--v2-txt3);
    --tune-border: var(--v2-line2);
    --tune-accent: var(--v2-acc1);
    font-family: var(--v2-sans);
  }
  .v2-meta{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .top{display:flex; align-items:flex-end; gap:22px; padding:24px 30px 14px; padding-right:96px}
  .eyebrow{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em; margin-top:4px}
  .tabs{display:flex; gap:4px}
  .tabs button{display:inline-flex; align-items:center; gap:8px; border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt2); cursor:pointer; font:600 12px var(--v2-sans); padding:8px 14px; border-radius:var(--v2-r-pill)}
  .tabs button span{font:9.5px var(--v2-mono); color:var(--v2-txt3)}
  .tabs button.on{color:var(--v2-on-acc); border-color:transparent; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .tabs button.on span{color:var(--v2-on-acc); opacity:.75}

  .err{display:flex; align-items:center; gap:12px; margin:0 30px 10px; padding:9px 14px; border-radius:10px;
    font-size:12.5px; border:1px solid var(--v2-danger-bd); color:var(--v2-danger)}
  .err button{margin-left:auto; border:0; background:transparent; color:inherit; font-size:16px; cursor:pointer}

  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:30px 0; color:var(--v2-txt3)}
  .note{padding:4px 0 16px; font-size:12.5px; color:var(--v2-txt3)}
  .note b{color:var(--v2-txt2)}

  .auto{display:flex; align-items:center; justify-content:space-between; gap:22px; padding:14px 18px;
    border-radius:13px; border:1px solid var(--v2-line); background:var(--v2-surface2); margin-bottom:18px}
  .al{display:flex; flex-direction:column; gap:4px}
  .al span:first-child{font-size:13.5px; font-weight:600}
  .hint{font-size:11.5px; color:var(--v2-txt3)}
  .sw{position:relative; width:44px; height:25px; cursor:pointer; flex:0 0 auto}
  .sw input{position:absolute; opacity:0; width:0; height:0}
  .slider{position:absolute; inset:0; border-radius:999px; background:var(--v2-line2); transition:.18s}
  .slider::before{content:""; position:absolute; left:3px; top:3px; width:19px; height:19px; border-radius:50%;
    background:var(--v2-knob); transition:.18s}
  .sw input:checked + .slider{background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .sw input:checked + .slider::before{transform:translateX(19px)}

  .list{display:flex; flex-direction:column; gap:9px}
  .prop{display:flex; align-items:center; gap:20px; padding:14px 18px; border-radius:12px;
    border:1px solid var(--v2-line); background:var(--v2-surface2)}
  .pw{flex:1; min-width:0}
  .pt{font-size:14px; font-weight:700; display:flex; gap:9px; align-items:baseline}
  .pt em{font:11.5px var(--v2-sans); font-style:normal; color:var(--v2-txt3)}
  .pf{margin-top:4px; font:9.5px var(--v2-mono); letter-spacing:.1em; text-transform:uppercase; color:var(--v2-acc2)}
  .diff{margin-top:8px; display:flex; align-items:center; gap:12px; flex-wrap:wrap}
  .diff svg{width:15px; height:15px; color:var(--v2-txt3); flex:0 0 auto}
  .cur{font-size:13px; color:var(--v2-txt3); text-decoration:line-through}
  .new{font-size:13px; font-weight:600; color:var(--v2-acc-tint)}
  .src{margin-top:7px; font:10.5px var(--v2-mono); color:var(--v2-txt3)}
  .pa{display:flex; gap:8px; flex:0 0 auto}
  .go{height:34px; padding:0 18px; border-radius:var(--v2-r-pill); border:0; cursor:pointer; font:700 12.5px var(--v2-sans);
    color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:var(--v2-r-pill); padding:7px 15px; font:600 12px var(--v2-sans)}
  .lnk:hover:not(:disabled){border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .go:disabled,.lnk:disabled{opacity:.45; cursor:default}
  .lnk.sm{padding:5px 12px; font-size:11.5px; margin-left:8px}

  .dgrid{display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px}
  .dcard{display:flex; gap:14px; padding:12px; border-radius:12px; border:1px solid var(--v2-line); background:var(--v2-surface2)}
  .dcard .cv{width:64px; height:64px; flex:0 0 auto; border-radius:8px; overflow:hidden}
  .dm{min-width:0}
  .dt{font-size:13.5px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .da{margin-top:3px; font-size:11.5px; color:var(--v2-txt2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .drs{margin-top:8px; display:flex; gap:5px; flex-wrap:wrap}
  .r{font:9.5px var(--v2-mono); color:var(--v2-danger); border:1px solid var(--v2-danger-bd);
    border-radius:999px; padding:2px 8px}

  .foot{margin-top:24px; font-size:12.5px; line-height:1.6; color:var(--v2-txt3); max-width:70ch}
  .foot b{color:var(--v2-txt2)}
  .foot code{font:11px var(--v2-mono); color:var(--v2-acc2)}
</style>
