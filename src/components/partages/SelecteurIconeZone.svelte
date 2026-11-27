<script lang="ts">
  /**
   * Choisir l'icône d'une zone (thème Roon-like, itération 7) : une pièce,
   * une personne ou un appareil du jeu de Rémi, ou l'icône par défaut.
   *
   * Le choix est rangé dans CE navigateur (`lib/iconesZone`) : le serveur n'a
   * pas encore de champ pour l'icône d'une zone.
   */
  import { t } from '../../lib/i18n';
  import {
    FAMILLES_ICONES, ICONES, choixIconesZones, choisirIconeZone, iconeParDefaut, cleLibelleIcone,
    type ZoneIconeSource,
  } from '../../lib/iconesZone';
  import IconeZone from './IconeZone.svelte';

  interface Props { zone: ZoneIconeSource; onClose: () => void }
  let { zone, onClose }: Props = $props();

  const choisie = $derived(zone.id != null ? $choixIconesZones[String(zone.id)] ?? null : null);
  const parDefaut = $derived(iconeParDefaut(zone));

  function choisir(nom: string | null) {
    choisirIconeZone(zone.id, nom);
    onClose();
  }
  function touche(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="fond-icones" role="presentation" onclick={onClose} onkeydown={touche}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <div class="boite-icones" role="dialog" aria-modal="true" tabindex="-1"
    aria-label={$t('roonLike.icone.titre' as any).replace('{zone}', zone.name ?? '')}
    onclick={(e) => e.stopPropagation()} data-selecteur-icone-zone>
    <header class="tete">
      <h2>{$t('roonLike.icone.titre' as any).replace('{zone}', zone.name ?? '')}</h2>
      <button class="fermer" onclick={onClose} aria-label={$t('common.close' as any)} title={$t('common.close' as any)}>×</button>
    </header>
    <p class="note">{$t('roonLike.icone.note' as any)}</p>
    <button class="defaut" class:on={!choisie} aria-pressed={!choisie} onclick={() => choisir(null)} data-icone-defaut>
      <IconeZone nom={parDefaut} taille={22} />
      <span>{$t('roonLike.icone.parDefaut' as any)}</span>
    </button>
    {#each FAMILLES_ICONES as f (f)}
      <h3>{$t(`roonLike.icone.famille.${f}` as any)}</h3>
      <div class="grille-icones">
        {#each ICONES[f] as n (n)}
          {@const nom = `${f}/${n}`}
          <button class="case" class:on={choisie === nom} aria-pressed={choisie === nom}
            title={$t(cleLibelleIcone(nom) as any)} aria-label={$t(cleLibelleIcone(nom) as any)}
            data-icone={nom} onclick={() => choisir(nom)}>
            <IconeZone nom={nom} taille={24} />
          </button>
        {/each}
      </div>
    {/each}
  </div>
</div>

<style>
  .fond-icones { position: fixed; inset: 0; z-index: 900; display: grid; place-items: center; background: var(--v2-scrim); }
  .boite-icones {
    width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 64px); overflow-y: auto;
    padding: 18px 20px 22px; background: var(--v2-surface); color: var(--v2-txt);
    border: 1px solid var(--v2-line); border-radius: var(--v2-r-md); box-shadow: var(--v2-sh-lg);
  }
  .tete { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  h2 { margin: 0; font-size: var(--taille-7); font-weight: 600; }
  h3 {
    margin: 16px 0 8px; font-size: var(--taille-2); font-weight: 600;
    text-transform: uppercase; letter-spacing: .04em; color: var(--v2-txt2);
  }
  .note { margin: 6px 0 12px; color: var(--v2-txt3); font-size: var(--taille-3); }
  .fermer { border: 0; background: none; color: var(--v2-txt2); font-size: var(--taille-7); cursor: pointer; line-height: 1; }
  .defaut {
    display: inline-flex; align-items: center; gap: 10px; padding: 6px 14px 6px 8px; cursor: pointer;
    border: 1px solid var(--v2-line); border-radius: var(--v2-r-pill); background: transparent; color: var(--v2-txt); font: inherit;
  }
  .grille-icones { display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: 6px; }
  .case {
    display: grid; place-items: center; aspect-ratio: 1; border: 1px solid transparent; border-radius: var(--v2-r-card);
    background: var(--v2-surface2); color: var(--v2-txt); cursor: pointer;
  }
  .case:hover, .defaut:hover { background: var(--v2-hover); }
  .case.on, .defaut.on { border-color: var(--v2-acc1); color: var(--v2-acc-tint); background: var(--v2-active1); }
  .case:focus-visible, .defaut:focus-visible { outline: 2px solid var(--v2-acc1); outline-offset: 2px; }
</style>
