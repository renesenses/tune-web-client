<script lang="ts">
  /**
   * tune-server-rust#6001 — l'arbre des genres proposé par MusicBrainz et
   * Wikidata (CC0), monté sous l'arbre de l'auditeur (« Arbre des genres »).
   *
   * Lecture seule : il ne modifie ni l'arbre réglé à la main, ni les balises.
   * Chargé à la DEMANDE (un clic) et pas à l'ouverture de l'écran : la
   * première lecture de la liste MusicBrainz est une vingtaine de pages au
   * rythme du limiteur partagé, l'écran ne la déclenche pas à chaque visite.
   *
   * `202 en_preparation` : on redemande toutes les 5 s, au plus
   * `ESSAIS_MAX` fois, puis on le dit. 404 (serveur antérieur) : on le dit,
   * sans bandeau d'erreur.
   */
  import { onDestroy } from 'svelte';
  import { t } from '../../lib/i18n';
  import { chargerArbreGenresMb, filtrerNoeuds, type EtatArbreMb } from '../../lib/arbreGenresMb';

  const ATTENTE_MS = 5_000;
  const ESSAIS_MAX = 24;

  let etat = $state<EtatArbreMb | null>(null);
  let chargement = $state(false);
  let erreur = $state<string | null>(null);
  let tropLong = $state(false);
  let recherche = $state('');
  let voirNonReconnus = $state(false);
  let minuterie: ReturnType<typeof setTimeout> | null = null;
  let detruit = false;

  const pret = $derived(etat?.etat === 'pret' ? etat : null);
  const visibles = $derived(pret ? filtrerNoeuds(pret.noeuds, recherche) : []);

  async function charger(essai = 1) {
    chargement = true; erreur = null; tropLong = false;
    try {
      const e = await chargerArbreGenresMb();
      if (detruit) return;
      etat = e;
      if (e.etat === 'en_preparation') {
        if (essai >= ESSAIS_MAX) { tropLong = true; chargement = false; return; }
        minuterie = setTimeout(() => { minuterie = null; void charger(essai + 1); }, ATTENTE_MS);
        return;
      }
      chargement = false;
    } catch (e: any) {
      if (detruit) return;
      erreur = e?.message ?? String(e);
      chargement = false;
    }
  }

  onDestroy(() => { detruit = true; if (minuterie) clearTimeout(minuterie); });
</script>

<section class="mb-tree" data-arbre-mb>
  <h2>{$t('genreTree.mb.title' as any)}</h2>
  <p class="lede">{$t('genreTree.mb.lede' as any)}</p>

  {#if etat === null && !chargement && !erreur}
    <button class="btn" onclick={() => charger()}>{$t('genreTree.mb.load' as any)}</button>
  {/if}

  {#if erreur}
    <p class="err" data-erreur>{$t('genreTree.mb.error' as any).replace('{erreur}', erreur)}</p>
    <button class="btn" onclick={() => charger()}>{$t('genreTree.mb.retry' as any)}</button>
  {:else if etat?.etat === 'absent'}
    <p class="note" data-absent>{$t('genreTree.mb.unsupported' as any)}</p>
  {:else if etat?.etat === 'en_preparation'}
    {#if tropLong}
      <p class="note" data-trop-long>{$t('genreTree.mb.tooLong' as any)}</p>
      <button class="btn" onclick={() => charger()}>{$t('genreTree.mb.retry' as any)}</button>
    {:else}
      <p class="note" data-en-preparation>{$t('genreTree.mb.preparing' as any)}</p>
    {/if}
  {:else if pret}
    <p class="source" data-source>
      {$t('genreTree.mb.source' as any).replace('{source}', pret.source).replace('{licence}', pret.licence)}
    </p>
    {#if pret.partiel}<p class="note" data-partiel>{$t('genreTree.mb.partial' as any)}</p>{/if}

    {#if pret.noeuds.length === 0}
      <p class="note" data-aucun>{$t('genreTree.mb.none' as any)}</p>
    {:else}
      <input class="mb-filtre" type="search" bind:value={recherche}
        placeholder={$t('genreTree.mb.search' as any)} aria-label={$t('genreTree.mb.search' as any)} />
      <p class="count">{$t('genreTree.mb.count' as any).replace('{n}', String(visibles.length)).replace('{total}', String(pret.noeuds.length))}</p>
      <ul class="nodes">
        {#each visibles as n (n.genre + n.mbid)}
          <li class="node" data-noeud={n.genre}>
            <div class="head">
              <strong>{n.genre}</strong>
              {#if n.nom_musicbrainz.toLowerCase() !== n.genre.toLowerCase()}
                <span class="mbname" title="MusicBrainz">({n.nom_musicbrainz})</span>
              {/if}
            </div>
            <div class="rel">
              <span class="lbl">{$t('genreTree.mb.parents' as any)}</span>
              {#if n.parents.length}
                {#each n.parents as p (p)}<span class="chip">{p}</span>{/each}
              {:else}<span class="none">{$t('genreTree.mb.noParent' as any)}</span>{/if}
            </div>
            {#if n.sous_genres.length}
              <div class="rel">
                <span class="lbl">{$t('genreTree.mb.children' as any)}</span>
                {#each n.sous_genres as s (s)}<span class="chip">{s}</span>{/each}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if pret.nonReconnus.length}
      <button class="lnk" onclick={() => (voirNonReconnus = !voirNonReconnus)} data-non-reconnus-bouton>
        {voirNonReconnus ? '▾' : '▸'} {$t('genreTree.mb.unmatched' as any).replace('{n}', String(pret.nonReconnus.length))}
      </button>
      {#if voirNonReconnus}
        <p class="unmatched" data-non-reconnus>{pret.nonReconnus.join(' · ')}</p>
      {/if}
    {/if}
  {/if}
</section>

<style>
  .mb-tree { margin-top: 32px; padding-top: 20px; border-top: 1px solid var(--tune-border); }
  h2 { margin: 0 0 6px; font-size: 1.15rem; color: var(--tune-text); }
  .lede, .note, .source, .count { color: var(--tune-text-muted); font-size: 0.9em; line-height: 1.5; max-width: 72ch; }
  .err { color: var(--tune-danger, #d33); font-size: 0.9em; }
  .btn { background: var(--tune-accent); color: var(--tune-on-accent, #fff); border: 0; border-radius: 8px; padding: 7px 14px; cursor: pointer; font-weight: 600; }
  .mb-filtre { width: 100%; max-width: 360px; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--tune-border);
    background: var(--tune-bg); color: var(--tune-text); margin: 8px 0 4px; }
  .nodes { list-style: none; padding: 0; margin: 8px 0; display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
  .node { border: 1px solid var(--tune-border); border-radius: 10px; padding: 10px 12px; background: var(--tune-surface, transparent); }
  .head { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; margin-bottom: 6px; color: var(--tune-text); }
  .mbname { font-size: 0.8em; color: var(--tune-text-muted); }
  .rel { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-top: 4px; font-size: 0.85em; }
  .lbl { color: var(--tune-text-muted); margin-right: 4px; }
  .chip { border: 1px solid var(--tune-border); border-radius: 999px; padding: 1px 8px; color: var(--tune-text); }
  .none { color: var(--tune-text-muted); font-style: italic; }
  .lnk { background: none; border: 0; color: var(--tune-text-muted); cursor: pointer; padding: 4px 0; }
  .unmatched { color: var(--tune-text-muted); font-size: 0.85em; line-height: 1.6; }
</style>
