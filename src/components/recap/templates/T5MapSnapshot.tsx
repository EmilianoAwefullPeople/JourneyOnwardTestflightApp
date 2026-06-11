import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, StyleSheet, Text, View } from 'react-native';
import { FONTS, FONT_WEIGHTS } from '../../../config/constants';

const { width: SW, height: SH } = Dimensions.get('window');

interface LocationPin {
  latitude: number;
  longitude: number;
  label?: string;
}

interface T5MapSnapshotProps {
  locations: LocationPin[];
  cityList: string[];
}

interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

function computeRegion(locations: LocationPin[]): Region {
  if (locations.length === 0) {
    return { latitude: 20, longitude: 0, latitudeDelta: 60, longitudeDelta: 60 };
  }
  if (locations.length === 1) {
    return { latitude: locations[0].latitude, longitude: locations[0].longitude, latitudeDelta: 0.5, longitudeDelta: 0.5 };
  }
  const lats = locations.map((l) => l.latitude);
  const lngs = locations.map((l) => l.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latPad = Math.max((maxLat - minLat) * 0.3, 0.3);
  const lngPad = Math.max((maxLng - minLng) * 0.3, 0.3);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: maxLat - minLat + latPad,
    longitudeDelta: maxLng - minLng + lngPad,
  };
}

const MAP_HEIGHT = SH * 0.55;

const T5MapSnapshot: React.FC<T5MapSnapshotProps> = ({ locations, cityList }) => {
  const [MapView, setMapView] = useState<any>(null);
  const [Marker, setMarker] = useState<any>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    // Async dynamic import matches InteractiveMap.tsx and MapView.tsx patterns —
    // react-native-maps cannot be statically required in this project (Expo Go).
    import('react-native-maps')
      .then((mod) => {
        setMapView(() => mod.default);
        setMarker(() => mod.Marker);
        setMapReady(true);
      })
      .catch(() => {
        setMapReady(false);
      });
  }, []);

  const region = useMemo(() => computeRegion(locations), [locations]);
  const displayCities = cityList.filter(Boolean).slice(0, 5);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>your journey</Text>
      <View style={styles.mapWrap}>
        {mapReady && MapView ? (
          <MapView
            style={styles.map}
            initialRegion={region}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            pointerEvents="none"
          >
            {Marker
              ? locations.map((loc, i) => (
                  <Marker
                    key={i}
                    coordinate={{ latitude: loc.latitude, longitude: loc.longitude }}
                    title={loc.label}
                    pinColor="#fed86d"
                  />
                ))
              : null}
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <ActivityIndicator color="rgba(255,255,255,0.4)" />
          </View>
        )}
      </View>
      {displayCities.length > 0 ? (
        <Text style={styles.cities}>{displayCities.join('  ·  ')}</Text>
      ) : (
        <Text style={styles.cities}>{locations.length} locations</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: SW,
    height: SH,
    backgroundColor: '#141212',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  title: {
    fontFamily: FONTS.inter,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 20,
  },
  mapWrap: {
    width: SW - 32,
    height: MAP_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cities: {
    fontFamily: FONTS.inter,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.regular,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 20,
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default T5MapSnapshot;
