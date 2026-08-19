<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n';
  import { notifications } from '../lib/stores/notifications';
  import * as api from '../lib/api';
  import { rapprocher, type Rapprochement } from '../lib/bandcampMatch';
  import { bandcampCharge, bandcampAttendRedemarrage } from '../lib/stores/bandcamp';
  import { currentZone, playAndSync } from '../lib/stores/zones';

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
  let artisteOuvert = $state<api.BandcampDiscographie | null>(null);
  let artisteEnCours = $state(false);
  let artisteNom = $state('');
  /** Piste dont l'envoi vers la zone est en cours, par URL de flux. */
  let envoiEnCours = $state<string | null>(null);

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
    if (!$bandcampCharge) return;
    charger_genres();
    explorer();
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
    artisteOuvert = null;
    try {
      albumOuvert = await api.bandcampAlbum(url);
    } catch (e) {
      exploreErreur = (e as Error)?.message || $t('bandcamp.albumFailed' as any);
    } finally {
      albumEnCours = false;
    }
  }

  /** Ouvrir la discographie d'un artiste.
   *
   *  L'écran n'offrait qu'un lien « Ouvrir sur Bandcamp » : cliquer un artiste
   *  faisait donc sortir de Tune. Le serveur sait lire sa page `/music`
   *  depuis #1768 ; on reste chez nous. */
  async function ouvrir_artiste(url: string, nom: string) {
    if (!url) return;
    artisteEnCours = true;
    exploreErreur = '';
    albumOuvert = null;
    artisteNom = nom;
    try {
      artisteOuvert = await api.bandcampArtist(url);
    } catch (e) {
      exploreErreur = (e as Error)?.message || $t('bandcamp.artistFailed' as any);
      artisteOuvert = null;
    } finally {
      artisteEnCours = false;
    }
  }

  function fermer_album() {
    albumOuvert = null;
  }

  function fermer_artiste() {
    artisteOuvert = null;
    artisteNom = '';
  }

  /** La piste, décrite comme une piste DISTANTE — la forme que le serveur
   *  attend depuis toujours pour tout ce qui n'a pas de ligne en bibliothèque
   *  (`routes/playback.rs::PlayRequest` et `QueueAddRequest`, champs
   *  identiques). Bandcamp n'invente donc aucune structure : il remplit la
   *  même.
   *
   *  Le FORMAT n'est délibérément pas envoyé d'ici. Le serveur le sait — il
   *  n'existe qu'un encodage possible — et l'affirme lui-même. Le laisser
   *  déclarer par le client donnerait deux vérités : celle du premier clic, et
   *  celle de l'avance de file, où aucun client ne repasse. */
  function piste_distante(p: api.BandcampPiste) {
    return {
      source: 'bandcamp' as const,
      source_id: p.stream_url,
      title: p.title,
      artist_name: p.artist || albumOuvert?.artist || '',
      album_title: albumOuvert?.title ?? '',
      cover_path: albumOuvert?.pochette ?? null,
      duration_ms: Math.round((p.duration_s || 0) * 1000),
    };
  }

  /** Envoyer une piste Bandcamp vers la ZONE sélectionnée.
   *
   *  L'écran faisait `new Audio(url)` : l'onglet jouait, la zone était
   *  ignorée, et l'utilisateur — qui avait bien une zone active — concluait
   *  qu'elle était cassée. Le raisonnement d'origine (« 128 kbit/s n'a rien à
   *  faire sur un DAC de salon ») était défendable ; le résultat, non : un son
   *  qui sort ailleurs SANS un mot. Bertrand a tranché en connaissance de
   *  cause.
   *
   *  La contrepartie est tenue partout : la qualité est écrite sur le bouton,
   *  répétée au-dessus de la liste, redite dans la notification, et le lecteur
   *  affiche « MP3 128 kbit/s ». On passe par `playAndSync`, comme n'importe
   *  quelle autre lecture — c'est lui qui remonte `zone.error` à l'écran, et
   *  c'est par là qu'une zone qui refuse le format se fait entendre au lieu
   *  d'échouer en silence. */
  async function ecouter(p: api.BandcampPiste) {
    const zone = $currentZone;
    if (!zone?.id) {
      exploreErreur = $t('bandcamp.noZone' as any);
      return;
    }
    envoiEnCours = p.stream_url;
    exploreErreur = '';
    try {
      const apres = await playAndSync(zone.id, piste_distante(p));
      // `output_sent === false` : le serveur a bien résolu le flux mais la
      // sortie ne l'a pas pris. C'est le cas que #1768 devait couvrir — une
      // zone peut refuser ce format — et le seul endroit où l'utilisateur
      // peut l'apprendre. `playAndSync` a déjà affiché `zone.error` s'il y en
      // avait un ; ici on nomme la zone, pour qu'il sache laquelle a refusé.
      if (apres.output_sent === false && !apres.error) {
        notifications.error(
          `${zone.name} — ${$t('bandcamp.zoneRefused' as any)}`,
          8000,
        );
        return;
      }
      notifications.success(
        `${p.title} → ${zone.name} · ${$t('bandcamp.qualityBadge' as any)}`,
      );
    } catch (e) {
      exploreErreur = (e as Error)?.message || $t('bandcamp.playFailed' as any);
    } finally {
      envoiEnCours = null;
    }
  }

  /** Ranger la piste dans la file d'attente de la zone.
   *
   *  Même route et même corps que pour une piste Tidal ou Qobuz
   *  (`QueueAddRequest`). Une piste Bandcamp n'est pas un cas à part : elle
   *  entre dans la file par la porte commune, et l'avance de file la
   *  re-résout par le même chemin (`resolve_queue_item_url`). */
  async function mettre_en_file(p: api.BandcampPiste) {
    const zone = $currentZone;
    if (!zone?.id) {
      exploreErreur = $t('bandcamp.noZone' as any);
      return;
    }
    try {
      await api.addToQueue(zone.id, piste_distante(p));
      notifications.success(
        `${p.title} — ${$t('queue.addToQueue' as any).toLowerCase()} · ${$t('bandcamp.qualityBadge' as any)}`,
      );
    } catch (e) {
      exploreErreur = (e as Error)?.message || $t('bandcamp.playFailed' as any);
    }
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

      <!-- Les panneaux ouverts se placent ICI, au-dessus des résultats.
           Rendus en dessous, ils tombaient sous une grille de 35 vignettes :
           cliquer un album ne produisait rien de visible et passait pour un
           bouton mort (#1768). -->
      {#if albumEnCours || artisteEnCours}
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
               l'utilisateur la voie AVANT de lancer la lecture — et non après
               l'avoir jugé sur 128 kbit/s sans le savoir. -->
          <p class="bc-qualite">
            <span class="bc-debit">{$t('bandcamp.qualityBadge' as any)}</span>
            {$t('bandcamp.previewQuality' as any)}
          </p>
          <!-- La zone de destination est nommée ICI, au-dessus des boutons :
               c'est la question que l'utilisateur se posait — « où va sortir
               le son ? » — et à laquelle l'écran ne répondait pas. -->
          {#if $currentZone?.name}
            <p class="bc-vers-zone">
              {$t('bandcamp.playTo' as any)} <strong>{$currentZone.name}</strong>
            </p>
          {:else}
            <p class="bc-erreur">{$t('bandcamp.noZone' as any)}</p>
          {/if}
          <ol class="bc-pistes">
            {#each albumOuvert.tracks as p (p.stream_url)}
              <li>
                <button
                  class="bc-ecouter"
                  disabled={envoiEnCours === p.stream_url}
                  title="{$t('bandcamp.play' as any)} · {$t('bandcamp.qualityBadge' as any)}"
                  aria-label="{$t('bandcamp.play' as any)} — {p.title} · {$t('bandcamp.qualityBadge' as any)}"
                  onclick={() => ecouter(p)}
                >
                  {envoiEnCours === p.stream_url ? '…' : '▶'}
                </button>
                <button
                  class="bc-file"
                  title="{$t('queue.addToQueue' as any)} · {$t('bandcamp.qualityBadge' as any)}"
                  aria-label="{$t('queue.addToQueue' as any)} — {p.title}"
                  onclick={() => mettre_en_file(p)}
                >
                  ＋
                </button>
                <span class="bc-num">{p.num}</span>
                <span class="bc-p-titre">{p.title}</span>
                <!-- Le débit est écrit sur CHAQUE ligne, pas seulement en tête
                     de liste : c'est la ligne qu'on clique, c'est là que
                     l'information doit être. -->
                <span class="bc-debit-piste">{$t('bandcamp.qualityBadge' as any)}</span>
                <span class="bc-duree">{duree(p.duration_s)}</span>
              </li>
            {/each}
          </ol>
          <a href={albumOuvert.url} target="_blank" rel="noopener noreferrer">
            {$t('bandcamp.buyOnBandcamp' as any)}
          </a>
        </section>
      {/if}

      {#if artisteOuvert}
        <section class="bc-album">
          <header>
            <div>
              <h3>{artisteNom}</h3>
              <p class="bc-sous">
                {artisteOuvert.count}
                {$t('bandcamp.albums' as any)}
              </p>
            </div>
            <button class="bc-fermer" onclick={fermer_artiste}>{$t('common.close' as any)}</button>
          </header>
          {#if artisteOuvert.albums.length === 0}
            <p class="bc-vide">{$t('bandcamp.noResults' as any)}</p>
          {:else}
            <div class="bc-grille">
              {#each artisteOuvert.albums as d (d.url)}
                <button class="bc-vignette" onclick={() => ouvrir_album(d.url)}>
                  {#if d.pochette}<img src={d.pochette} alt="" loading="lazy" />{/if}
                  <span class="bc-v-titre">{d.titre}</span>
                </button>
              {/each}
            </div>
          {/if}
          <a href={artisteOuvert.url} target="_blank" rel="noopener noreferrer">
            {$t('bandcamp.openOnBandcamp' as any)}
          </a>
        </section>
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
        {#if recherche.pistes.length > 0}
          <!-- Les pistes étaient calculées et JAMAIS affichées : le serveur les
               renvoyait, l'écran les jetait. Une piste isolée s'ouvre comme un
               album — `/album?url=` résout les deux. -->
          <h3>{$t('bandcamp.tracks' as any)}</h3>
          <ul class="bc-liste">
            {#each recherche.pistes as p (p.url)}
              <li>
                <button class="bc-lien" onclick={() => ouvrir_album(p.url)}>
                  <span class="bc-artiste">{p.titre}</span>
                  <span class="bc-titre">
                    {p.artiste}{#if p.album} — {p.album}{/if}
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
        {#if recherche.artistes.length > 0}
          <h3>{$t('bandcamp.artists' as any)}</h3>
          <ul class="bc-liste">
            {#each recherche.artistes as a (a.url)}
              <li>
                <!-- Cliquer un artiste ouvre sa discographie DANS Tune. Avant,
                     le seul geste possible était un lien externe : chercher un
                     artiste faisait sortir de l'application. -->
                <button class="bc-lien" onclick={() => ouvrir_artiste(a.url, a.titre)}>
                  <span class="bc-artiste">{a.titre}</span>
                  {#if a.lieu}<span class="bc-local">{a.lieu}</span>{/if}
                </button>
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
  .bc-ecouter, .bc-file { background: none; border: 0; cursor: pointer; font-size: 1rem; }
  .bc-ecouter[disabled] { opacity: 0.5; cursor: default; }
  .bc-file { color: var(--text-muted, #888); }
  .bc-file:hover { color: var(--accent, #2b7); }
  .bc-vers-zone { color: var(--text-muted, #aaa); font-size: 0.8125rem; margin: 0 0 0.75rem; }
  /* Le débit ne se murmure pas : la puce le pose en tête de l'avertissement,
     et se relit sur chaque ligne de piste. */
  .bc-debit {
    display: inline-block; margin-right: 0.4rem; padding: 0.05rem 0.45rem;
    border-radius: 999px; background: var(--border, #2a2a2a);
    color: var(--text, #ddd); font-size: 0.75rem; font-weight: 600;
    white-space: nowrap;
  }
  .bc-debit-piste {
    color: var(--text-muted, #888); font-size: 0.75rem; white-space: nowrap;
  }
  .bc-num { color: var(--text-muted, #888); width: 1.5rem; font-variant-numeric: tabular-nums; }
  .bc-p-titre { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bc-duree { color: var(--text-muted, #888); font-variant-numeric: tabular-nums; }

  .bc-dormant {
    background: var(--surface, #1b1b1b); padding: 1.25rem; border-radius: 8px;
    max-width: 42rem;
  }
  .bc-dormant h3 { margin: 0 0 0.5rem; }
  .bc-dormant p { margin: 0 0 0.5rem; }

  /* Une entree de liste cliquable : meme presentation que l'ancien texte
     inerte, mais c'est un bouton — un artiste s'ouvre, il ne se lit pas. */
  .bc-lien {
    display: flex; flex-direction: column; align-items: flex-start; gap: 0.1rem;
    background: none; border: 0; padding: 0; cursor: pointer; text-align: left;
    min-width: 0; color: inherit; font: inherit;
  }
  .bc-lien:hover .bc-artiste { text-decoration: underline; }
</style>
