import { useEffect, useRef, useState } from 'react';
import { LngLatBounds, Map as MapLibreMap, Marker, Popup, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { fetchWalkingRoute } from './directions.js';
import { resolveBuildingSearch } from './data/buildings.js';
import './Map.css';

setWorkerUrl(workerUrl);

const defaultCenter = [-83.06818, 42.35736];
const mapStyle = 'https://tiles.openfreemap.org/styles/liberty';

function clearWalkingRoute(map) {
  if (map.getLayer('walking-route-line')) map.removeLayer('walking-route-line');
  if (map.getSource('walking-route')) map.removeSource('walking-route');
}

function showWalkingRoute(map, coordinates) {
  const feature = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates },
  };
  const source = map.getSource('walking-route');

  if (source) {
    source.setData(feature);
  } else {
    map.addSource('walking-route', { type: 'geojson', data: feature });
  }

  if (!map.getLayer('walking-route-line')) {
    map.addLayer({
      id: 'walking-route-line',
      type: 'line',
      source: 'walking-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#1769e0', 'line-width': 5, 'line-opacity': 0.9 },
    });
  }

  const bounds = coordinates.reduce(
    (result, coordinate) => result.extend(coordinate),
    new LngLatBounds(coordinates[0], coordinates[0]),
  );
  map.fitBounds(bounds, { padding: 48, maxZoom: 18 });
}

