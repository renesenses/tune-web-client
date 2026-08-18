<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n';
  import { notifications } from '../lib/stores/notifications';
  import * as api from '../lib/api';
  import { rapprocher, type Rapprochement } from '../lib/bandcampMatch';
  import { bandcampCharge, bandcampAttendRedemarrage } from '../lib/stores/bandcamp';

  // L'écran ne présente PAS Bandcamp : il répond à « qu'est-ce que j'ai acheté
  // et pas encore importé ? ». Le rapprochement se fait ici, dans le
  // navigateur, en croisant la collection avec la bibliothèque chargée une
  // seule fois — pas une recherche serveur par article (#1768).
  let pseudo = $state('');
  let liaisonEnCours = $state(false);
  let chargement = $state(false);
  let erreur = $state('');
  let resultats = $state<Rapprochement<api.BandcampItem>[]>([]);
  let analyse = $state(false);
  let onglet = $state<'manquante' | 'ambigue' | 'presente'>('manquante');

  // « Explorer » d'abord, « Ma collection » ensuite. L'ordre n'est pas neutre :
  // l'écran ne s'ouvrait que sur la liaison d'un compte, si bien qu'un
  // utilisateur sans achat — ou dont la collection publique est vide — se
  // retrouvait devant un écran qui ne montrait rien de Bandcamp. Explorer ne
  // demande ni pseudo ni compte.
  let mode = $state<'explorer' | 'collection'>('explorer');

  let genres = $state<string[]>([]);
  let genre = $state('jazz');
  let tri = $state<'top' | 'new' | 'rec'>('top');
  let decouvertes = $state<api.BandcampResultat[]>([]);
  let exploreEnCours = $state(false);
  let exploreErreur = $state('');

  let requete = $state('');
  let recherche = $state<api.BandcampRecherche | null>(null);

  let albumOuvert = $state<api.BandcampAlbumDetail | null>(null);
  let albumEnCours = $state(false);
  /** Extrait en cours d'écoute, par URL de flux — un seul à la fois. */
  let extraitJoue = $state<string | null>(null);
  let lecteur: HTMLAudioElement | null = null;

  let manquants = $derived(resultats.filter((r) => r.verdict === 'manquante'));
  let ambigus = $derived(resultats.filter((r) => r.verdict === 'ambigue'));
  let presents = $derived(resultats.filter((r) => r.verdict === 'presente'));
  let affiches = $derived(
    onglet === 'manquante' ? manquants : onglet === 'ambigue' ? ambigus : presents,
  );

  onMount(() => {
    // Ne RIEN demander tant que le routeur du plugin n'est pas monté. Sans ce
    // garde, l'écran tirait sur `/api/v1/ext/bandcamp/…` et récoltait le 404
    // nu d'axum, que l'utilisateur voyait tel quel — « 404 Not Found » en
    // rouge, sans rien lui dire du geste qui manquait (#1768).
    if (!$bandcampCharge) return () => arreter_extrait();
    charger_genres();
    explorer();
    // Couper le son en quittant l'écran : un extrait qui continue après un
    // changement de vue est le genre de détail qui rend une application
    // pénible.
    return () => arreter_extrait();
  });

  async function charger_genres() {
    try {
      const r = await api.bandcampTags();
      genres = r.tags ?? [];
    } catch {
      // Les genres sont un confort de navigation : leur absence ne doit pas
      // empêcher d'explorer le genre par défaut ni de chercher.
    }
  }

  async function explorer() {
    exploreEnCours = true;
    exploreErreur = '';
    recherche = null;
    try {
      const r = await api.bandcampDiscover(genre, tri, 0);
      decouvertes = r.items ?? [];
    } catch (e) {
      exploreErreur = (e as Error)?.message || $t('bandcamp.discoverFailed' as any);
      decouvertes = [];
    } finally {
      exploreEnCours = false;
    }
  }

  async function chercher() {
    const q = requete.trim();
    if (!q) {
      recherche = null;
      return explorer();
    }
    exploreEnCours = true;
    exploreErreur = '';
    try {
      recherche = await api.bandcampSearch(q);
    } catch (e) {
      exploreErreur = (e as Error)?.message || $t('bandcamp.searchFailed' as any);
      recherche = null;
    } finally {
      exploreEnCours = false;
    }
  }

  function choisir_genre(g: string) {
    genre = g;
    requete = '';
    explorer();
  }

  async function ouvrir_album(url: string) {
    albumEnCours = true;
    exploreErreur = '';
    try {
      albumOuvert = await api.bandcampAlbum(url);
    } catch (e) {
      exploreErreur = (e as Error)?.message || $t('bandcamp.albumFailed' as any);
    } finally {
      albumEnCours = false;
    }
  }

  function fermer_album() {
    arreter_extrait();
    albumOuvert = null;
  }

  function arreter_extrait() {
    lecteur?.pause();
    lecteur = null;
    extraitJoue = null;
  }

  /** Écouter un extrait dans le navigateur.
   *
   *  Ce n'est PAS une lecture vers une zone : c'est du mp3-128 rendu par
   *  l'onglet, pour se faire une idée avant d'acheter. Envoyer 128 kbit/s vers
   *  un DAC de salon serait exactement ce que #1768 s'interdit d'encourager. */
  function ecouter(url: string) {
    if (extraitJoue === url) return arreter_extrait();
    arreter_extrait();
    lecteur = new Audio(url);
    lecteur.play().catch(() => {
      exploreErreur = $t('bandcamp.previewFailed' as any);
      arreter_extrait();
    });
    lecteur.onended = () => arreter_extrait();
    extraitJoue = url;
  }

  function duree(s: number): string {
    if (!Number.isFinite(s) || s <= 0) return '';
    const m = Math.floor(s / 60);
    const r = Math.round(s % 60);
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  async function lier() {
    const nom = pseudo.trim();
    if (!nom) return;
    liaisonEnCours = true;
    erreur = '';
    try {
      await api.bandcampLink(nom);
      await analyser();
    } catch (e) {
      // Un échec silencieux ici, c'est un écran qui reste vide sans dire
      // pourquoi — le défaut qu'on a passé la journée à corriger ailleurs.
      erreur = (e as Error)?.message || $t('bandcamp.linkFailed' as any);
    } finally {
      liaisonEnCours = false;
    }
  }

  async function analyser() {
    chargement = true;
    erreur = '';
    try {
      // Les deux en parallèle : la bibliothèque est longue à charger, la
      // collection dépend du réseau. Les sérialiser doublerait l'attente.
      const [collection, albums] = await Promise.all([
        api.bandcampAllCollection(),
        api.getAllAlbums(),
      ]);
      // Seuls les albums : une piste isolée achetée sur Bandcamp n'a pas
      // vocation à être cherchée parmi les albums de la bibliothèque.
      const albumsSeuls = collection.filter((c) => c.type === 'album');
      resultats = rapprocher(albumsSeuls, albums as any);
      analyse = true;
      onglet = 'manquante';
    } catch (e) {
      erreur = (e as Error)?.message || $t('bandcamp.collectionFailed' as any);
    } finally {
      chargement = false;
    }
  }
</script>

<div class="bc">
  <header class="bc-tete">
    <h2>{$t('bandcamp.title' as any)}</h2>
    <p class="bc-sous">{$t('bandcamp.subtitle' as any)}</p>
  </header>

  {#if !$bandcampCharge}
    <!-- Le plugin est dans le binaire mais son routeur n'est pas monté. On
         explique le geste exact plutôt que de laisser l'écran échouer : c'est
         la promesse que le commentaire du store faisait déjà, et que la vue
         ne tenait pas. -->
    <section class="bc-dormant">
      <h3>{$t('bandcamp.dormantTitle' as any)}</h3>
      {#if $bandcampAttendRedemarrage}
        <p>{$t('bandcamp.dormantRestart' as any)}</p>
      {:else}
        <p>{$t('bandcamp.dormantInstall' as any)}</p>
      {/if}
      <p class="bc-note">{$t('bandcamp.dormantWhy' as any)}</p>
    </section>
  {:else}
  <nav class="bc-modes">
    <button class:actif={mode === 'explorer'} onclick={() => (mode = 'explorer')}>
      {$t('bandcamp.explore' as any)}
    </button>
    <button class:actif={mode === 'collection'} onclick={() => (mode = 'collection')}>
      {$t('bandcamp.myCollection' as any)}
    </button>
  </nav>

  {#if mode === 'explorer'}
    <section class="bc-explorer">
      <div class="bc-champ">
        <input
          type="search"
          bind:value={requete}
          placeholder={$t('bandcamp.searchPlaceholder' as any)}
          onkeydown={(e) => e.key === 'Enter' && chercher()}
        />
        <button onclick={chercher}>{$t('bandcamp.search' as any)}</button>
      </div>

      {#if !recherche}
        <div class="bc-genres">
          {#each genres as g (g)}
            <button class:actif={g === genre} onclick={() => choisir_genre(g)}>{g}</button>
          {/each}
        </div>
        <div class="bc-tris">
          {#each ['top', 'new', 'rec'] as s (s)}
            <button
              class:actif={s === tri}
              onclick={() => {
                tri = s as typeof tri;
                explorer();
              }}
            >
              {$t(`bandcamp.sort.${s}` as any)}
            </button>
          {/each}
        </div>
      {/if}

      {#if exploreErreur}
        <p class="bc-erreur">{exploreErreur}</p>
      {/if}

      {#if exploreEnCours}
        <p class="bc-attente">{$t('bandcamp.loading' as any)}</p>
      {:else if recherche}
        {#if recherche.albums.length === 0 && recherche.artistes.length === 0 && recherche.pistes.length === 0}
          <p class="bc-vide">{$t('bandcamp.noResults' as any)}</p>
        {/if}
        {#if recherche.albums.length > 0}
          <h3>{$t('bandcamp.albums' as any)}</h3>
          <div class="bc-grille">
            {#each recherche.albums as a (a.url)}
              <button class="bc-vignette" onclick={() => ouvrir_album(a.url)}>
                {#if a.pochette}<img src={a.pochette} alt="" loading="lazy" />{/if}
                <span class="bc-v-titre">{a.titre}</span>
                <span class="bc-v-artiste">{a.artiste}</span>
              </button>
            {/each}
          </div>
        {/if}
        {#if recherche.artistes.length > 0}
          <h3>{$t('bandcamp.artists' as any)}</h3>
          <ul class="bc-liste">
            {#each recherche.artistes as a (a.url)}
              <li>
                <div class="bc-item">
                  <span class="bc-artiste">{a.titre}</span>
                  {#if a.lieu}<span class="bc-local">{a.lieu}</span>{/if}
                </div>
                <a href={a.url} target="_blank" rel="noopener noreferrer">
                  {$t('bandcamp.openOnBandcamp' as any)}
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      {:else}
        <div class="bc-grille">
          {#each decouvertes as a (a.url)}
            <button class="bc-vignette" onclick={() => ouvrir_album(a.url)}>
              {#if a.pochette}<img src={a.pochette} alt="" loading="lazy" />{/if}
              <span class="bc-v-titre">{a.titre}</span>
              <span class="bc-v-artiste">{a.artiste}</span>
            </button>
          {/each}
        </div>
        {#if decouvertes.length === 0}
          <p class="bc-vide">{$t('bandcamp.noResults' as any)}</p>
        {/if}
      {/if}
    </section>

    {#if albumEnCours}
      <p class="bc-attente">{$t('bandcamp.loading' as any)}</p>
    {/if}

    {#if albumOuvert}
      <section class="bc-album">
        <header>
          <div>
            <h3>{albumOuvert.title}</h3>
            <p class="bc-sous">{albumOuvert.artist}</p>
          </div>
          <button class="bc-fermer" onclick={fermer_album}>{$t('common.close' as any)}</button>
        </header>
        <!-- La qualité est répétée ici, sur l'écran même où l'on écoute : le
             plugin l'annonce dans chaque réponse, encore faut-il que
             l'utilisateur la voie avant de juger un disque. -->
        <p class="bc-qualite">{$t('bandcamp.previewQuality' as any)}</p>
        <ol class="bc-pistes">
          {#each albumOuvert.tracks as p (p.stream_url)}
            <li>
              <button class="bc-ecouter" onclick={() => ecouter(p.stream_url)}>
                {extraitJoue === p.stream_url ? '⏸' : '▶'}
              </button>
              <span class="bc-num">{p.num}</span>
              <span class="bc-p-titre">{p.title}</span>
              <span class="bc-duree">{duree(p.duration_s)}</span>
            </li>
          {/each}
        </ol>
        <a href={albumOuvert.url} target="_blank" rel="noopener noreferrer">
          {$t('bandcamp.buyOnBandcamp' as any)}
        </a>
      </section>
    {/if}
  {/if}

  {#if mode === 'collection' && !analyse}
    <section class="bc-lier">
      <p>{$t('bandcamp.linkExplain' as any)}</p>
      <div class="bc-champ">
        <input
          type="text"
          bind:value={pseudo}
          placeholder={$t('bandcamp.usernamePlaceholder' as any)}
          onkeydown={(e) => e.key === 'Enter' && lier()}
        />
        <button onclick={lier} disabled={liaisonEnCours || !pseudo.trim()}>
          {liaisonEnCours ? $t('bandcamp.linking' as any) : $t('bandcamp.link' as any)}
        </button>
      </div>
      <p class="bc-note">{$t('bandcamp.noPassword' as any)}</p>
    </section>
  {/if}

  {#if mode === 'collection' && erreur}
    <p class="bc-erreur">{erreur}</p>
  {/if}

  {#if mode === 'collection' && chargement}
    <p class="bc-attente">{$t('bandcamp.analysing' as any)}</p>
  {/if}

  {#if mode === 'collection' && analyse && !chargement && resultats.length === 0}
    <!-- Une collection vide est une réponse, pas une panne. Le dire, plutôt
         que d'afficher trois onglets à zéro et laisser croire à un bug. -->
    <p class="bc-vide">{$t('bandcamp.collectionEmpty' as any)}</p>
    <button onclick={() => (mode = 'explorer')}>{$t('bandcamp.explore' as any)}</button>
  {/if}

  {#if mode === 'collection' && analyse && !chargement && resultats.length > 0}
    <nav class="bc-onglets">
      <button class:actif={onglet === 'manquante'} onclick={() => (onglet = 'manquante')}>
        {$t('bandcamp.missing' as any)} ({manquants.length})
      </button>
      <button class:actif={onglet === 'ambigue'} onclick={() => (onglet = 'ambigue')}>
        {$t('bandcamp.uncertain' as any)} ({ambigus.length})
      </button>
      <button class:actif={onglet === 'presente'} onclick={() => (onglet = 'presente')}>
        {$t('bandcamp.inLibrary' as any)} ({presents.length})
      </button>
      <button class="bc-refaire" onclick={analyser}>{$t('bandcamp.refresh' as any)}</button>
    </nav>

    {#if onglet === 'ambigue' && ambigus.length > 0}
      <p class="bc-note">{$t('bandcamp.uncertainExplain' as any)}</p>
    {/if}

    {#if affiches.length === 0}
      <p class="bc-vide">{$t('bandcamp.emptyGroup' as any)}</p>
    {:else}
      <ul class="bc-liste">
        {#each affiches as r (r.article.url)}
          <li>
            <div class="bc-item">
              <span class="bc-artiste">{r.article.artist}</span>
              <span class="bc-titre">{r.article.title}</span>
              {#if r.correspondance}
                <span class="bc-local">{$t('bandcamp.localMatch' as any)} {r.correspondance}</span>
              {/if}
            </div>
            <a href={r.article.url} target="_blank" rel="noopener noreferrer">
              {$t('bandcamp.openOnBandcamp' as any)}
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
  {/if}
</div>

<style>
  .bc { padding: 1rem; max-width: 60rem; margin: 0 auto; }
  .bc-tete h2 { margin: 0 0 0.25rem; }
  .bc-sous { color: var(--text-muted, #888); margin: 0 0 1.5rem; }
  .bc-lier { background: var(--surface, #1b1b1b); padding: 1rem; border-radius: 8px; }
  .bc-champ { display: flex; gap: 0.5rem; margin: 0.75rem 0 0.5rem; }
  .bc-champ input { flex: 1; padding: 0.5rem 0.75rem; border-radius: 6px; }
  .bc-note { color: var(--text-muted, #888); font-size: 0.875rem; margin: 0.5rem 0; }
  .bc-erreur { color: var(--danger, #e05252); }
  .bc-attente { color: var(--text-muted, #888); }
  .bc-onglets { display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 1rem 0; }
  .bc-onglets button { padding: 0.4rem 0.9rem; border-radius: 999px; }
  .bc-onglets button.actif { background: var(--accent, #2b7); color: #fff; }
  .bc-refaire { margin-left: auto; }
  .bc-liste { list-style: none; padding: 0; margin: 0; }
  .bc-liste li {
    display: flex; align-items: center; justify-content: space-between; gap: 1rem;
    padding: 0.6rem 0; border-bottom: 1px solid var(--border, #2a2a2a);
  }
  .bc-item { display: flex; flex-direction: column; min-width: 0; }
  .bc-artiste { font-weight: 600; }
  .bc-titre { color: var(--text-muted, #aaa); }
  .bc-local { font-size: 0.8125rem; color: var(--text-muted, #888); }
  .bc-vide { color: var(--text-muted, #888); }

  .bc-modes { display: flex; gap: 0.5rem; margin: 0 0 1rem; }
  .bc-modes button { padding: 0.4rem 1rem; border-radius: 999px; }
  .bc-modes button.actif { background: var(--accent, #2b7); color: #fff; }

  .bc-genres, .bc-tris { display: flex; gap: 0.4rem; flex-wrap: wrap; margin: 0.75rem 0; }
  .bc-genres button, .bc-tris button {
    padding: 0.25rem 0.7rem; border-radius: 999px; font-size: 0.8125rem;
    background: var(--surface, #1b1b1b); color: var(--text-muted, #aaa);
  }
  .bc-genres button.actif, .bc-tris button.actif { background: var(--accent, #2b7); color: #fff; }

  /* Grille de pochettes : c'est ce qu'on regarde en premier chez Bandcamp,
     et l'écran doit lui laisser la place. `auto-fill` pour que la même vue
     tienne sur un portable et sur un écran de salon. */
  .bc-grille {
    display: grid; gap: 1rem; margin: 1rem 0;
    grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  }
  .bc-vignette {
    display: flex; flex-direction: column; gap: 0.25rem; text-align: left;
    background: none; padding: 0; border: 0; cursor: pointer; min-width: 0;
  }
  .bc-vignette img {
    width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 6px;
    background: var(--surface, #1b1b1b);
  }
  .bc-v-titre { font-weight: 600; font-size: 0.875rem; }
  .bc-v-titre, .bc-v-artiste { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bc-v-artiste { color: var(--text-muted, #888); font-size: 0.8125rem; }

  .bc-album { background: var(--surface, #1b1b1b); padding: 1rem; border-radius: 8px; margin: 1rem 0; }
  .bc-album header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
  .bc-album h3 { margin: 0; }
  .bc-qualite { color: var(--text-muted, #888); font-size: 0.8125rem; margin: 0.5rem 0 1rem; }
  .bc-pistes { list-style: none; padding: 0; margin: 0 0 1rem; }
  .bc-pistes li {
    display: flex; align-items: center; gap: 0.75rem; padding: 0.35rem 0;
    border-bottom: 1px solid var(--border, #2a2a2a);
  }
  .bc-ecouter { background: none; border: 0; cursor: pointer; font-size: 1rem; }
  .bc-num { color: var(--text-muted, #888); width: 1.5rem; font-variant-numeric: tabular-nums; }
  .bc-p-titre { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bc-duree { color: var(--text-muted, #888); font-variant-numeric: tabular-nums; }

  .bc-dormant {
    background: var(--surface, #1b1b1b); padding: 1.25rem; border-radius: 8px;
    max-width: 42rem;
  }
  .bc-dormant h3 { margin: 0 0 0.5rem; }
  .bc-dormant p { margin: 0 0 0.5rem; }
</style>
