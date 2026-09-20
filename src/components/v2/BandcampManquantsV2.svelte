<script lang="ts">
  /**
   * « Ce que j'ai acheté sur Bandcamp et que je n'ai pas en local » — porté de
   * l'ancien écran Bandcamp, seul à le faire.
   *
   * TOUTE la collection (toutes les pages, `bandcampAllCollection`), face à
   * TOUS les albums de la bibliothèque. Trois verdicts, et le troisième compte
   * autant que les deux autres : une correspondance approximative annoncée
   * comme certaine serait pire que rien (`lib/bandcampMatch`).
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { rapprocher, type Rapprochement } from '../../lib/bandcampMatch';

  type Verdict = 'manquante' | 'ambigue' | 'presente';
  let resultats = $state<Rapprochement<api.BandcampItem>[]>([]);
  let chargement = $state(false);
  let analyse = $state(false);
  let erreur = $state<string | null>(null);
  let onglet = $state<Verdict>('manquante');

  async function analyser() {
    chargement = true;
    erreur = null;
    try {
      // En parallèle : la bibliothèque est longue, la collection dépend du réseau.
      const [collection, albums] = await Promise.all([api.bandcampAllCollection(), api.getAllAlbums()]);
      // Seuls les albums : une piste isolée n'a pas à être cherchée parmi eux.
      resultats = rapprocher(collection.filter((c) => c.type === 'album'), albums as any);
      analyse = true;
      onglet = 'manquante';
    } catch (e) {
      erreur = (e as Error)?.message || $t('bandcamp.collectionFailed' as any);
    } finally {
      chargement = false;
    }
  }
  const compte = (v: Verdict) => resultats.filter((r) => r.verdict === v).length;
  const visibles = $derived(resultats.filter((r) => r.verdict === onglet));
  const LIBELLES: [Verdict, string][] = [
    ['manquante', 'bandcamp.missing'], ['ambigue', 'bandcamp.uncertain'], ['presente', 'bandcamp.inLibrary'],
  ];
</script>

<section class="manquants">
  <button class="lnk" onclick={analyser} disabled={chargement}>
    {chargement ? $t('bandcamp.analysing' as any) : $t('bandcamp.localMatch' as any)}
  </button>
  {#if erreur}<div class="err">{erreur}</div>{/if}
  {#if analyse && !chargement}
    {#if !resultats.length}
      <p class="etat">{$t('bandcamp.collectionEmpty' as any)}</p>
    {:else}
      <div class="onglets">
        {#each LIBELLES as [v, cle] (v)}
          <button class:on={onglet === v} onclick={() => (onglet = v)}>{$t(cle as any)} <span>{compte(v)}</span></button>
        {/each}
      </div>
      {#if onglet === 'ambigue'}<p class="etat">{$t('bandcamp.uncertainExplain' as any)}</p>{/if}
      {#if !visibles.length}
        <p class="etat">{$t('bandcamp.emptyGroup' as any)}</p>
      {:else}
        <ul>
          {#each visibles as r, i (r.article.url ?? i)}
            <li>
              <a href={r.article.url} target="_blank" rel="noopener noreferrer">{r.article.artist} — {r.article.title}</a>
              {#if r.correspondance}<span class="corr">↔ {r.correspondance}</span>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  {/if}
</section>

<style>
  .manquants{margin:14px 0 20px; display:flex; flex-direction:column; gap:10px; align-items:flex-start}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    font:600 12px var(--v2-sans); padding:7px 12px; border-radius:8px}
  .err{color:var(--v2-danger); font-size:12px}
  .etat{margin:0; font-size:12.5px; color:var(--v2-txt3)}
  .onglets{display:flex; gap:6px; flex-wrap:wrap}
  .onglets button{padding:5px 11px; border-radius:999px; border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt2); font:12px var(--v2-sans); cursor:pointer}
  .onglets button.on{color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); border-color:transparent}
  .onglets span{opacity:.75; margin-left:4px}
  ul{margin:0; padding-left:18px; display:flex; flex-direction:column; gap:4px; font-size:13px}
  a{color:var(--v2-txt)}
  .corr{margin-left:8px; font-size:11px; color:var(--v2-txt3)}
</style>
