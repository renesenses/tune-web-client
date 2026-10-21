<!--
  tune-server-rust#6001 — « Voir sur ProgArchives / Metal Archives / AllMusic ».
  Des liens seulement (arbitrage de Bertrand, 10/10/2026) : rien de ces sites
  n'est lu ni recopié. Rien ne s'affiche tant qu'il n'y a pas de lien sûr
  (`liensAffichables`) — ni titre vide, ni message d'erreur : un serveur
  antérieur, un artiste non identifié ou MusicBrainz muet laissent la fiche
  telle qu'elle était.
-->
<script lang="ts">
  import { t } from '../../lib/i18n';
  import { liensAffichables, type LienExterne, type ReponseLiens } from '../../lib/liensExternes';

  interface Props {
    /** Identifiant de l'objet : un changement relance le chargement. */
    cle: number | null | undefined;
    charger: (id: number) => Promise<ReponseLiens>;
  }
  let { cle, charger }: Props = $props();

  let liens = $state<LienExterne[]>([]);

  $effect(() => {
    const id = cle;
    let vivant = true;
    liens = [];
    if (id == null) return;
    charger(id)
      .then((r) => { if (vivant) liens = liensAffichables(r); })
      .catch(() => {});
    return () => { vivant = false; };
  });
</script>

{#if liens.length}
  <nav class="liens-externes" aria-label={$t('v2.liensExternes.titre')} data-liens-externes>
    {#each liens as l (l.url)}
      <a href={l.url} target="_blank" rel="noopener noreferrer external">{$t('v2.liensExternes.voirSur').replace('{site}', l.nom)}</a>
    {/each}
  </nav>
{/if}

<style>
  .liens-externes { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 6px 0; font-size: 13px; }
  .liens-externes a { color: var(--tune-accent); text-decoration: none; }
  .liens-externes a:hover { text-decoration: underline; }
</style>
