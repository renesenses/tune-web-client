<script lang="ts">
  /**
   * Les pistes d'un album, par dossier, à cocher une à une
   * (tune-server-rust#5483).
   *
   * Xavier Joly, 0.9.168 : « naviguer dans les répertoires pour être plus
   * précis si l'on ne veut convertir que certaines pistes d'un album ».
   * L'album est parcouru par ses DOSSIERS (CD1, CD2…), tirés des chemins de
   * ses pistes : c'est ce que l'utilisateur voit sur son disque.
   */
  import { t } from '../../lib/i18n';
  import { dossiersDesPistes, type PisteDeLAlbum } from '../../lib/convertisseurPistes';

  let { titre, pistes, cochees, onchange, onclose }: {
    titre: string;
    pistes: PisteDeLAlbum[] | null;
    cochees: Set<number>;
    onchange: (cochees: Set<number>) => void;
    onclose: () => void;
  } = $props();

  const dossiers = $derived(dossiersDesPistes(pistes ?? []));
  const toutes = $derived(dossiers.flatMap((d) => d.pistes.map((p) => p.id as number)));
  const compte = $derived($t('v2.conv.tracksPicked' as any)
    .replace('{n}', String(toutes.filter((id) => cochees.has(id)).length))
    .replace('{total}', String(toutes.length)));

  function basculer(ids: number[], cocher: boolean) {
    const n = new Set(cochees);
    for (const id of ids) cocher ? n.add(id) : n.delete(id);
    onchange(n);
  }
</script>

<div class="pistes" role="group" aria-label={$t('v2.conv.tracksOf' as any).replace('{album}', titre)}>
  <div class="ph">
    <strong>{$t('v2.conv.tracksOf' as any).replace('{album}', titre)}</strong>
    {#if pistes}
      <span class="n">{compte}</span>
    {/if}
    <button class="lnk" onclick={onclose}>{$t('v2.conv.closeTracks' as any)}</button>
  </div>
  {#if !pistes}
    <div class="etat">{$t('v2.tool.loading' as any)}</div>
  {:else}
    <label class="tout">
      <input type="checkbox" checked={toutes.length > 0 && toutes.every((id) => cochees.has(id))}
        indeterminate={toutes.some((id) => cochees.has(id)) && !toutes.every((id) => cochees.has(id))}
        onchange={(e) => basculer(toutes, (e.currentTarget as HTMLInputElement).checked)} />
      {$t('v2.conv.allTracks' as any)}
    </label>
    {#each dossiers as d (d.dossier)}
      {@const ids = d.pistes.map((p) => p.id as number)}
      <div class="dossier">
        {#if d.libelle}
          <label class="dl" title={d.dossier}>
            <input type="checkbox" checked={ids.every((id) => cochees.has(id))}
              indeterminate={ids.some((id) => cochees.has(id)) && !ids.every((id) => cochees.has(id))}
              onchange={(e) => basculer(ids, (e.currentTarget as HTMLInputElement).checked)} />
            <code>{d.libelle}</code>
          </label>
        {/if}
        <ul>
          {#each d.pistes as p (p.id)}
            <li>
              <label title={p.file_path ?? ''}>
                <input type="checkbox" data-piste={p.id} checked={cochees.has(p.id as number)}
                  onchange={(e) => basculer([p.id as number], (e.currentTarget as HTMLInputElement).checked)} />
                {#if p.track_number}<span class="no">{p.track_number}</span>{/if}
                <span class="ti">{p.title ?? ''}</span>
              </label>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  {/if}
</div>

<style>
  .pistes{margin:0 0 16px; padding:14px 16px; border-radius:13px; border:1px solid var(--v2-line2); background:var(--v2-acc-soft)}
  .ph{display:flex; align-items:center; gap:12px; margin-bottom:10px}
  .ph strong{font:700 13px var(--v2-sans); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .ph .n{font:11px var(--v2-mono); color:var(--v2-txt3); margin-right:auto}
  .etat{color:var(--v2-txt3); font-size:12px}
  label{display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12.5px; color:var(--v2-txt2)}
  .tout{font-weight:600; color:var(--v2-txt); margin-bottom:8px}
  .dossier{margin-top:8px}
  .dl code{font:11.5px var(--v2-mono); color:var(--v2-txt)}
  ul{list-style:none; margin:4px 0 0; padding:0 0 0 22px; display:grid; gap:3px}
  .no{font:11px var(--v2-mono); color:var(--v2-txt3); min-width:18px; text-align:right}
  .ti{overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:var(--v2-r-pill); padding:5px 12px; font:600 11.5px var(--v2-sans)}
  .lnk:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
</style>
