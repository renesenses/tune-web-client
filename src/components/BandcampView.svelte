<script lang="ts">
  import { t } from '../lib/i18n';
  import { notifications } from '../lib/stores/notifications';
  import * as api from '../lib/api';
  import { rapprocher, type Rapprochement } from '../lib/bandcampMatch';

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

  let manquants = $derived(resultats.filter((r) => r.verdict === 'manquante'));
  let ambigus = $derived(resultats.filter((r) => r.verdict === 'ambigue'));
  let presents = $derived(resultats.filter((r) => r.verdict === 'presente'));
  let affiches = $derived(
    onglet === 'manquante' ? manquants : onglet === 'ambigue' ? ambigus : presents,
  );

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

  {#if !analyse}
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

  {#if erreur}
    <p class="bc-erreur">{erreur}</p>
  {/if}

  {#if chargement}
    <p class="bc-attente">{$t('bandcamp.analysing' as any)}</p>
  {/if}

  {#if analyse && !chargement}
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
</style>
