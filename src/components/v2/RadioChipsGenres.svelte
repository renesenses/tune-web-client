<script lang="ts">
  /**
   * Le filtre par genre, en BOUTONS, sur « Mes radios » comme sur « Annuaire »
   * (rapport de Rémi, RC7, #2397 : « boutons partout »).
   */
  import { t } from '../../lib/i18n';
  interface Genre { cle: string; libelle: string; n: number }
  let { genres, choisi, total, onChoisir }: {
    genres: Genre[]; choisi: string | null; total: number; onChoisir: (cle: string | null) => void;
  } = $props();
</script>

<div class="chips">
  <button class="chip" class:active={!choisi} onclick={() => onChoisir(null)}>{$t('v2.radio.allGenres' as any)} ({total})</button>
  {#each genres as g (g.cle)}
    <button class="chip" class:active={choisi === g.cle}
      onclick={() => onChoisir(choisi === g.cle ? null : g.cle)}>{g.libelle} <span>{g.n}</span></button>
  {/each}
</div>

<style>
  .chips{display:flex; gap:7px; flex-wrap:wrap}
  .chip{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    font:600 11.5px var(--v2-sans); padding:6px 12px; border-radius:var(--v2-r-pill); transition:.15s}
  .chip span{font-family:var(--v2-mono); font-size:9.5px; color:var(--v2-txt3); margin-left:5px}
  .chip:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .chip.active{color:var(--v2-on-acc); border-color:transparent; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .chip.active span{color:var(--v2-on-acc); opacity:.75}
</style>
