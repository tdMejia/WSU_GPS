import assert from 'node:assert/strict';
import test from 'node:test';
import { buildings, resolveBuildingKey, resolveBuildingSearch } from './buildings.js';

test('resolves full names, short names, and Banner codes to the same building', () => {
  const fullName = resolveBuildingKey('M. Roy Wilson State Hall');
  const shortName = resolveBuildingKey('State Hall');
  const bannerCode = resolveBuildingKey('STAT');

  assert.equal(fullName.status, 'found');
  assert.equal(shortName.status, 'found');
  assert.equal(bannerCode.status, 'found');
  assert.equal(fullName.building.canonicalId, '65');
  assert.equal(shortName.building.canonicalId, fullName.building.canonicalId);
  assert.equal(bannerCode.building.canonicalId, fullName.building.canonicalId);
  assert.deepEqual(fullName.building.coordinates, { lat: 42.35736, lng: -83.06818 });
});

test('reports duplicate Banner codes as ambiguous instead of picking a building', () => {
  const result = resolveBuildingKey('HARP');

  assert.equal(result.status, 'ambiguous');
  assert.deepEqual(
    result.candidates.map((building) => building.canonicalId).sort(),
    ['33', '34'],
  );
});

test('returns not-found for unknown building keys', () => {
  assert.deepEqual(resolveBuildingKey('Not a Wayne State building'), { status: 'not-found' });
});

test('attaches published classroom rooms and inferred floor levels to their buildings', () => {
  const stateHall = buildings.find((building) => building.canonicalId === '65');
  const oldMain = buildings.find((building) => building.canonicalId === '50');
  const ugl = buildings.find((building) => building.canonicalId === '70');

  assert.equal(stateHall.classrooms.length, 59);
  assert.equal(oldMain.classrooms.length, 33);
  assert.equal(ugl.classrooms.length, 6);

  const stateRoom = stateHall.classrooms.find((room) => room.roomNumber === '4118');
  assert.equal(stateRoom.floorLevel, 4);
  assert.equal(stateRoom.floorLevelBasis, 'inferred-from-leading-digit');

  const namedUglRoom = ugl.classrooms.find((room) => room.name === 'Bernath Auditorium');
  assert.equal(namedUglRoom.roomNumber, null);
  assert.equal(namedUglRoom.floorLevel, 1);
  assert.equal(namedUglRoom.floorLevelBasis, 'published-location');

  const unknownUglRoom = ugl.classrooms.find((room) => room.name === 'Lab B');
  assert.equal(unknownUglRoom.floorLevel, null);
  assert.equal(unknownUglRoom.floorLevelBasis, 'not-published');
});

test('exposes observed room ranges without treating gaps as valid rooms', () => {
  const stateHall = buildings.find((building) => building.canonicalId === '65');
  const floorOne = stateHall.roomNumberRanges.find((range) => range.floorLevel === 1);

  assert.equal(floorOne.minRoomNumber, '1101');
  assert.equal(floorOne.maxRoomNumber, '1216');
  assert.equal(floorOne.validRoomNumbers.length, 12);
  assert.equal(floorOne.validRoomNumbers.includes('1102'), false);
});

test('resolves a building and room number together for map search', () => {
  const result = resolveBuildingSearch('State Hall 201');

  assert.equal(result.status, 'room-found');
  assert.equal(result.building.canonicalId, '65');
  assert.equal(result.classroom.roomNumber, '0201');
  assert.equal(result.classroom.floorLevel, 0);
});

test('does not silently accept room numbers absent from the directory', () => {
  const result = resolveBuildingSearch('State Hall 1102');

  assert.equal(result.status, 'room-not-found');
  assert.equal(result.roomNumber, '1102');
  assert.equal(result.roomNumberRanges.some((range) => range.validRoomNumbers.includes('1102')), false);
});
