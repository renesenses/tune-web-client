// tune-server-rust#8487 et web#3203 — les titres DIFFUSÉS par une radio,
// notés par le serveur sous la ligne de leur station (`broadcast_titles`).
//
// FabienM, fil 2723 : un titre entendu sur une radio lancée depuis Android
// (« Rattlesnake », BBC Radio 6 Music) n'apparaissait pas dans l'historique
// web, qui ne montrait que la station : les titres ne vivaient que dans le
// carnet de chaque appareil. Le serveur les note désormais ; l'écran les
// range sous la station, sans doublon avec le carnet de ce navigateur. Et un
// conteneur fait des seules lignes du serveur porte le nom de la station au
// lieu de « sans nom » (web#3203).
import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from '../stores/history';
import { entreesDepuisServeur, fusionnerHistorique } from '../historiqueLecture';
import { contexteDeLEcoute, nomDObjet, regrouperParContexte, titresDuTiroir } from '../historiqueParContexte';

const FLUX = 'http://stream.example.test/bbc6';
const STATION = 'BBC Radio 6 Music';

/** La ligne de station que le serveur sert (#7965), et ses titres (#8487). */
function ligneDeStation(titres: any[] = []) {
  return {
    id: 7, track_id: null, title: STATION, artist_name: null, album_title: null,
    source: 'radio', source_id: FLUX, duration_ms: 0, listened_at: '2026-11-18T09:14:00Z',
    zone_id: 4, cover_url: 'https://example.test/logo.png',
    context_type: 'radio', context_id: '12', context_source: 'radio', context_title: STATION,
    context_name: null, broadcast_titles: titres,
  };
}
const RATTLESNAKE = {
  zone_id: 4, title: 'Rattlesnake', artist_name: 'King Gizzard & the Lizard Wizard',
  cover_url: null, played_at: '2026-11-18T09:15:00Z',
};
const STARBURSTER = {
  zone_id: 4, title: 'Starburster', artist_name: 'Fontaines D.C.',
  cover_url: null, played_at: '2026-11-18T09:19:00Z',
};

/** Un titre noté par le carnet de CE navigateur (`noterSiDebutDEcoute`). */
function noteLocale(title: string, artist: string, playedAt: string): HistoryEntry {
  const track = { id: null, title, artist_name: artist, album_title: STATION, source: 'radio', source_id: FLUX } as any;
  return { track, playedAt, zoneName: 'Ce téléphone', zoneId: 4, contexte: contexteDeLEcoute(track, null) };
}

function conteneurs(entrees: HistoryEntry[]) {
  return regrouperParContexte(entrees).filter((n) => n.genre === 'objet') as any[];
}

describe('#8487 — titres diffusés servis par le serveur', () => {
  it('les titres de la station deviennent des entrées du conteneur de la station', () => {
    const e = entreesDepuisServeur([ligneDeStation([STARBURSTER, RATTLESNAKE])]);
    expect(e.map((x) => x.track.title)).toEqual([STATION, 'Starburster', 'Rattlesnake']);
    const [radio] = conteneurs(fusionnerHistorique([], e));
    expect(radio.type).toBe('radio');
    const nom = nomDObjet(radio.type, radio.entrees);
    expect(nom).toBe(STATION);
    // Le tiroir ne redit pas la station (web#2748) : il liste les deux titres.
    expect(titresDuTiroir(radio.type, radio.entrees, nom).map((x: any) => x.track.title))
      .toEqual(['Starburster', 'Rattlesnake']);
  });

  it('un titre noté des deux côtés ne sort qu’une fois, en mode titre comme en mode écoute', () => {
    const serveur = entreesDepuisServeur([ligneDeStation([RATTLESNAKE])]);
    const local = [noteLocale('Rattlesnake', 'King Gizzard & the Lizard Wizard', '2026-11-18T09:15:20.000Z')];
    for (const mode of ['titre', 'ecoute'] as const) {
      const r = fusionnerHistorique(local, serveur, mode);
      expect(r.filter((x) => x.track.title === 'Rattlesnake'), mode).toHaveLength(1);
      expect(conteneurs(r), mode).toHaveLength(1);
    }
  });

  it('un titre que le seul carnet connaît reste, et n’est pas absorbé par la ligne de la station', () => {
    const serveur = entreesDepuisServeur([ligneDeStation([RATTLESNAKE])]);
    const local = [noteLocale('Grace', 'Idles', '2026-11-18T09:17:00.000Z')];
    for (const mode of ['titre', 'ecoute'] as const) {
      const titres = fusionnerHistorique(local, serveur, mode).map((x) => x.track.title).sort();
      expect(titres, mode).toEqual(['Grace', 'Rattlesnake', STATION].sort());
    }
  });
});

describe('web#3203 — un conteneur de radio fait des seules lignes du serveur porte le nom de la station', () => {
  it('sans titre diffusé ni carnet, le conteneur s’appelle comme la station', () => {
    const [radio] = conteneurs(fusionnerHistorique([], entreesDepuisServeur([ligneDeStation()])));
    expect(nomDObjet(radio.type, radio.entrees)).toBe(STATION);
  });

  it('un serveur plus ancien (sans context_title) : le titre d’une ligne de station sans artiste', () => {
    const { context_title: _, ...ancienne } = ligneDeStation();
    const [radio] = conteneurs(fusionnerHistorique([], entreesDepuisServeur([ancienne])));
    expect(nomDObjet(radio.type, radio.entrees)).toBe(STATION);
  });
});

describe('#8487 (relecture) — plafond par niveau, nom de station', () => {
  it('cent titres diffusés sous UNE station n’évincent pas les autres écoutes', () => {
    const titres = Array.from({ length: 100 }, (_, i) => ({
      zone_id: 4, title: `Titre ${i}`, artist_name: 'X', cover_url: null,
      played_at: new Date(Date.parse('2026-11-18T12:00:00Z') - i * 60_000).toISOString(),
    }));
    const pistes = Array.from({ length: 150 }, (_, i) => ({
      id: 100 + i, track_id: 1000 + i, title: `Piste ${i}`, artist_name: 'Y', source: 'local',
      duration_ms: 180_000, listened_at: new Date(Date.parse('2026-11-17T12:00:00Z') - i * 60_000).toISOString(), zone_id: 1,
    }));
    const serveur = entreesDepuisServeur([{ ...ligneDeStation(titres), listened_at: '2026-11-18T09:00:00Z' }, ...pistes]);
    for (const mode of ['titre', 'ecoute'] as const) {
      const r = fusionnerHistorique([], serveur, mode);
      expect(r.filter((x) => x.track.source === 'local'), mode).toHaveLength(150);
      expect(r.filter((x) => x.track.source === 'radio'), mode).toHaveLength(101);
    }
  });

  it('une ligne de radio sans contexte de station ne prête pas son titre ICY comme nom', () => {
    const [e] = entreesDepuisServeur([{
      id: 9, track_id: null, title: 'Miles Davis - So What', artist_name: null, album_title: null,
      source: 'radio', source_id: FLUX, duration_ms: 0, listened_at: '2026-11-18T09:00:00Z', zone_id: 4,
      context_type: null, context_id: null, context_title: null,
    }]);
    expect(e.track.album_title ?? null).toBeNull();
  });
});
