import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sidebar = readFileSync(
  resolve(__dirname, '../../components/Sidebar.svelte'),
  'utf-8',
);

/**
 * Les types de sortie que le serveur sait réellement router.
 *
 * Source : `TYPES_DE_SORTIE` dans `tune-server/src/routes/zones.rs` — la liste
 * que le PATCH d'une zone accepte, et que le commentaire du serveur décrit
 * comme « celles que l'orchestrateur sait router ». `sonos` n'en fait pas
 * partie, et `OutputType` (tune-core/src/discovery/device.rs) ne comporte
 * aucune variante Sonos.
 */
const TYPES_ROUTABLES = [
  'local',
  'browser',
  'dlna',
  'openhome',
  'chromecast',
  'bluos',
  'squeezebox',
  'oaat',
];

/** Le contenu du `<select class="create-zone-type">`, options comprises. */
function selecteurDeType(): string {
  const debut = sidebar.indexOf('class="create-zone-type"');
  expect(debut).toBeGreaterThanOrEqual(0);
  const fin = sidebar.indexOf('</select>', debut);
  expect(fin).toBeGreaterThan(debut);
  return sidebar.slice(debut, fin);
}

/** Les valeurs proposées à la création d'une zone. */
function typesProposes(): string[] {
  return [...selecteurDeType().matchAll(/<option value="([^"]+)"/g)].map(
    (m) => m[1],
  );
}

describe('création de zone : ne proposer que ce qui joue', () => {
  // Le cœur du défaut. Le client proposait « Sonos » à la création d'une zone.
  // Le POST /zones ne valide pas `output_type` : la zone était bel et bien
  // créée, persistée, affichée — et ne jouait nulle part, puisque
  // l'orchestrateur n'a aucun chemin `sonos`. Le premier PATCH la refusait
  // ensuite en 400. Une enceinte Sonos joue déjà par le type **DLNA**, où la
  // découverte la fait apparaître.
  it('« sonos » n’est pas offert comme type de zone', () => {
    expect(typesProposes()).not.toContain('sonos');
  });

  // Le sélecteur de haut-parleurs Sonos partait de la même promesse : il
  // listait /sonos/speakers pour remplir `output_device_id` d'une zone
  // impossible.
  it('aucun sélecteur d’enceintes Sonos ne subsiste dans la modale', () => {
    expect(sidebar).not.toContain("newZoneOutputType === 'sonos'");
    expect(sidebar).not.toContain('listSonosSpeakers');
  });

  // Contre-épreuve dans l'autre sens : tout ce qui reste proposé doit être
  // routable, à une exception nommée. `snapcast` souffre exactement du même
  // défaut (route serveur présente, aucune variante `OutputType`, absent de
  // `TYPES_DE_SORTIE`) mais relève d'un autre chantier ; il est listé ici pour
  // que sa suppression fasse tomber cette exception plutôt que de passer
  // inaperçue.
  it('tout autre type proposé est routable par le serveur', () => {
    const NON_TRAITE = ['snapcast', 'airplay'];
    const inconnus = typesProposes().filter(
      (t) => !TYPES_ROUTABLES.includes(t) && !NON_TRAITE.includes(t),
    );
    expect(inconnus).toEqual([]);
  });
});
