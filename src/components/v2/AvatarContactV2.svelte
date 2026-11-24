<script lang="ts">
  /**
   * rc14 — le contenu de l'avatar d'un contact Tune Circle : sa photo de profil
   * quand le cloud en rend une, sinon ses initiales. La pastille (rond, taille,
   * fond) reste à l'appelant. La photo n'entre dans le DOM qu'après
   * `urlAvatarSure` (https seulement) ; une image qui échoue rend la main aux
   * initiales. `alt` vide quand le nom est affiché juste à côté.
   */
  import { urlAvatarSure } from '../../lib/circle';

  let { url = null, initiales, alt = '' }: {
    url?: string | null;
    initiales: string;
    alt?: string;
  } = $props();

  const sure = $derived(urlAvatarSure(url));
  /** L'URL dont le chargement a échoué : une autre URL retente sa chance. */
  let enEchec = $state<string | null>(null);
  const photo = $derived(sure !== null && sure !== enEchec ? sure : null);
</script>

{#if photo}<img class="photo-contact" src={photo} {alt} loading="lazy" referrerpolicy="no-referrer" onerror={() => { enEchec = photo; }} />{:else}{initiales}{/if}

<style>
  .photo-contact{width:100%; height:100%; border-radius:50%; object-fit:cover; display:block}
</style>
