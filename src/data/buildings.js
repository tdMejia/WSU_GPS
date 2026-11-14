import buildingRecords from './buildings.json' with { type: 'json' };
import classroomData from './classrooms.json' with { type: 'json' };

export const classrooms = classroomData.classrooms;

const classroomsByBuildingId = new Map();

for (const classroom of classrooms) {
  const buildingClassrooms = classroomsByBuildingId.get(classroom.buildingId) ?? [];
  buildingClassrooms.push(classroom);
  classroomsByBuildingId.set(classroom.buildingId, buildingClassrooms);
}

function getObservedRoomNumberRanges(buildingClassrooms) {
  const roomsByFloor = new Map();

  for (const classroom of buildingClassrooms) {
    if (!classroom.roomNumber) continue;

    const rooms = roomsByFloor.get(classroom.floorLevel) ?? [];
    rooms.push(classroom.roomNumber);
    roomsByFloor.set(classroom.floorLevel, rooms);
  }

  return [...roomsByFloor]
    .sort(([floorA], [floorB]) => floorA - floorB)
    .map(([floorLevel, roomNumbers]) => {
      const validRoomNumbers = [...new Set(roomNumbers)].sort();

      return {
        floorLevel,
        floorLevelBasis: 'inferred-from-leading-digit',
        minRoomNumber: validRoomNumbers[0],
        maxRoomNumber: validRoomNumbers.at(-1),
        validRoomNumbers,
      };
    });
}

export const buildings = buildingRecords.map((building) => {
  const buildingClassrooms = classroomsByBuildingId.get(building.canonicalId) ?? [];

  return {
    ...building,
    classrooms: buildingClassrooms,
    roomNumberRanges: getObservedRoomNumberRanges(buildingClassrooms),
  };
});

export function normalizeBuildingKey(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const candidatesByKey = new Map();

for (const building of buildings) {
  const aliases = [...building.aliases, building.code].filter(Boolean);

  for (const alias of aliases) {
    const key = normalizeBuildingKey(alias);
    const candidates = candidatesByKey.get(key) ?? [];

    if (!candidates.some((candidate) => candidate.canonicalId === building.canonicalId)) {
      candidates.push(building);
      candidatesByKey.set(key, candidates);
    }
  }
}

export const buildingLookup = Object.freeze(
  Object.fromEntries(
    [...candidatesByKey]
      .filter(([, candidates]) => candidates.length === 1)
      .map(([key, [building]]) => [key, building]),
  ),
);

export const ambiguousBuildingLookup = Object.freeze(
  Object.fromEntries(
    [...candidatesByKey].filter(([, candidates]) => candidates.length > 1),
  ),
);

export function resolveBuildingKey(value) {
  const key = normalizeBuildingKey(value);
  const ambiguousCandidates = ambiguousBuildingLookup[key];

  if (ambiguousCandidates) {
    return { status: 'ambiguous', candidates: ambiguousCandidates };
  }

  const building = buildingLookup[key];
  return building
    ? { status: 'found', building }
    : { status: 'not-found' };
}

export function resolveBuildingSearch(value) {
  const roomQuery = String(value ?? '').trim().match(/^(.+?)\s+(\d{3,4})$/);
  if (!roomQuery) return resolveBuildingKey(value);

  const buildingResult = resolveBuildingKey(roomQuery[1]);
  if (buildingResult.status !== 'found') return buildingResult;

  const roomNumber = roomQuery[2].padStart(4, '0');
  const classroom = buildingResult.building.classrooms.find(
    (candidate) => candidate.roomNumber === roomNumber,
  );

  return classroom
    ? { status: 'room-found', building: buildingResult.building, classroom }
    : {
        status: 'room-not-found',
        building: buildingResult.building,
        roomNumber,
        roomNumberRanges: buildingResult.building.roomNumberRanges,
      };
}
