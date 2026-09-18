<script lang="ts">
  /**
   * Onglet « Manquants » de Métadonnées — voir `lib/manquantsMetadonnees`.
   * Trois compteurs (pochettes, genres, années, sur le total d'albums) et deux
   * traitements, suivis jusqu'à leur fin ; les compteurs sont relus ensuite.
   */
  import { onDestroy, onMount } from 'svelte';
  import * as api from '../../lib/api';
  import type { CompletenessStats } from '../../lib/types';
  import { t } from '../../lib/i18n';
  import { formatNombre } from '../../lib/formats';
  import { avancementMusicBrainz, avancementPochettes, type Avancement } from '../../lib/manquantsMetadonnees';
  import { albumsAvecManque, genreParArtiste, genresConnus, grouperParGenre, propositionsGenre, type Manque } from '../../lib/manquesAlbums';
  import type { Album } from '../../lib/types';
  import AlbumArt from '../partages/AlbumArt.svelte';

  let stats = $state<CompletenessStats | null>(null);
  let erreur = $state<string | null>(null);
  let pochettes = $state<Avancement | null>(null);
  let mb = $state<Avancement | null>(null);
  let lancement = $state<'pochettes' | 'mb' | null>(null);
  let minuterie: ReturnType<typeof setInterval> | null = null;

  async function relireStats() {
    try { stats = await api.getCompletenessStats(); } catch (e: any) { erreur = e?.message ?? String(e); }
  }

  async function relireAvancement() {
    const [p, m] = await Promise.allSettled([api.getAlbumArtworkEnrichStatus(), api.getBatchEnrichStatus()]);
    const avantEnCours = !!(pochettes?.enCours || mb?.enCours);
    if (p.status === 'fulfilled') pochettes = avancementPochettes(p.value);
    if (m.status === 'fulfilled') mb = avancementMusicBrainz(m.value);
    const enCours = !!(pochettes?.enCours || mb?.enCours);
    if (avantEnCours && !enCours) void relireStats();
    if (enCours && !minuterie) minuterie = setInterval(() => void relireAvancement(), 2000);
    if (!enCours && minuterie) { clearInterval(minuterie); minuterie = null; }
  }

  async function lancer(quoi: 'pochettes' | 'mb') {
    if (lancement) return;
    lancement = quoi;
    erreur = null;
    try {
      if (quoi === 'pochettes') await api.startAlbumArtworkEnrich();
      else await api.startBatchEnrich();
    } catch (e: any) {
      // Le serveur garde ces passes (quota de l'offre gratuite) : son motif est
      // rendu tel quel, il dit quoi faire.
      erreur = e?.message ?? String(e);
    }
    lancement = null;
    await relireAvancement();
  }

  /*
    Les LISTES (#1197, Bertrand le 18/09) : « présenter les albums sans cover,
    sans genre, sans année, et proposer des outils de correction des manques ».

    Les trois compteurs ci-dessus existaient déjà, et les deux passes
    automatiques aussi. Ce qui manquait : QUELS albums. Sans la liste, rien ne
    se corrige quand la passe automatique n'a pas su.

    La bibliothèque entière est chargée une fois — 4 337 albums sur le serveur
    de Bertrand — et filtrée ici : le serveur n'offre pas de « albums sans
    genre » en requête, et les compteurs ne rendent que des nombres.
  */
  const LISTE_MAX = 300;
  let ouvert = $state<Manque | null>(null);
  let albums = $state<Album[]>([]);
  let chargement = $state(false);
  let charge = false;
  let choisis = $state<Set<number>>(new Set());
  let genreSaisi = $state('');
  let anneeSaisie = $state<number | null>(null);
  let application = $state(false);
  let bilan = $state<string | null>(null);

  async function chargerAlbums() {
    if (charge || chargement) return;
    chargement = true;
    const tous: Album[] = [];
    try {
      for (let offset = 0; ; offset += 2000) {
        const r = await api.getAlbumsPage(2000, offset);
        tous.push(...r.items);
        if (r.items.length === 0 || tous.length >= r.total) break;
      }
      albums = tous;
      charge = true;
      erreur = null;
    } catch (e: any) {
      erreur = e?.message ?? String(e);
    }
    chargement = false;
  }

  async function basculer(quoi: Manque) {
    bilan = null;
    choisis = new Set();
    propositions = new Map();
    if (ouvert === quoi) { ouvert = null; return; }
    ouvert = quoi;
    await chargerAlbums();
  }

  let listeComplete = $derived(ouvert ? albumsAvecManque(albums, ouvert) : []);
  let liste = $derived(listeComplete.slice(0, LISTE_MAX));
  let genresDispo = $derived(genresConnus(albums));

  function cocher(id: number) {
    const s = new Set(choisis);
    if (s.has(id)) s.delete(id); else s.add(id);
    choisis = s;
  }
  function cocherTout() {
    // Seulement ce qui est AFFICHÉ : cocher 1 200 albums qu'on ne voit pas
    // serait une action en aveugle.
    choisis = choisis.size === liste.length ? new Set() : new Set(liste.map((a) => a.id!).filter(Boolean));
  }

  /*
    « Proposer d'après l'artiste » (Bertrand, 18/09 : « proposer, je valide »).

    Mesuré sur sa bibliothèque : 138 des 1 188 albums sans genre ont un artiste
    qui n'en porte qu'un seul ailleurs. Ce n'est pas la majorité du problème,
    mais c'est gratuit, hors ligne, et ça n'invente rien de plus que « le même
    artiste, le même genre ». La passe MusicBrainz, elle, ne rend une étiquette
    de genre qu'une fois sur cinq, pour huit heures de réseau — mesuré.

    🔴 Rien n'est écrit par ce bouton : il REMPLIT la colonne de proposition et
    coche les lignes. L'écriture reste le second geste.
  */
  let propositions = $state<Map<number, string>>(new Map());

  function proposerDApresArtiste() {
    const table = genreParArtiste(albums);
    const p = propositionsGenre(liste, table);
    propositions = p;
    choisis = new Set(p.keys());
    bilan = p.size === 0 ? $t('v2.miss.noProposal' as any) : null;
  }

  /** Applique les propositions retenues : un appel par genre distinct. */
  async function appliquerPropositions() {
    const par = grouperParGenre(propositions, choisis);
    if (par.size === 0 || application) return;
    application = true;
    bilan = null;
    let poses = 0;
    try {
      for (const [genre, ids] of par) {
        const r = await api.batchUpdateAlbums(ids, { genre });
        poses += r.updated;
        albums = albums.map((a) => (a.id != null && ids.includes(a.id) ? { ...a, genre } : a));
      }
      bilan = libelle('v2.miss.applied', { count: poses });
      propositions = new Map();
      choisis = new Set();
      void relireStats();
      erreur = null;
    } catch (e: any) {
      erreur = e?.message ?? String(e);
    }
    application = false;
  }

  /** Écrit un champ sur les albums cochés, puis retire ceux qui sont réparés. */
  async function appliquer(champ: 'genre' | 'year') {
    const ids = [...choisis];
    if (!ids.length || application) return;
    const valeur = champ === 'genre' ? genreSaisi.trim() : anneeSaisie;
    if (!valeur) return;
    application = true;
    bilan = null;
    try {
      const r = await api.batchUpdateAlbums(ids, champ === 'genre' ? { genre: String(valeur) } : { year: Number(valeur) });
      albums = albums.map((a) =>
        a.id != null && ids.includes(a.id)
          ? champ === 'genre' ? { ...a, genre: String(valeur) } : { ...a, year: Number(valeur) }
          : a,
      );
      bilan = libelle('v2.miss.applied', { count: r.updated });
      choisis = new Set();
      genreSaisi = '';
      anneeSaisie = null;
      void relireStats();
      erreur = null;
    } catch (e: any) {
      erreur = e?.message ?? String(e);
    }
    application = false;
  }

  /** Une image déposée sur une ligne devient la pochette de cet album. */
  async function poserPochette(albumId: number, fichier: File) {
    bilan = null;
    try {
      const maj = await api.uploadAlbumArtwork(albumId, fichier);
      albums = albums.map((a) => (a.id === albumId ? { ...a, cover_path: maj?.cover_path ?? 'pose' } : a));
      bilan = $t('v2.miss.coverDone' as any);
      void relireStats();
      erreur = null;
    } catch (e: any) {
      erreur = e?.message ?? String(e);
    }
  }

  function deposer(e: DragEvent, albumId: number) {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f && f.type.startsWith('image/')) void poserPochette(albumId, f);
  }

  const libelle = (cle: string, vars: Record<string, number>) =>
    Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, $formatNombre(v)), $t(cle as any));

  onMount(() => { void relireStats(); void relireAvancement(); });
  onDestroy(() => { if (minuterie) clearInterval(minuterie); });