function Map() {
  const mapElement = useRef(null);
  const mapRef = useRef(null);
  const locationMarkerRef = useRef(null);
  const buildingMarkerRef = useRef(null);
  const startMarkerRef = useRef(null);
  const latestLocationRef = useRef(null);
  const routeControllerRef = useRef(null);
  const hasSearchedRef = useRef(false);
  const [mapStatus, setMapStatus] = useState('loading');
  const [locationStatus, setLocationStatus] = useState('requesting');
  const [buildingQuery, setBuildingQuery] = useState('');
  const [searchStatus, setSearchStatus] = useState('');
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [startMode, setStartMode] = useState('current');
  const [startBuildingQuery, setStartBuildingQuery] = useState('');
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [routeResult, setRouteResult] = useState(null);

  useEffect(() => {
    let active = true;
    let watchId;
    let map;
    let mapLoaded = false;

    try {
      map = new MapLibreMap({
        container: mapElement.current,
        style: mapStyle,
        center: defaultCenter,
        zoom: 15,
      });
      mapRef.current = map;

      map.on('load', () => {
        if (!active) return;
        mapLoaded = true;
        setMapStatus('ready');
      });

      map.on('error', (event) => {
        console.error('OpenFreeMap could not load map data.', event.error);
        if (active && !mapLoaded) setMapStatus('error');
      });

      if (!navigator.geolocation) {
        setLocationStatus('unsupported');
      } else {
        watchId = navigator.geolocation.watchPosition(
          ({ coords }) => {
            if (!active) return;
            const position = [coords.longitude, coords.latitude];
            latestLocationRef.current = { lat: coords.latitude, lng: coords.longitude };

            if (!locationMarkerRef.current) {
              locationMarkerRef.current = new Marker().setLngLat(position).addTo(map);
              if (!hasSearchedRef.current) map.setCenter(position);
            } else {
              locationMarkerRef.current.setLngLat(position);
            }

            setLocationStatus('tracking');
          },
          (error) => {
            if (!active) return;
            setLocationStatus(error.code === 1 ? 'denied' : 'unavailable');
          },
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
        );
      }
    } catch (error) {
      console.error('Map could not be initialized.', error);
      setMapStatus('error');
    }

    return () => {
      active = false;
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      routeControllerRef.current?.abort();
      mapRef.current = null;
      locationMarkerRef.current = null;
      buildingMarkerRef.current = null;
      startMarkerRef.current = null;
      map?.remove();
    };
  }, []);

  function handleBuildingSearch(event) {
    event.preventDefault();
    const result = resolveBuildingSearch(buildingQuery);

    if (result.status === 'not-found') {
      setSearchStatus('No building with published coordinates matches that name or code.');
      return;
    }

    if (result.status === 'ambiguous') {
      const names = result.candidates.map((building) => building.name).join(' or ');
      setSearchStatus(`That code matches ${names}. Search by full building name.`);
      return;
    }

    if (result.status === 'room-not-found') {
      if (result.roomNumberRanges.length === 0) {
        setSearchStatus(`No numbered classroom rooms are listed for ${result.building.name}.`);
      } else {
        const ranges = result.roomNumberRanges
          .map((range) => `Floor ${range.floorLevel} (inferred): ${range.minRoomNumber}-${range.maxRoomNumber}`)
          .join('; ');
        setSearchStatus(
          `Room ${result.roomNumber} is not listed for ${result.building.name}. Observed ranges: ${ranges}. Only listed room numbers are accepted; gaps may be invalid.`,
        );
      }
      return;
    }

    const { building } = result;
    const { lat, lng } = building.coordinates;
    const map = mapRef.current;
    hasSearchedRef.current = true;

    if (!map) {
      setSearchStatus('The map is not ready yet. Try again in a moment.');
      return;
    }

    const classroom = result.status === 'room-found' ? result.classroom : null;
    const popupLabel = classroom
      ? `${building.name}, Room ${classroom.roomNumber} (inferred floor ${classroom.floorLevel})`
      : building.name;

    routeControllerRef.current?.abort();
    routeControllerRef.current = null;
    setRouteLoading(false);
    setRouteError('');
    setRouteResult(null);
    clearWalkingRoute(map);
    startMarkerRef.current?.remove();
    startMarkerRef.current = null;
    setSelectedDestination({ building, classroom });

    buildingMarkerRef.current?.remove();
    buildingMarkerRef.current = new Marker({ color: '#b42318' })
      .setLngLat([lng, lat])
      .setPopup(new Popup().setText(popupLabel))
      .addTo(map);

    map.flyTo({ center: [lng, lat], zoom: 18, essential: true });
    buildingMarkerRef.current.togglePopup();
    setSearchStatus(
      classroom
        ? `Showing Room ${classroom.roomNumber}, inferred floor ${classroom.floorLevel}, in ${building.name}. The pin marks the building, not the room.`
        : `Showing ${building.name}.`,
    );
  }

  async function handleDirectionsSubmit(event) {
    event.preventDefault();
    setRouteError('');
    setRouteResult(null);

    const map = mapRef.current;
    if (!map || mapStatus !== 'ready') {
      setRouteError('The map is not ready yet. Try again in a moment.');
      return;
    }
    if (!selectedDestination) {
      setRouteError('Search for a destination building first.');
      return;
    }

    let origin;
    let originLabel;
    let startBuilding;

    if (startMode === 'current') {
      origin = latestLocationRef.current;
      if (!origin) {
        setRouteError('Your current location is not available. Allow location access or choose another building as the start.');
        return;
      }
      originLabel = 'your current location';
    } else {
      const startResult = resolveBuildingSearch(startBuildingQuery);
      if (startResult.status === 'not-found') {
        setRouteError('No start building with published coordinates matches that name or code.');
        return;
      }
      if (startResult.status === 'ambiguous') {
        setRouteError(`That start code matches ${startResult.candidates.map((building) => building.name).join(' or ')}. Search by full building name.`);
        return;
      }
      if (startResult.status === 'room-not-found') {
        setRouteError(`Room ${startResult.roomNumber} is not listed for ${startResult.building.name}.`);
        return;
      }

      startBuilding = startResult.building;
      origin = startBuilding.coordinates;
      originLabel = startResult.status === 'room-found'
        ? `Room ${startResult.classroom.roomNumber} in ${startBuilding.name}`
        : startBuilding.name;
    }

    routeControllerRef.current?.abort();
    const controller = new AbortController();
    routeControllerRef.current = controller;
    setRouteLoading(true);
    clearWalkingRoute(map);
    startMarkerRef.current?.remove();
    startMarkerRef.current = null;

    try {
      const route = await fetchWalkingRoute(
        origin,
        selectedDestination.building.coordinates,
        controller.signal,
      );
      if (controller.signal.aborted) return;

      showWalkingRoute(map, route.coordinates);
      if (startBuilding) {
        startMarkerRef.current = new Marker({ color: '#188038' })
          .setLngLat([startBuilding.coordinates.lng, startBuilding.coordinates.lat])
          .setPopup(new Popup().setText(`Start: ${startBuilding.name}`))
          .addTo(map);
      }

      const destinationLabel = selectedDestination.classroom
        ? `Room ${selectedDestination.classroom.roomNumber} in ${selectedDestination.building.name}`
        : selectedDestination.building.name;

      setRouteResult({ ...route, originLabel, destinationLabel });
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('Walking directions could not be loaded.', error);
      setRouteError(`Walking directions unavailable: ${error.message}`);
    } finally {
      if (routeControllerRef.current === controller) {
        routeControllerRef.current = null;
        setRouteLoading(false);
      }
    }
  }

  let message = '';
  if (mapStatus === 'loading') {
    message = 'Loading map...';
  } else if (mapStatus === 'error') {
    message = 'Map could not load. Check your internet connection and try again.';
  } else if (locationStatus === 'requesting') {
    message = 'Requesting location access...';
  } else if (locationStatus === 'tracking') {
    message = 'Showing your current location.';
  } else if (locationStatus === 'denied') {
    message = 'Location access was denied. The map is centered on Wayne State University.';
  } else if (locationStatus === 'unsupported') {
    message = 'Location is not supported by this browser. The map is centered on Wayne State University.';
  } else if (locationStatus === 'unavailable') {
    message = 'Your location is unavailable. The map is centered on Wayne State University.';
  }

  return (
    <section className="map-section" aria-label="Interactive map">
      <form className="building-search" onSubmit={handleBuildingSearch}>
        <label htmlFor="building-search-input">Find a building or classroom</label>
        <div className="building-search-controls">
          <input
            id="building-search-input"
            type="search"
            value={buildingQuery}
            onChange={(event) => setBuildingQuery(event.target.value)}
            placeholder="Building, Banner code, or e.g. State Hall 0201"
            required
          />
          <button type="submit">Search</button>
        </div>
        {searchStatus && (
          <p className="building-search-status" role="status">
            {searchStatus}
          </p>
        )}
      </form>

      <form className="directions-panel" onSubmit={handleDirectionsSubmit}>
        <h2>Walking directions</h2>
        <p>
          {selectedDestination
            ? `Destination: ${selectedDestination.classroom ? `Room ${selectedDestination.classroom.roomNumber} in ` : ''}${selectedDestination.building.name}`
            : 'Search for a destination building first.'}
        </p>
        <fieldset className="start-location-options">
          <legend>Start from</legend>
          <label>
            <input
              type="radio"
              name="start-location"
              value="current"
              checked={startMode === 'current'}
              onChange={() => setStartMode('current')}
            />
            My current location
          </label>
          <label>
            <input
              type="radio"
              name="start-location"
              value="building"
              checked={startMode === 'building'}
              onChange={() => setStartMode('building')}
            />
            Another building
          </label>
        </fieldset>
        {startMode === 'building' && (
          <div className="start-building-field">
            <label htmlFor="start-building-input">Starting building or room</label>
            <input
              id="start-building-input"
              type="search"
              value={startBuildingQuery}
              onChange={(event) => setStartBuildingQuery(event.target.value)}
              placeholder="Building, Banner code, or room"
              required
            />
          </div>
        )}
        <p className="routing-disclosure">
          Walking routes are calculated by{' '}
          <a href="https://valhalla.openstreetmap.de/" target="_blank" rel="noreferrer">
            Valhalla
          </a>
          . Start and destination coordinates are sent to that service when you request directions.
          Routes end at the building location, not at an indoor room.
        </p>
        <button type="submit" disabled={!selectedDestination || mapStatus !== 'ready' || routeLoading}>
          {routeLoading ? 'Finding walking route...' : 'Get walking directions'}
        </button>
        {routeError && (
          <p className="directions-error" role="alert">
            {routeError}
          </p>
        )}
        {routeResult && (
          <div className="route-details" aria-live="polite">
            <p>
              Walking route from {routeResult.originLabel} to {routeResult.destinationLabel}
              {Number.isFinite(routeResult.distanceMiles) && `: ${routeResult.distanceMiles.toFixed(1)} miles`}
              {Number.isFinite(routeResult.durationSeconds) && `, about ${Math.max(1, Math.round(routeResult.durationSeconds / 60))} minutes`}.
            </p>
            {routeResult.instructions.length > 0 && (
              <ol>
                {routeResult.instructions.map((instruction, index) => (
                  <li key={`${index}-${instruction}`}>{instruction}</li>
                ))}
              </ol>
            )}
          </div>
        )}
      </form>

      <div className="map-frame">
        <div className="map-canvas" ref={mapElement} />
        {message && (
          <p className="map-status" role="status">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}

export default Map;
