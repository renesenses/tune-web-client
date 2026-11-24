import type { Track } from './types';
import { pisteDeFile } from './pisteDeFile';

export interface LigneFile {
  cle: string; debut: number; nombre: number; album: boolean;
  piste: Track; duree: number; parent?: string;
}
function albumDe(p: Track): string | null {
  const source = p.source ?? 'local';
  if (source === 'local' && p.album_id != null) return `local:${p.album_id}`;
  if (p.album_id_service) return `${source}:${p.album_id_service}`;
  return null; // Ne pas confondre deux albums homonymes sur leur seul titre.
}
/** Les seules lignes rendues ; les pistes masquées ne coûtent pas de DOM. */
export function lignesDeFile(file: Track[], position: number, ouverts: ReadonlySet<string>): LigneFile[] {
  const lignes: LigneFile[] = [];
  for (let i = position + 1; i < file.length;) {
    const identite = albumDe(file[i]);
    let fin = i + 1;
    if (identite) while (fin < file.length && albumDe(file[fin]) === identite) fin++;
    const groupe = identite != null && fin - i > 1;
    const cle = `${groupe ? 'album' : 'piste'}:${file[i].id ?? i}`;
    const ligne = (n: number, parent?: string): LigneFile => ({ cle:`piste:${file[n].id ?? n}`, debut:n, nombre:1, album:false, piste:pisteDeFile(file[n]), duree:file[n].duration_ms ?? 0, parent });
    if (groupe) {
      lignes.push({ cle, debut:i, nombre:fin-i, album:true, piste:pisteDeFile(file[i]), duree:file.slice(i,fin).reduce((s,p) => s+(p.duration_ms ?? 0),0) });
      if (ouverts.has(cle)) for (let n=i; n<fin; n++) lignes.push(ligne(n,cle));
    } else lignes.push(ligne(i));
    i=fin;
  }
  return lignes;
}
export function rangApresDepot(source: LigneFile, cible: LigneFile): number {
  if (cible.debut < source.debut + source.nombre && cible.debut + cible.nombre > source.debut) return source.debut;
  return cible.debut > source.debut ? cible.debut + cible.nombre - source.nombre : cible.debut;
}
export function voisine(lignes: LigneFile[], cible: LigneFile, sens: -1 | 1, source = cible): LigneFile | undefined {
  const possibles = lignes.filter(l => (!source.album || !l.parent)
    && (l.debut + l.nombre <= source.debut || l.debut >= source.debut + source.nombre)
    && (sens < 0 ? l.debut + l.nombre <= cible.debut : l.debut >= cible.debut + cible.nombre));
  return sens < 0 ? possibles[possibles.length - 1] : possibles[0];
}
