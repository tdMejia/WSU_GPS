# WSU_GPS

## Run locally

1. Install dependencies and start the dev server:

   ```sh
   npm install
   npm run dev
   ```

The map uses OpenFreeMap tiles through MapLibre GL JS and needs no API key. It starts centered on the current device location when browser location access is allowed. Otherwise, it starts at Wayne State University's State Hall in Detroit. Location access requires HTTPS or localhost.

Walking directions are requested from the selected start (current device location or another building) to the selected destination using the public Valhalla routing service. Coordinates are sent to Valhalla only when directions are requested. Routes end at building coordinates; indoor room routing is not available.

## Wayne State building lookup

`src/data/buildings.json` is a static snapshot of the public [Wayne State buildings directory](https://maps.wayne.edu/locations/buildings/) matched to its public campus-map building markers. The map search accepts normalized building names and Banner codes, then flies to the matched building and marks it. The lookup in `src/data/buildings.js` resolves these keys to the map's canonical building ID and building-level coordinates.

The source directory has 135 entries; 16 do not have published map coordinates and are omitted. The code `HARP` is assigned to two buildings in the source, so lookups report it as ambiguous rather than selecting one. Coordinates locate buildings, not individual rooms.

The public [classroom technology directory](https://tech.wayne.edu/help/classroom-directory) lists 59 State Hall classrooms, 33 Old Main classrooms, and six named UGL spaces. These are technology-equipped classroom listings, not a complete room inventory. State Hall and Old Main expose observed minimum/maximum room numbers per inferred floor in `roomNumberRanges`; the exact listed room numbers are retained, and gaps are not treated as valid. For four-digit room numbers, the first digit is an **inferred** floor level (`floorLevelBasis: "inferred-from-leading-digit"`). The [UGL reservable spaces page](https://library.wayne.edu/spaces-tech/reservable) explicitly gives floors for Lab A, Lab C, Bernath Auditorium, Bernath Seminar Room, and Community Room; Lab B's floor is not published there. Searching `Building name 1234` or `Building name 234` resolves an exact listed room and directs the map to the building; the map pin remains at the building coordinate, not inside the room.