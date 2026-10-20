/**
 * tune-server-rust#4805 (décision de Bertrand du 13/10/2026) — la passe de
 * NUIT de l'identification : `GET/POST /library/identify-all/nuit`. Elle
 * reprend, entre deux heures du matin et six heures et à débit réduit, les
 * albums que MusicBrainz a refusés (trop de requêtes) pendant une
 * identification. Éteinte par défaut.
 */

export interface BilanDeNuit {
  date: string;
  total: number;
  traites: number;
  identifies: number;
  encore_refuses: number;
  raison: string;
}

export interface ReglageNuit {
  active: boolean;
  debut: number;
  fin: number;
  refusEnAttente: number;
  derniereNuit: BilanDeNuit | null;
}

const entier = (v: unknown, defaut = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : defaut;

/** Lit la réponse brute du serveur ; `null` si elle n'a pas la forme attendue. */
export function lireReglageNuit(brut: unknown): ReglageNuit | null {
  if (!brut || typeof brut !== 'object') return null;
  const r = brut as Record<string, any>;
  if (typeof r.active !== 'boolean') return null;
  const n = r.derniere_nuit;
  const derniereNuit: BilanDeNuit | null =
    n && typeof n === 'object' && typeof n.date === 'string'
      ? {
          date: n.date,
          total: entier(n.total),
          traites: entier(n.traites),
          identifies: entier(n.identifies),
          encore_refuses: entier(n.encore_refuses),
          raison: typeof n.raison === 'string' ? n.raison : '',
        }
      : null;
  return {
    active: r.active,
    debut: entier(r.fenetre?.debut, 2),
    fin: entier(r.fenetre?.fin, 6),
    refusEnAttente: entier(r.refus_en_attente),
    derniereNuit,
  };
}

/** Les lignes d'aide : la fenêtre, la file d'attente, le bilan de la dernière nuit. */
export function lignesDeNuit(
  r: ReglageNuit,
  tr: (k: string) => string,
  fmt: (n: number) => string,
): string[] {
  const lignes = [
    tr('v2.nuit.hint').replace('{debut}', String(r.debut)).replace('{fin}', String(r.fin)),
    tr('v2.nuit.pending').replace('{n}', fmt(r.refusEnAttente)),
  ];
  if (r.derniereNuit) {
    lignes.push(
      tr('v2.nuit.last')
        .replace('{date}', r.derniereNuit.date)
        .replace('{identifies}', fmt(r.derniereNuit.identifies))
        .replace('{traites}', fmt(r.derniereNuit.traites)),
    );
  }
  return lignes;
}
