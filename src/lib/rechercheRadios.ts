// Les radios dans la recherche globale (tune-server-rust#7045, Rémi, rapport
// RC7 : « la recherche (loupe) ne trouve pas les radios »).
//
// Le serveur rend deux listes : « Mes radios » (`radios`) et l'annuaire
// (`radios_annuaire`). Une même station peut figurer dans les deux — la fiche
// de l'annuaire porte alors `my_radio_id`. L'écran n'en veut qu'UNE ligne.
import type { FicheAnnuaireRadio, RadiosTrouvees } from './api/annuaireRadios';
import type { RadioStation } from './types';

/** Une ligne de la section « Radios ». */
export interface EntreeRadio {
  cle: string;
  nom: string;
  logo: string | null;
  genre: string | null;
  /** Code pays ISO quand l'annuaire le donne, sinon le texte saisi. */
  pays: string | null;
  codec: string | null;
  bitrate: number | null;
  /** Identifiant dans « Mes radios », `null` si la station n'y est pas. */
  idLocal: number | null;
  /** Identifiant de la fiche de l'annuaire, `null` pour une saisie manuelle. */
  idAnnuaire: string | null;
  favori: boolean;
}

/**
 * Fusionne « Mes radios » et l'annuaire, sans doublon : « Mes radios » d'abord
 * (ce que l'on possède), puis les fiches de l'annuaire que l'on n'a pas — ou
 * que l'on a, mais que la recherche n'a trouvées que par la fiche (description,
 * mot-clé du diffuseur), auquel cas la ligne est celle de la station locale.
 */
export function entreesRadios(r: RadiosTrouvees): EntreeRadio[] {
  const sorties: EntreeRadio[] = [];
  const locales = new Set<number>();
  const fiches = new Map<number, FicheAnnuaireRadio>();
  for (const f of r.annuaire) if (f.my_radio_id != null) fiches.set(f.my_radio_id, f);
  for (const s of r.miennes) {
    if (s.id == null || locales.has(s.id)) continue;
    locales.add(s.id);
    const f = fiches.get(s.id);
    sorties.push({
      cle: `m${s.id}`,
      nom: s.name,
      logo: s.logo_url ?? f?.logo_url ?? null,
      genre: s.genre ?? f?.genre ?? null,
      pays: f?.country_code ?? s.country ?? null,
      codec: s.codec ?? f?.codec ?? null,
      // `bitrate` est servi par `/search` mais absent du type `RadioStation`.
      bitrate: (s as { bitrate?: number | null }).bitrate ?? f?.bitrate ?? null,
      idLocal: s.id,
      idAnnuaire: f?.external_id ?? null,
      favori: !!s.favorite,
    });
  }
  const vues = new Set<string>();
  for (const f of r.annuaire) {
    if (!f.external_id || vues.has(f.external_id)) continue;
    vues.add(f.external_id);
    if (f.my_radio_id != null && locales.has(f.my_radio_id)) continue;
    sorties.push({
      cle: `a${f.external_id}`,
      nom: f.name,
      logo: f.logo_url ?? null,
      genre: f.genre ?? null,
      pays: f.country_code ?? null,
      codec: f.codec ?? null,
      bitrate: f.bitrate ?? null,
      idLocal: f.my_radio_id ?? null,
      idAnnuaire: f.external_id,
      favori: !!f.my_radio_favorite,
    });
  }
  return sorties;
}

/** Une entrée mise à jour après un ajout à « Mes radios » ou un favori. */
export function entreeApres(e: EntreeRadio, st: RadioStation): EntreeRadio {
  return { ...e, idLocal: st.id ?? e.idLocal, favori: !!st.favorite };
}
