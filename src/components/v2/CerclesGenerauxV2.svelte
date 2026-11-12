<script lang="ts">
  /**
   * rc12 — « Cercles généraux » (site-mozaiklabs#422) : le catalogue, rejoindre,
   * quitter, écrire au cercle. Un cercle général se rejoint volontairement ; le
   * pseudo n'y paraît qu'après acceptation, demandée au premier envoi (fil).
   * Un site sans cercles généraux répond 404 : la rubrique ne s'affiche pas.
   */
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import { dialogs } from '../../lib/stores/dialogs';
  import { motifCercle } from '../../lib/circle';
  import { cerclesGeneraux, rejoindreCercleGeneral, quitterCercleGeneral, ecrireAuCercleGeneral, ADHESION_GENERALE_CHANGEE, type CercleGeneral } from '../../lib/circleMessagerie';

  let liste = $state<CercleGeneral[]>([]);
  let absent = $state(true);
  let erreur = $state('');
  let occupe = $state(false);
  let fini = false;
  const tr = (k: string) => $t(k as any);

  async function charger() {
    try {
      const l = await cerclesGeneraux();
      if (fini) return;
      liste = l; absent = false;
    } catch (e) {
      if (fini) return;
      const statut = (e as any)?.status;
      // 404 : site sans cercles généraux ; 401/412 : pas de compte relié — rien à montrer.
      if (statut === 404 || motifCercle(e).deconnecte) { absent = true; liste = []; return; }
      // Panne passagère (cloud indisponible…) : la rubrique reste, avec son motif.
      absent = false; erreur = tr(motifCercle(e).cle);
    }
  }
  async function adhesion(c: CercleGeneral) {
    if (occupe) return;
    if (c.joined && !(await dialogs.confirm(tr('v2.circle.general.leaveConfirm').replace('{circle}', c.name), { danger: true }))) return;
    occupe = true; erreur = '';
    try {
      if (c.joined) {
        await quitterCercleGeneral(c.id);
        window.dispatchEvent(new CustomEvent(ADHESION_GENERALE_CHANGEE, { detail: { general: c.id } }));
      } else {
        await rejoindreCercleGeneral(c.id);
      }
      await charger();
    } catch (e) { if (!fini) erreur = tr(motifCercle(e).cle); }
    finally { if (!fini) occupe = false; }
  }
  const categorie = (c: CercleGeneral) => c.category ? tr(`v2.circle.general.cat.${c.category}`) : '';
  onMount(() => { void charger(); return () => { fini = true; }; });
</script>

{#if !absent && (liste.length || erreur)}
  <section class="cercles-generaux" id="circle-general" aria-labelledby="cercles-generaux-titre">
    <h2 id="cercles-generaux-titre">{tr('v2.circle.general.title')}</h2>
    <p class="note">{tr('v2.circle.general.intro')}</p>
    {#if erreur}<p role="alert" class="erreur">{erreur}</p>{/if}
    <ul>
      {#each liste as c (c.id)}
        <li>
          <div class="cercle">
            <strong>{c.name}</strong>
            <span>{[categorie(c), tr('v2.circle.general.members').replace('{count}', String(c.member_count))].filter(Boolean).join(' · ')}</span>
          </div>
          {#if c.joined}<button type="button" class="ecrire" disabled={occupe} onclick={() => ecrireAuCercleGeneral(c.id)}>{tr('v2.circle.msg.writeToCircle')}</button>{/if}
          <button type="button" disabled={occupe} aria-pressed={c.joined} onclick={() => void adhesion(c)}>{tr(c.joined ? 'v2.circle.general.leave' : 'v2.circle.general.join')}</button>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .cercles-generaux{margin:24px 0;color:var(--v2-txt)}
  h2{font-size:calc(18px * var(--v2-txt-echelle, 1));margin:0 0 6px}
  .note{font-size:calc(12px * var(--v2-txt-echelle, 1));color:var(--v2-txt2);margin:0 0 12px}
  .erreur{color:var(--v2-danger)}
  ul{list-style:none;padding:0;margin:0;display:flex;flex-direction:column}
  li{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 4px;border-bottom:1px solid var(--v2-line)}
  .cercle{flex:1;min-width:140px}
  .cercle strong{display:block;font-size:calc(14px * var(--v2-txt-echelle, 1))}
  .cercle span{display:block;font-size:calc(12px * var(--v2-txt-echelle, 1));color:var(--v2-txt2);margin-top:4px}
  button{font:inherit;font-size:calc(13px * var(--v2-txt-echelle, 1));background:var(--v2-surface2);color:var(--v2-txt);border:1px solid var(--v2-line);border-radius:8px;padding:8px 12px;cursor:pointer}
  button.ecrire{background:var(--v2-acc1);color:var(--v2-on-acc);border-color:transparent}
  button:disabled{opacity:.5;cursor:default}
  button:focus-visible{outline:2px solid var(--v2-acc1);outline-offset:3px}
</style>
