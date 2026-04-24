// MapView
// Map view component for ReviewScreen (lazy-loaded react-native-maps)

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { COLORS } from '../../config/constants';
import { TEXT_STYLES } from '../../config/typography';
import { Entry } from '../../models/Entry';
import { logger } from '../../utils/logger';
import MapPinMarker, { PIN_WIDTH, PIN_HEIGHT } from '../common/MapPinMarker';

interface MapViewProps {
  entries: Entry[];
  onEntryPress: (entry: Entry) => void;
}

const MapView: React.FC<MapViewProps> = ({ entries, onEntryPress }) => {
  const [MapViewComponent, setMapViewComponent] = useState<any>(null);
  const [Marker, setMarker] = useState<any>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    // Lazy-load react-native-maps
    const loadMap = async () => {
      try {
        const mapModule = await import('react-native-maps');
        setMapViewComponent(() => mapModule.default);
        setMarker(() => mapModule.Marker);
        setMapReady(true);
      } catch (error) {
        logger.error('Failed to load react-native-maps:', error);
      }
    };
    
    loadMap();
  }, []);

  // Filter entries with location data
  const entriesWithLocation = entries.filter(
    entry => entry.latitude !== undefined && entry.longitude !== undefined
  );

  // Calculate map region
  const getMapRegion = () => {
    if (entriesWithLocation.length === 0) {
      return {
        latitude: 37.78825,
        longitude: -122.4324,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      };
    }

    const latitudes = entriesWithLocation.map(e => e.latitude!);
    const longitudes = entriesWithLocation.map(e => e.longitude!);
    
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);

    const latDelta = (maxLat - minLat) * 1.5 || 0.0922;
    const lngDelta = (maxLng - minLng) * 1.5 || 0.0421;

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(latDelta, 0.0922),
      longitudeDelta: Math.max(lngDelta, 0.0421),
    };
  };

  if (!mapReady || !MapViewComponent || !Marker) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Loading map...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapViewComponent
        style={styles.map}
        initialRegion={getMapRegion()}
        showsUserLocation={true}
        showsMyLocationButton={false}
      >
        {entriesWithLocation.map((entry) => (
          <Marker
            key={entry.id}
            coordinate={{
              latitude: entry.latitude!,
              longitude: entry.longitude!,
            }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
            title={entry.title || 'Untitled Entry'}
            onPress={() => onEntryPress(entry)}
          >
            <MapPinMarker color={COLORS.zinc700} width={PIN_WIDTH} height={PIN_HEIGHT} />
          </Marker>
        ))}
      </MapViewComponent>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.neutral900,
  },
  map: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    backgroundColor: COLORS.stone500,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    ...TEXT_STYLES.entryInput,
    color: COLORS.white,
  },
});

export default MapView;