</script>

<div class="manquants">
  <p class="intro">{$t('v2.miss.intro' as any)}</p>
  {#if erreur}<div class="err">{erreur}</div>{/if}

  {#if stats}
    <div class="compteurs">
      {#each [['v2.miss.covers', stats.albums_without_cover, 'cover'], ['v2.miss.genres', stats.albums_without_genre, 'genre'], ['v2.miss.years', stats.albums_without_year, 'year']] as [cle, n, quoi] (cle)}
        <!-- Le compteur EST le bouton : le nombre et la liste qu'il ouvre
             disent la même chose, on ne les sépare pas. -->
        <button class="compteur" class:ouvert={ouvert === quoi} onclick={() => basculer(quoi as Manque)}>
          <span class="nom">{$t(cle as any)}</span>
          <span class="n">{$formatNombre(Number(n))}</span>
          <span class="sur">{$t('v2.miss.missing' as any)} · {libelle('v2.miss.of', { total: stats.total_albums })}</span>
          <span class="voir">{ouvert === quoi ? $t('v2.miss.hideList' as any) : $t('v2.miss.seeList' as any)}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if ouvert}
    <div class="liste-bloc">
      {#if chargement}
        <p class="etat">{$t('v2.tool.loading' as any)}</p>
      {:else if !listeComplete.length}
        <p class="etat">{$t('v2.miss.listEmpty' as any)}</p>
      {:else}
        <p class="source">{$t('v2.miss.onlyLocal' as any)}</p>

        <div class="outils">
          <button class="v2-btn" onclick={cocherTout}>
            {choisis.size === liste.length ? $t('v2.miss.selectNone' as any) : $t('v2.miss.selectAll' as any).replace('{count}', $formatNombre(liste.length))}
          </button>

          {#if ouvert === 'genre'}
            <input class="saisie" list="genres-connus" placeholder={$t('v2.miss.genrePlaceholder' as any)} bind:value={genreSaisi} />
            <datalist id="genres-connus">
              {#each genresDispo as g (g)}<option value={g}></option>{/each}
            </datalist>
            <button class="v2-btn primaire" disabled={application || !choisis.size || !genreSaisi.trim()} onclick={() => appliquer('genre')}>
              {$t('v2.miss.applyGenre' as any).replace('{count}', $formatNombre(choisis.size))}
            </button>
            <span class="sep">|</span>
            <button class="v2-btn" disabled={application} onclick={proposerDApresArtiste}>
              {$t('v2.miss.proposeFromArtist' as any)}
            </button>
            {#if propositions.size}
              <button class="v2-btn primaire" disabled={application || !choisis.size} onclick={appliquerPropositions}>
                {$t('v2.miss.applyProposals' as any).replace('{count}', $formatNombre(grouperParGenre(propositions, choisis).size ? [...grouperParGenre(propositions, choisis).values()].reduce((n, l) => n + l.length, 0) : 0))}
              </button>
            {/if}
          {:else if ouvert === 'year'}
            <input class="saisie etroite" type="number" min="1900" max="2100" placeholder={$t('v2.miss.yearPlaceholder' as any)} bind:value={anneeSaisie} />
            <button class="v2-btn primaire" disabled={application || !choisis.size || !anneeSaisie} onclick={() => appliquer('year')}>
              {$t('v2.miss.applyYear' as any).replace('{count}', $formatNombre(choisis.size))}
            </button>
          {:else}
            <!-- Pas d'outil en lot pour la pochette : une image vaut pour UN
                 album, et la passe automatique couvre déjà le reste. -->
            <span class="source">{$t('v2.miss.dropCover' as any)}</span>
          {/if}
        </div>

        {#if bilan}<p class="etat">{bilan}</p>{/if}

        <div class="lignes">
          {#each liste as a (a.id)}
            <label class="ligne" ondragover={(e) => e.preventDefault()} ondrop={(e) => a.id != null && deposer(e, a.id)}>
              {#if ouvert !== 'cover'}
                <input type="checkbox" checked={a.id != null && choisis.has(a.id)} onchange={() => a.id != null && cocher(a.id)} />
              {/if}
              <span class="vign"><AlbumArt coverPath={a.cover_path} albumId={a.id ?? 0} size={0} alt={a.title} fallbackInitials={a.title?.slice(0, 1)} /></span>
              <span class="txt">
                <span class="titre">{a.title}</span>
                <span class="meta">{a.artist_name ?? '—'} · {libelle('v2.miss.tracks', { count: a.track_count ?? 0 })}</span>
                {#if a.id != null && propositions.has(a.id)}
                  <!-- Ce qui SERAIT posé, dit avant de l'être. -->
                  <span class="propo">{$t('v2.miss.proposed' as any).replace('{genre}', propositions.get(a.id) ?? '')}</span>
                {/if}
              </span>
              {#if ouvert === 'cover'}
                <span class="depot">
                  <input type="file" accept="image/*" style="display:none"
                    onchange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f && a.id != null) void poserPochette(a.id, f); }} />
                  {$t('v2.miss.dropCover' as any)}
                </span>
              {/if}
            </label>
          {/each}
        </div>

        {#if listeComplete.length > liste.length}
          <p class="source">{libelle('v2.miss.more', { count: listeComplete.length - liste.length })}</p>
        {/if}
      {/if}
    </div>
  {/if}

  <div class="actions">
    <div class="action">
      <button class="v2-btn primaire" disabled={!!lancement || !!pochettes?.enCours || (stats != null && stats.albums_without_cover === 0)}
        onclick={() => lancer('pochettes')}>{$t('v2.miss.findCovers' as any)}</button>
      <p class="source">{$t('v2.miss.sourceCovers' as any)}</p>
      {#if stats && stats.albums_without_cover === 0}
        <p class="etat">{$t('v2.miss.nothing' as any)}</p>
      {:else if pochettes?.enCours}
        <p class="etat">{libelle('v2.miss.running', { done: pochettes.recherches ?? pochettes.trouves, total: pochettes.total })}</p>
      {:else if pochettes}
        <p class="etat">{libelle('v2.miss.doneCovers', { found: pochettes.trouves, total: pochettes.recherches ?? pochettes.total })}</p>
      {/if}
    </div>
    <div class="action">
      <button class="v2-btn primaire" disabled={!!lancement || !!mb?.enCours}
        onclick={() => lancer('mb')}>{$t('v2.miss.findGenresYears' as any)}</button>
      <p class="source">{$t('v2.miss.sourceMb' as any)}</p>
      {#if mb?.enCours}
        <p class="etat">{libelle('v2.miss.running', { done: mb.trouves, total: mb.total })}</p>
      {:else if mb}
        <p class="etat">{libelle('v2.miss.doneMb', { found: mb.trouves, total: mb.total })}</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .manquants { padding: 6px 0 30px; max-width: 900px; }
  .intro { margin: 0 0 16px; color: var(--v2-txt2); font-size: 14px; }
  .err { margin: 0 0 14px; padding: 9px 12px; border-radius: 10px; border: 1px solid var(--v2-danger-bd); color: var(--v2-danger); font-size: 13px; }
  .compteurs { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 0 0 22px; }
  .compteur { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 14px 16px; border-radius: var(--v2-r-card); background: var(--v2-surface2); border: 1px solid var(--v2-line2); cursor: pointer; text-align: left; font: inherit; color: inherit; }
  .compteur:hover { border-color: var(--v2-acc2); }
  .compteur.ouvert { border-color: var(--v2-acc2); }
  .voir { margin-top: 6px; font: 10px var(--v2-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--v2-acc-tint); }
  .liste-bloc { margin: 0 0 24px; }
  .outils { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 10px 0 12px; }
  .saisie { height: 34px; padding: 0 12px; border-radius: var(--v2-r-pill); border: 1px solid var(--v2-line2); background: transparent; color: var(--v2-txt); font: 12.5px var(--v2-sans); }
  .saisie.etroite { width: 110px; }
  .saisie:focus { outline: none; border-color: var(--v2-acc2); }
  .lignes { display: flex; flex-direction: column; gap: 6px; }
  .ligne { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-radius: 10px; background: var(--v2-surface2); border: 1px solid var(--v2-line2); cursor: pointer; }
  .ligne input[type=checkbox] { flex: 0 0 auto; accent-color: var(--v2-acc2); }
  .vign { flex: 0 0 auto; width: 40px; height: 40px; border-radius: 6px; overflow: hidden; }
  .txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
  .titre { font: 600 13px var(--v2-sans); color: var(--v2-txt); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { font: 11.5px var(--v2-mono); color: var(--v2-txt3); }
  .propo { font: 11.5px var(--v2-mono); color: var(--v2-acc-tint); }
  .sep { color: var(--v2-txt3); }
  .depot { flex: 0 0 auto; font: 11px var(--v2-mono); color: var(--v2-acc-tint); border: 1px dashed var(--v2-acc2); border-radius: var(--v2-r-pill); padding: 4px 10px; }
  .nom { font: 600 12px var(--v2-sans); color: var(--v2-txt2); text-transform: uppercase; letter-spacing: .05em; }
  .n { font: 700 28px var(--v2-sans); color: var(--v2-txt); }
  .sur { font: 11px var(--v2-mono); color: var(--v2-txt3); }
  .actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px; }
  .action { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
  .source { margin: 0; font-size: 12.5px; color: var(--v2-txt3); }
  .etat { margin: 0; font: 12px var(--v2-mono); color: var(--v2-txt2); }
</style>
