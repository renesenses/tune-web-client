<script lang="ts">
  /**
   * La pastille « Compilation » (#1957).
   *
   * ## Ce que le serveur offrait déjà, et que personne ne lisait
   *
   * Le drapeau est persisté depuis la v0.9.95 : colonne `is_compilation`
   * (SQLite et PostgreSQL), écrite au scan avec EXACTEMENT la décision qui a
   * produit le regroupement en « Various Artists », rendue dans la réponse
   * album (`models.rs`, champ `is_compilation`, sérialisé par `Album::to_json`)
   * et dans `/library/albums-detailed` (`MAX(al.is_compilation)`). Un filtre
   * `?compilation=true|false` est accepté depuis le même jour.
   *
   * Côté client, rien : `Album` ne déclarait pas le champ, aucun écran ne le
   * lisait. C'est le symptôme signalé — « le tag compilation n'apparaît
   * jamais » — et il a survécu à la livraison serveur.
   *
   * ## 🔴 On n'affiche QUE le positif
   *
   * La colonne est posée AU SCAN. Un serveur mis à jour sans re-scan rend
   * `false` pour toute sa bibliothèque, et le verdict lui-même vient de changer
   * pour les albums à cheval sur plusieurs lots (serveur `ef2de52e`, #3232).
   * Une mention « ce n'est pas une compilation » affirmerait donc ce que la
   * base ne sait pas encore ; une pastille « compilation » présente, elle, est
   * vraie. D'où : rien à rendre quand le drapeau est faux ou absent.
   *
   * ## Pas seulement une couleur
   *
   * Trois disques empilés en icône, un libellé, et un `title` qui dit d'où
   * vient l'information. Sur la vignette d'un album la place manque : le
   * libellé se retire (`compact`), l'icône reste, et le nom passe alors par
   * `aria-label` — jamais par la seule couleur.
   */
  import { t } from '../../lib/i18n';
  interface Props {
    /** Le drapeau tel que le serveur l'a rendu. Absent = pas de pastille. */
    compilation?: boolean | null;
    /** Icône seule, pour les vignettes et les lignes de liste. */
    compact?: boolean;
  }
  let { compilation = false, compact = false }: Props = $props();
</script>
{#if compilation}
  <span class="cpl" class:compact
    title={$t('v2.album.compilationHint' as any)}
    aria-label={compact ? $t('v2.album.compilation' as any) : undefined}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="14" r="6" /><circle cx="12" cy="14" r="1.4" />
      <path d="M6.5 6.5h11" /><path d="M8.5 3.5h7" />
    </svg>
    {#if !compact}<span class="lbl">{$t('v2.album.compilation' as any)}</span>{/if}
  </span>
{/if}
<style>
  .cpl{display:inline-flex; align-items:center; gap:6px; flex:0 0 auto;
    border-radius:var(--v2-r-pill); border:1px solid var(--v2-acc2);
    background:var(--v2-acc-soft); color:var(--v2-acc-tint);
    padding:3px 9px; font:700 10px var(--v2-mono); letter-spacing:.04em;
    text-transform:uppercase; white-space:nowrap}
  .cpl svg{width:13px; height:13px; flex:0 0 auto}
  /* Compacte, la pastille devient CARRÉE autour de son icône : une pilule
     vide de texte se lirait comme un libellé tronqué. */
  .compact{padding:3px; border-radius:6px; gap:0}
  .lbl{line-height:1}
</style>
