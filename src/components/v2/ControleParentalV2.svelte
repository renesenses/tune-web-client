<script lang="ts">
  /**
   * web#2771 — le contrôle parental, TROUVABLE dans les Réglages.
   *
   * Démo du 09/11/2026 : impossible de le trouver. Son seul accès était le
   * bouton « Contrôle parental » d'une ligne de la section Profils, affiché
   * seulement si le profil actif est administrateur ET qu'un autre profil non
   * administrateur existe (`peutSuperviser`). Sans profil enfant, ou depuis
   * un profil non administrateur, la fonction n'existait pas à l'écran.
   *
   * Cette section l'explique toujours, puis guide selon le cas :
   *   - profil actif non administrateur → comment faire ;
   *   - aucun profil à encadrer → créer d'abord le profil de l'enfant ;
   *   - sinon → choisir le profil, et les règles s'ouvrent ici même
   *     (`PolitiqueParentaleV2`, le même panneau que sous Profils).
   */
  import { t } from '../../lib/i18n';
  import { profiles, visibleProfiles, currentProfileId, type Profile } from '../../lib/stores/profile';
  import { peutSuperviser } from '../../lib/politiqueParentale';
  import PolitiqueParentaleV2 from './PolitiqueParentaleV2.svelte';

  const nomDe = (p: Profile) => p.display_name?.trim() || p.name || '';
  // Profils pas encore chargés (`actif` inconnu) : le guide ne conclut rien,
  // sinon « non administrateur » s'afficherait un instant à tort.
  const actif = $derived($profiles.find((x) => x.id === $currentProfileId));
  const encadrables = $derived($visibleProfiles.filter((p) => peutSuperviser(actif, p)));
  let choisi = $state<number | null>(null);
  const profilChoisi = $derived(encadrables.find((p) => p.id === choisi) ?? null);
</script>

<p class="hint" data-parental-intro data-reglage="controle-parental">{$t('parental.guide.intro' as any)}</p>

{#if !actif}
{:else if actif.is_admin !== true}
  <p class="guide" data-parental-guide-non-admin>{$t('parental.guide.notAdmin' as any)}</p>
{:else if !encadrables.length}
  <p class="guide" data-parental-guide-sans-profil>{$t('parental.guide.noChild' as any)}</p>
{:else}
  <label class="choix" data-parental-guide-choisir>
    <span>{$t('parental.guide.choose' as any)}</span>
    <select class="sel" bind:value={choisi}>
      <option value={null}>{$t('parental.guide.choosePlaceholder' as any)}</option>
      {#each encadrables as p (p.id)}
        <option value={p.id}>{nomDe(p)}</option>
      {/each}
    </select>
  </label>
  {#if profilChoisi}
    {#key profilChoisi.id}
      <PolitiqueParentaleV2 profil={profilChoisi} />
    {/key}
  {/if}
{/if}

<style>
  .hint{margin:4px 0 12px; font-size:12.5px; line-height:1.5; color:var(--v2-txt3)}
  .guide{margin:0 0 8px; padding:10px 12px; border-radius:11px; border:1px solid var(--v2-line2);
    background:var(--v2-surface2); color:var(--v2-txt2); font-size:13px; line-height:1.5}
  .choix{display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:10px;
    color:var(--v2-txt); font:13px var(--v2-sans)}
  .sel{height:34px; border-radius:9px; border:1px solid var(--v2-line2); background:var(--v2-bg);
    color:var(--v2-txt); font:13px var(--v2-sans); padding:0 10px; min-width:180px}
  .sel:focus{outline:none; border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
</style>
