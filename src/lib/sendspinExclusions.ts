/**
 * Liste d'exclusion des enceintes Sendspin (tune-server-rust #3326, décision
 * de Bertrand du 10/10/2026, serveur rc4).
 *
 * Une enceinte qui appartient à un autre serveur (Music Assistant, par
 * exemple) ne doit pas être disputée par Tune. Le serveur ne compose jamais
 * vers une enceinte exclue et refuse sa connexion entrante.
 *
 * L'identité durable d'une enceinte est son `client_id` (clé publique), connu
 * seulement après un premier contact ; une annonce mDNS jamais contactée n'a
 * que son identifiant d'annonce. La case porte donc sur le `client_id` quand
 * il est connu, sinon sur l'annonce.
 */

/** Ce que rend `GET /devices/sendspin` (champs utiles ici). */
export interface ReponseSendspin {
  players?: Array<{
    id: string;
    name?: string;
    host?: string;
    port?: number;
    client_id?: string | null;
    excluded?: boolean;
  }>;
  handshaked?: Array<{ client_id: string; name?: string | null; excluded?: boolean }>;
  excluded?: string[];
}

export interface EnceinteSendspin {
  /** L'identifiant envoyé à `PUT /devices/sendspin/exclusions/{cle}`. */
  cle: string;
  nom: string;
  /** Adresse annoncée, quand l'enceinte est vue en mDNS. */
  adresse: string | null;
  exclue: boolean;
}

/**
 * Une ligne par enceinte : les annonces mDNS, puis les enceintes vues par
 * le protocole seulement (elles ont composé vers Tune), puis les exclusions
 * dont l'enceinte n'est plus visible — pour pouvoir les retirer.
 */
export function enceintesSendspin(r: ReponseSendspin): EnceinteSendspin[] {
  const exclues = new Set(r.excluded ?? []);
  const lignes: EnceinteSendspin[] = [];
  const vues = new Set<string>();
  for (const p of r.players ?? []) {
    const cle = p.client_id || p.id;
    const nomProtocole = (r.handshaked ?? []).find((h) => h.client_id === p.client_id)?.name;
    lignes.push({
      cle,
      nom: nomProtocole || p.name || cle,
      adresse: p.host ? `${p.host}:${p.port ?? ''}` : null,
      exclue: !!p.excluded || exclues.has(cle) || exclues.has(p.id),
    });
    vues.add(cle);
    vues.add(p.id);
  }
  for (const h of r.handshaked ?? []) {
    if (vues.has(h.client_id)) continue;
    lignes.push({ cle: h.client_id, nom: h.name || h.client_id, adresse: null, exclue: !!h.excluded || exclues.has(h.client_id) });
    vues.add(h.client_id);
  }
  for (const id of exclues) {
    if (vues.has(id)) continue;
    lignes.push({ cle: id, nom: id, adresse: null, exclue: true });
  }
  return lignes;
}
