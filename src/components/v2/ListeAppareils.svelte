<script lang="ts">
  /**
   * Liste compacte des appareils — web#2451 (alec_eiffel, fil 2424).
   *
   * Une ligne par zone : nom, appareil, type de sortie, état. Les détails (la
   * carte de zone, inchangée) s'ouvrent au clic, sous la liste, dans
   * `SettingsV2`. Ce composant ne porte que la liste, le filtre texte et le
   * filtre de type ; la sélection remonte par `ouverte`.
   *
   * Clavier : chaque ligne est un VRAI bouton (Tab, Entrée, Espace) ;
   * flèches haut/bas, Début et Fin déplacent le focus d'une ligne à l'autre.
   */
  import { t } from '../../lib/i18n';
  import type { Zone } from '../../lib/types';
  import { zoneTypeLabel, zoneDeviceName } from '../../lib/zoneIdentity';
  import {
    cleZone, trierZones, filtrerZones, typesPresents, etatAppareil,
    TOUS_LES_TYPES, TYPE_LOCAL,
  } from '../../lib/listeAppareils';
  import ZoneTypeIcon from '../partages/ZoneTypeIcon.svelte';

  interface Props {
    zones: readonly Zone[];
    /** Clé (`cleZone`) de la zone dont les détails sont ouverts, ou null. */
    ouverte: string | null;
    onselect: (cle: string | null) => void;
  }
  let { zones, ouverte, onselect }: Props = $props();

  let texte = $state('');
  let type = $state(TOUS_LES_TYPES);

  const triees = $derived(trierZones(zones));
  const types = $derived(typesPresents(zones));
  // Un type qui n'existe plus (appareil retiré) ne doit pas laisser une liste
  // vide sans explication : on retombe sur « tous ».
  const typeActif = $derived(type === TOUS_LES_TYPES || types.includes(type) ? type : TOUS_LES_TYPES);
  const visibles = $derived(filtrerZones(triees, texte, typeActif));

  const libelleType = (v: string) => (v === TYPE_LOCAL ? $t('v2.set.localOutput' as any) : v);
  const libelleEtat = (z: Zone) => {
    const e = etatAppareil(z);
    return $t((e === 'offline' ? 'zone.offline' : `zone.${e}`) as any);
  };

  let liste: HTMLUListElement | undefined = $state();
  function touche(e: KeyboardEvent) {
    const cles = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!cles.includes(e.key) || !liste) return;
    const boutons = [...liste.querySelectorAll<HTMLButtonElement>('button.ligne')];
    const i = boutons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? boutons.length - 1
      : Math.min(boutons.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)));
    boutons[j]?.focus();
  }
</script>

<div class="la">
  <div class="la-filtres">
    <input type="search" class="la-txt" bind:value={texte}
      aria-label={$t('v2.dev.filterLabel' as any)}
      placeholder={$t('v2.dev.filterPlaceholder' as any)} />
    <select class="la-type" value={typeActif}
      aria-label={$t('v2.dev.typeLabel' as any)}
      onchange={(e) => (type = (e.currentTarget as HTMLSelectElement).value)}>
      <option value={TOUS_LES_TYPES}>{$t('v2.dev.typeAll' as any)}</option>
      {#each types as v (v)}<option value={v}>{libelleType(v)}</option>{/each}
    </select>
    <span class="la-n" aria-live="polite">
      {$t('v2.dev.count' as any).replace('{shown}', String(visibles.length)).replace('{total}', String(zones.length))}
    </span>
  </div>

  {#if !visibles.length}
    <p class="hint la-vide">{$t('v2.dev.noMatch' as any)}</p>
  {:else}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <ul class="la-liste" bind:this={liste} aria-label={$t('v2.dev.listAria' as any)} onkeydown={touche}>
      {#each visibles as z (cleZone(z))}
        {@const cle = cleZone(z)}
        {@const etat = etatAppareil(z)}
        <li>
          <button type="button" class="ligne" class:sel={ouverte === cle}
            aria-expanded={ouverte === cle}
            aria-controls={ouverte === cle && z.id != null ? `zc-${z.id}` : undefined}
            data-zone={cle}
            onclick={() => onselect(ouverte === cle ? null : cle)}>
            <span class="ic" aria-hidden="true"><ZoneTypeIcon type={z.output_type ?? null} size={18} /></span>
            <span class="nom">
              <span class="zn" title={z.name}>{z.name}</span>
              {#if zoneDeviceName(z)}<span class="app" title={zoneDeviceName(z) ?? undefined}>{zoneDeviceName(z)}</span>{/if}
            </span>
            <span class="zt proto">{zoneTypeLabel(z.output_type) && z.output_type !== 'browser' ? zoneTypeLabel(z.output_type) : $t('v2.set.localOutput' as any)}</span>
            <span class="etat etat-{etat}"><span class="pt" aria-hidden="true"></span>{libelleEtat(z)}</span>
            <span class="chev" aria-hidden="true">{ouverte === cle ? '▾' : '▸'}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .la{margin-top:12px; display:flex; flex-direction:column; gap:10px}
  .la-filtres{display:flex; gap:10px; align-items:center; flex-wrap:wrap}
  .la-txt{flex:1 1 200px; min-width:0; padding:8px 11px; border-radius:9px; border:1px solid var(--v2-line2);
    background:var(--v2-bg); color:var(--v2-txt); font:inherit}
  .la-type{padding:8px 10px; border-radius:9px; border:1px solid var(--v2-line2); background:var(--v2-bg);
    color:var(--v2-txt); font:inherit}
  .la-n{font:11px var(--v2-mono); color:var(--v2-txt3)}
  .la-vide{margin:4px 0}
  .la-liste{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:4px}
  .ligne{width:100%; display:flex; align-items:center; gap:12px; padding:9px 12px; text-align:left;
    border-radius:10px; border:1px solid var(--v2-line); background:var(--v2-bg); color:var(--v2-txt);
    font:inherit; cursor:pointer}
  .ligne:hover{background:var(--v2-hover)}
  .ligne:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:2px}
  .ligne.sel{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .ic{display:inline-flex; color:var(--v2-txt2); flex:none}
  .nom{display:flex; flex-direction:column; min-width:0; flex:1}
  .zn{font-size:14px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .app{font-size:11.5px; color:var(--v2-txt3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .zt{font:9.5px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3)}
  .zt.proto{border:1px solid var(--v2-line2); border-radius:var(--v2-r-pill); padding:1px 6px; color:var(--v2-txt2); flex:none}
  .etat{display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--v2-txt2); flex:none; min-width:78px}
  .pt{width:8px; height:8px; border-radius:50%; background:var(--v2-txt3)}
  .etat-playing .pt{background:var(--v2-acc2)}
  .etat-offline{color:var(--v2-txt3)}
  .etat-offline .pt{background:transparent; border:1.5px solid var(--v2-txt3)}
  .chev{color:var(--v2-txt3); flex:none}
  @media (max-width: 560px){
    .zt.proto{display:none}
    .etat{min-width:0}
  }
</style>
