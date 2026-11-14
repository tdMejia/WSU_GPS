export const WALKING_ROUTE_URL = 'https://valhalla1.openstreetmap.de/route';

export function decodePolyline6(encoded) {
  if (typeof encoded !== 'string' || encoded.length === 0) {
    throw new Error('The routing service returned an empty route shape.');
  }

  let index = 0;
  let latitude = 0;
  let longitude = 0;
  const coordinates = [];

  function readDelta() {
    let result = 0;
    let shift = 0;
    let byte;

    do {
      if (index >= encoded.length || shift > 30) {
        throw new Error('The routing service returned an invalid route shape.');
      }

      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) {
        throw new Error('The routing service returned an invalid route shape.');
      }
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    return result & 1 ? ~(result >> 1) : result >> 1;
  }

  while (index < encoded.length) {
    latitude += readDelta();
    longitude += readDelta();
    coordinates.push([longitude / 1e6, latitude / 1e6]);
  }

  if (coordinates.length < 2) {
    throw new Error('The routing service returned an incomplete route shape.');
  }

  return coordinates;
}

export async function fetchWalkingRoute(origin, destination, signal) {
  const params = new URLSearchParams({
    json: JSON.stringify({
      locations: [
        { lat: origin.lat, lon: origin.lng },
        { lat: destination.lat, lon: destination.lng },
      ],
      costing: 'pedestrian',
      units: 'miles',
    }),
  });
  const response = await fetch(`${WALKING_ROUTE_URL}?${params}`, { signal });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || `Routing service returned ${response.status}.`);
  }

  const leg = payload.trip?.legs?.[0];
  if (!leg?.shape) {
    throw new Error(payload.error || 'No walking route was returned for these locations.');
  }

  return {
    coordinates: decodePolyline6(leg.shape),
    distanceMiles: leg.summary?.length,
    durationSeconds: leg.summary?.time,
    instructions: (leg.maneuvers ?? [])
      .map((maneuver) => maneuver.instruction)
      .filter(Boolean),
  };
}
