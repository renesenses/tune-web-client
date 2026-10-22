<script lang="ts">
  /**
   * Réglages › Zones — « Plages MAC des appareils » (#2244,
   * tune-server-rust#6546).
   *
   * 1. Pour chaque appareil : la plage reconnue (`70:B3:D5:xx:xx:xx`) et sa
   *    marque, jamais la MAC complète. Plage hors table et MAC inconnue se
   *    disent l'une et l'autre.
   * 2. La table entière, dans un bloc dépliable, groupée par marque, avec une
   *    recherche par marque ou par préfixe.
   *
   * Serveur antérieur : `mac_prefix` absent des appareils, route en 404. La
   * ligne de plage ne s'affiche pas (`etatPlage` rend `null`) et le bloc de
   * la table reste masqué — l'écran est celui d'avant.
   */
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import { formatNombre } from '../../lib/formats';
  import { bulleTexte } from '../../lib/infobulleTexte';
  import * as api from '../../lib/api';
  import { etatPlage, filtrerTable, plageAffichee, type TableOuiAudio } from '../../lib/plagesMac';
  import type { DiscoveredDevice } from '../../lib/types';

  let { appareils = [] }: { appareils?: DiscoveredDevice[] } = $props();

  let table = $state<TableOuiAudio | null>(null);
  let recherche = $state('');

  onMount(() => {
    let vivant = true;
    api.getOuiAudio().then((r) => { if (vivant) table = r; }).catch(() => {});
    return () => { vivant = false; };
  });

  /** Seuls les appareils dont le serveur publie la plage ont une ligne. */
  const lignes = $derived(
    appareils
      .map((d) => ({ d, e: etatPlage(d) }))
      .filter((l): l is { d: DiscoveredDevice; e: NonNullable<ReturnType<typeof etatPlage>> } => l.e !== null),
  );

  const marquesFiltrees = $derived(table ? filtrerTable(table, recherche) : []);

  function texteEtat(e: NonNullable<ReturnType<typeof etatPlage>>): string {
    if (e.etat === 'connue') return `${plageAffichee(e.plage)} · ${e.marque}`;
    if (e.etat === 'hors-table') return `${plageAffichee(e.plage)} · ${$t('settings.macRangeUnlisted' as any)}`;
    return $t('settings.macUnknown' as any);
  }

  function compte(n: number): string {
    return $t((n === 1 ? 'settings.macRangesCountOne' : 'settings.macRangesCount') as any)
      .replace('{n}', $formatNombre(n));
  }
</script>

<div class="plages-mac" data-bloc="plages-mac">
  <p class="hint">{$t('settings.macRangesHint' as any)}</p>

  {#if lignes.length}
    <div class="pm-liste">
      {#each lignes as { d, e } (d.id)}
        <div class="pm-dev" data-etat={e.etat} title={texteEtat(e)}>
          <span class="pm-nom" use:bulleTexte>{d.name}</span>
          <span class="pm-plage" class:inconnue={e.etat !== 'connue'}>{texteEtat(e)}</span>
        </div>
      {/each}
    </div>
  {/if}

  {#if table}
    <details class="pm-table" data-bloc="table-oui">
      <summary>
        {$t('settings.macRangesTable' as any)}
        <span class="pm-total">{$t('settings.macRangesTotal' as any)
          .replace('{n}', $formatNombre(table.total))
          .replace('{m}', $formatNombre(table.vendors.length))}</span>
      </summary>
      <input class="pm-recherche" type="search" bind:value={recherche}
        placeholder={$t('settings.macRangesSearch' as any)}
        aria-label={$t('settings.macRangesSearch' as any)} />
      {#each marquesFiltrees as m (m.name)}
        <div class="pm-marque" data-marque={m.name}>
          <div class="pm-entete">
            <span class="pm-marque-nom">{m.name}</span>
            <span class="pm-compte">{compte(m.prefixes.length)}</span>
          </div>
          <div class="pm-prefixes">
            {#each m.prefixes as p (p)}<code>{p}</code>{/each}
          </div>
        </div>
      {:else}
        <p class="hint">{$t('settings.macRangesNoMatch' as any)}</p>
      {/each}
    </details>
  {/if}
</div>

<style>
  .hint{font-size:11.5px; line-height:1.45; color:var(--v2-txt3)}
  .pm-liste{display:flex; flex-direction:column; gap:1px; margin-top:10px}
  .pm-dev{display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:11px;
    padding:7px 10px; border-radius:9px; color:var(--v2-txt2)}
  .pm-dev:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .pm-nom{font-size:13px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .pm-marque-nom{font-size:13px; color:var(--v2-txt)}
  .pm-plage{font:11px var(--v2-mono); color:var(--v2-acc2); text-align:right}
  .pm-plage.inconnue{color:var(--v2-txt3)}
  .pm-table{margin-top:12px}
  .pm-table summary{cursor:pointer; font-size:13px; color:var(--v2-txt2); padding:6px 0}
  .pm-total{font:11px var(--v2-mono); color:var(--v2-txt3); margin-left:8px}
  .pm-recherche{width:100%; max-width:360px; height:30px; margin:8px 0; border-radius:8px;
    border:1px solid var(--v2-line2); background:var(--v2-surface2); color:var(--v2-txt);
    font:12px var(--v2-sans); padding:0 10px; outline:none; box-sizing:border-box}
  .pm-marque{padding:8px 0; border-top:1px solid var(--v2-line2)}
  .pm-entete{display:flex; justify-content:space-between; gap:10px; align-items:baseline}
  .pm-compte{font:11px var(--v2-mono); color:var(--v2-txt3); flex:0 0 auto}
  .pm-prefixes{display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; max-height:160px; overflow:auto}
  .pm-prefixes code{font:10.5px var(--v2-mono); color:var(--v2-txt2); background:var(--v2-surface2);
    border-radius:5px; padding:1px 5px}
</style>
