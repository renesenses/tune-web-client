<script lang="ts">
  /**
   * Bouton « Importer » d'un fichier de playlist (.m3u, .m3u8, .dpl).
   *
   * Partagé par l'écran Playlists (`PlaylistsV2`) et par le Gestionnaire de
   * playlists (`PlaylistManagerView`, l'écran que la barre latérale ouvre
   * vraiment) : en rc9 le bouton n'était que sur le premier, qu'aucune entrée
   * ne montrait (Régis, r5yk5). Une seule logique, deux emplacements.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';
  import { errText } from '../../lib/utils';
  import { bilanImportM3u } from '../../lib/bilanImportM3u';

  let { onimporte = () => {}, classe = 'ghost' }: { onimporte?: () => void; classe?: string } = $props();

  let importEnCours = $state(false);
  async function importer(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = ''; // sinon le même fichier ne peut pas être rechoisi
    if (!f || importEnCours) return;
    importEnCours = true;
    try {
      // Une playlist Linn (`.dpl`, Pierre Mack) a sa propre route, qui
      // rapproche les pistes et crée la playlist d'un coup.
      if (f.name.toLowerCase().endsWith('.dpl')) {
        const l = await api.importLinnPlaylist(f);
        notifications.success(`${l.name} — ${l.matched}/${l.total_entries}`);
        onimporte();
        return;
      }
      const r = await api.importPlaylistFile(f);
      // On annonce ce qui est RAPPROCHÉ, pas « importé » : une ligne du M3U
      // qui ne correspond à aucun fichier de la bibliothèque n'entre pas.
      // web#2526 : le compte vient de `total_entries` / `not_found`, les
      // champs que le serveur envoie vraiment (voir `lib/bilanImportM3u`).
      const b = bilanImportM3u(r);
      notifications.success(`${$t('v2.pl.importDone' as any)} — ${b.rapprochees}/${b.total}`);
      onimporte();
    } catch (e: any) {
      notifications.error(errText(e) ?? $t('common.error' as any));
    } finally {
      importEnCours = false;
    }
  }
</script>

<!-- Import M3U : `POST /playlists/import/m3u`, la route qui lit vraiment un
     fichier (l'ancienne fonction du client visait `/playlist-manager/import`,
     qui attend du JSON et ne pouvait répondre que 415). -->
<label class="{classe} import-fichier" class:occupe={importEnCours}>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M8 8l4-4 4 4M4 18v2h16v-2"/></svg>
  {importEnCours ? $t('common.loading' as any) : $t('v2.pl.import' as any)}
  <input type="file" accept=".m3u,.m3u8,.dpl" onchange={importer} disabled={importEnCours} />
</label>

<style>
  .import-fichier{position:relative; display:inline-flex; align-items:center; gap:7px; cursor:pointer;
    border:1px solid var(--v2-line2, var(--tune-border, #444)); border-radius:var(--v2-r-pill, 999px);
    background:transparent; color:var(--v2-txt2, inherit); font:600 13px var(--v2-sans, inherit); padding:8px 14px}
  .import-fichier:hover{color:var(--v2-txt, inherit); background:var(--v2-hover, transparent)}
  .import-fichier.occupe{opacity:.6; cursor:default}
  .import-fichier svg{width:15px; height:15px}
  /* Le champ de fichier est invisible mais RESTE cliquable : c'est lui qui
     ouvre le sélecteur, un bouton ne peut pas le faire à sa place. */
  .import-fichier input[type=file]{position:absolute; inset:0; opacity:0; cursor:pointer; width:100%}
</style>
