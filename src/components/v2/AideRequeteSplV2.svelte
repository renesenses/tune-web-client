<!--
  L'aide de la « Requête avancée » des playlists intelligentes : la syntaxe,
  les opérateurs, le tableau des champs et des exemples, ouverte sur place
  depuis le bouton « Aide » du bloc (même panneau replié que l'aide « ? » de
  SaisieRequeteV2). Un clic sur un exemple le recopie dans la requête.

  Contenu tiré de la grammaire du serveur (tune-smart-http/src/requete_texte.rs) ;
  la page complète vit sur le site : DOC_REQUETE_AVANCEE.

  Les écritures (`genre:jazz`, `annee>=1960`…) sont la grammaire elle-même :
  elles ne se traduisent pas. Seules les explications passent par `$t()`. Les
  tableaux vivent dans lib/aideRequeteSpl.ts, comme EXEMPLES_DE_REQUETE pour
  SaisieRequeteV2 : « a et b », « a ou b » sont des mots de la grammaire, pas
  du français à traduire.
-->
<script lang="ts">
  import { t } from '../../lib/i18n';
  import { COMBINAISONS, DATES, DOC_REQUETE_AVANCEE, EXEMPLES, GROUPES, OPERATEURS } from '../../lib/aideRequeteSpl';

  let { onExemple }: { onExemple?: (requete: string) => void } = $props();
</script>

<div class="doc" data-requete-doc>
  <p>{$t('v2.spl.reqDoc.forme' as any)}</p>
  <p>{$t('v2.spl.reqDoc.vide' as any)}</p>

  <span class="lbl">{$t('v2.spl.reqDoc.titreOperateurs' as any)}</span>
  <table>
    <tbody>
      {#each OPERATEURS as l (l.labelKey)}<tr><td><code>{l.ecriture}</code></td><td>{$t(l.labelKey as any)}</td></tr>{/each}
    </tbody>
  </table>

  <span class="lbl">{$t('v2.spl.reqDoc.titreCombiner' as any)}</span>
  <table>
    <tbody>
      {#each COMBINAISONS as l (l.labelKey)}<tr><td><code>{l.ecriture}</code></td><td>{$t(l.labelKey as any)}</td></tr>{/each}
    </tbody>
  </table>
  <p>{$t('v2.spl.reqDoc.coPriorite' as any)}</p>

  <span class="lbl">{$t('v2.spl.reqDoc.titreChamps' as any)}</span>
  {#each GROUPES as g (g.titreKey)}
    <span class="sous">{$t(g.titreKey as any)}</span>
    <table data-champs>
      <tbody>
        {#each g.lignes as l (l.labelKey)}<tr><td><code>{l.ecriture}</code></td><td>{$t(l.labelKey as any)}</td></tr>{/each}
      </tbody>
    </table>
  {/each}

  <span class="lbl">{$t('v2.spl.reqDoc.titreDates' as any)}</span>
  <table>
    <tbody>
      {#each DATES as l (l.labelKey)}<tr><td><code>{l.ecriture}</code></td><td>{$t(l.labelKey as any)}</td></tr>{/each}
    </tbody>
  </table>

  <span class="lbl">{$t('v2.spl.reqDoc.titreExemples' as any)}</span>
  <ul class="exemples">
    {#each EXEMPLES as l (l.labelKey)}
      <li>
        {#if onExemple}
          <button type="button" class="ex" onclick={() => onExemple?.(l.ecriture)}
            title={$t('requeteAvancee.useExample' as any)} data-exemple><code>{l.ecriture}</code></button>
        {:else}
          <code>{l.ecriture}</code>
        {/if}
        <span>{$t(l.labelKey as any)}</span>
      </li>
    {/each}
  </ul>

  <a class="complete" href={DOC_REQUETE_AVANCEE} target="_blank" rel="noopener noreferrer" data-doc-complete>
    {$t('v2.spl.reqDoc.complete' as any)}
  </a>
</div>

<style>
  .doc{border:1px solid var(--v2-line2); background:var(--v2-surface2); border-radius:10px;
    padding:12px 14px; display:flex; flex-direction:column; gap:8px; font:calc(13px * var(--v2-txt-echelle, 1))/1.45 var(--v2-sans);
    color:var(--v2-txt2); max-height:420px; overflow:auto}
  .doc p{margin:0}
  .doc code{font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt)}
  .lbl{font:600 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); letter-spacing:.12em; text-transform:uppercase; color:var(--v2-txt3); margin-top:4px}
  .sous{font:600 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt)}
  table{border-collapse:collapse; width:100%}
  td{padding:3px 8px 3px 0; vertical-align:top; border-top:1px solid var(--v2-line2)}
  td:first-child{white-space:nowrap; width:1%}
  .exemples{margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:6px}
  .exemples li{display:flex; flex-direction:column; gap:2px}
  .ex{align-self:flex-start; text-align:left; border:1px dashed var(--v2-line2); background:transparent;
    border-radius:8px; padding:4px 8px; cursor:pointer}
  .ex:hover{border-color:var(--v2-acc2)}
  .complete{align-self:flex-start; color:var(--v2-acc-tint)}
  @media (max-width: 600px){ td:first-child{white-space:normal; word-break:break-word} }
</style>
