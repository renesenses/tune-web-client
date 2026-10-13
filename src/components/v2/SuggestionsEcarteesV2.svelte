<script lang="ts">
  /**
   * Réglages ▸ Affichage ▸ « Accueil : suggestions écartées » (web#916).
   *
   * Tout ce que le profil actif a écarté de l'accueil par « Pas pour moi »,
   * le plus récent d'abord, chacun avec son bouton « Rétablir ». Le message
   * « Annuler » ne dure que quelques secondes : sans cet écran, un écart fait
   * trop vite serait définitif — et un « non » qu'on ne peut pas reprendre,
   * on finit par ne plus oser le dire.
   *
   * La liste vient du serveur (`GET /home/dismissed-suggestions`, par
   * profil) ; rétablir passe par le MODULE (`lib/suggestionsEcartees`), comme
   * « Annuler » : même route, et l'accueil resté ouvert retrouve aussitôt la
   * vignette.
   */
  import { t } from '../../lib/i18n';
  import { currentProfileId } from '../../lib/stores/profile';
  import { notifications } from '../../lib/stores/notifications';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import {
    chargerSuggestionsEcartees,
    cleEcart,
    retablir,
    suggestionsEcartees,
    type SuggestionEcartee,
  } from '../../lib/suggestionsEcartees';

  let chargement = $state(true);
  let occupe = $state<string | null>(null);

  $effect(() => {
    void $currentProfileId;
    chargement = true;
    void chargerSuggestionsEcartees().finally(() => (chargement = false));
  });

  const SORTES: Record<string, string> = {
    album: 'v2.dismiss.kindAlbum',
    artist: 'v2.dismiss.kindArtist',
    playlist: 'v2.dismiss.kindPlaylist',
    radio: 'v2.dismiss.kindRadio',
  };

  /** « Album · Qobuz », « Artiste », « Album » (bibliothèque). */
  function sorte(s: SuggestionEcartee): string {
    const k = $t((SORTES[s.item_type] ?? 'v2.dismiss.kindAlbum') as any);
    const service = s.source && !['local', 'nom'].includes(s.source) ? s.source : null;
    return service ? `${k} · ${service.charAt(0).toUpperCase()}${service.slice(1)}` : k;
  }

  async function remettre(s: SuggestionEcartee) {
    if (occupe != null) return;
    occupe = cleEcart(s);
    try {
      await retablir(s);
    } catch {
      notifications.error($t('v2.dismiss.failed' as any));
    } finally {
      occupe = null;
    }
  }
</script>

<div class="v2-ecartees">
  <p class="intro">{$t('v2.dismiss.settingsIntro' as any)}</p>
  {#if chargement && !$suggestionsEcartees.length}
    <p class="etat">…</p>
  {:else if !$suggestionsEcartees.length}
    <p class="etat">{$t('v2.dismiss.none' as any)}</p>
  {:else}
    <ul class="liste">
      {#each $suggestionsEcartees as s (cleEcart(s))}
        {@const detail = `${sorte(s)}${s.subtitle ? ` — ${s.subtitle}` : ''}`}
        <li class="ligne">
          <span class="cv">
            <AlbumArt coverPath={s.cover_url ?? null} albumId={null} size={0} vignette alt=""
              fallbackInitials={(s.title ?? s.item_id).slice(0, 1)} />
          </span>
          <span class="ti">
            <span class="tt" title={s.title ?? s.item_id}>{s.title ?? s.item_id}</span>
            <em title={detail}>{detail}</em>
          </span>
          <button class="lnk" disabled={occupe === cleEcart(s)} onclick={() => remettre(s)}>
            {$t('v2.dismiss.restore' as any)}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .v2-ecartees{display:flex; flex-direction:column; gap:6px}
  .intro{margin:0; font-size:12.5px; color:var(--v2-txt3); max-width:720px}
  .etat{margin:0; color:var(--v2-txt3); font-size:12.5px}
  .liste{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:1px}
  .ligne{display:grid; grid-template-columns:40px minmax(0,1fr) auto; align-items:center; gap:12px;
    padding:6px 8px; border-radius:9px; color:var(--v2-txt2)}
  .ligne:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .cv{width:40px; height:40px; border-radius:6px; overflow:hidden}
  .cv :global(img){width:100%; height:100%; object-fit:cover; display:block}
  .ti{min-width:0; display:flex; flex-direction:column; gap:2px}
  .tt{min-width:0; font-size:13.5px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .ti em{font:11px var(--v2-sans); font-style:normal; color:var(--v2-txt3);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .lnk{background:none; border:0; padding:4px 6px; font:500 12px var(--v2-sans); color:var(--v2-acc1); cursor:pointer}
  .lnk:hover{text-decoration:underline}
  .lnk:disabled{opacity:.5; cursor:default}
</style>
