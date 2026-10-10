<script lang="ts">
  /**
   * tune-server-rust#2264 — dans Lecture en cours : quelle version joue
   * (source et qualité), et la mention « version de repli » quand la version
   * préférée était indisponible. Rien quand la piste lancée est celle qui
   * joue : la pastille de service et les puces de qualité le disent déjà.
   */
  import { t } from '../../lib/i18n';
  import { mentionVersion, type PisteVersion } from '../../lib/versionJouee';

  let { piste }: { piste: PisteVersion | null | undefined } = $props();
  let mention = $derived(mentionVersion(piste, (k) => $t(k as any)));
</script>

{#if mention}
  <span class="np-version" class:repli={mention.repli != null} title={mention.infobulle} data-version-jouee>
    <span class="texte">{mention.texte}</span>
    {#if mention.repli}<span class="mention-repli">{mention.repli}</span>{/if}
  </span>
{/if}

<style>
  .np-version{display:inline-flex; align-items:center; gap:6px; max-width:100%; padding:2px 9px; border-radius:999px;
    font-size:11px; line-height:1.6; color:var(--v2-txt2, #9ca3af); border:1px solid var(--v2-line2, rgba(255,255,255,.14));
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .np-version .texte{overflow:hidden; text-overflow:ellipsis}
  .np-version.repli{border-color:rgba(245,158,11,.45)}
  .mention-repli{font-weight:600; color:#f59e0b}
</style>
