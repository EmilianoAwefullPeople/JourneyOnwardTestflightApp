// InteractiveMap
// Interactive map component with entry location pins
// Rebuilt from scratch: TestFlight (native maps) + Expo Go (WebView fallback)
// Responsive design for iOS devices (iPhone 10+)

import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Animated, Easing, Platform, Dimensions } from 'react-native';
import type { Region } from 'react-native-maps';
import type { WebViewMessageEvent } from 'react-native-webview';
import type { WebViewErrorEvent, WebViewHttpErrorEvent } from 'react-native-webview/lib/WebViewTypes';
import { COLORS, SPACING } from '../../config/constants';
import { TEXT_STYLES } from '../../config/typography';
import { Entry } from '../../models/Entry';
import { logger } from '../../utils/logger';
import MapPinMarker, { PIN_WIDTH, PIN_HEIGHT } from '../common/MapPinMarker';
import LoadingSpinner from '../common/LoadingSpinner';

interface InteractiveMapProps {
  entries: Entry[];
  onEntryPress?: (entry: Entry) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  useFullHeight?: boolean; // For Review screen - makes map fill available height
  showEntryPins?: boolean; // When false, only blue dot (user); no green pins. Default true for backward compatibility.
}

interface UserLocation {
  latitude: number;
  longitude: number;
}

// Ease-out curve: fast start, smooth deceleration as it approaches target (polished landing)
const MAP_ANIM_EASING = Easing.bezier(0.16, 1, 0.3, 1);

// World view shown when user location is unavailable (continents visible)
const WORLD_VIEW = {
  latitude: 20,
  longitude: 0,
  latitudeDelta: 100,
  longitudeDelta: 100,
};

const InteractiveMap: React.FC<InteractiveMapProps> = ({
  entries,
  onEntryPress,
  collapsed = true,
  onToggleCollapse,
  useFullHeight = false,
  showEntryPins = true,
}) => {
  const [MapView, setMapView] = useState<any>(null);
  const [Marker, setMarker] = useState<any>(null);
  const [Callout, setCallout] = useState<any>(null);
  const [WebView, setWebView] = useState<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [useWebViewFallback, setUseWebViewFallback] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [mapRegion, setMapRegion] = useState<any>(WORLD_VIEW);
  const [LocationModule, setLocationModule] = useState<any>(null);
  const [hasError, setHasError] = useState(false);
  const mapRef = useRef<any>(null);
  const webViewRef = useRef<any>(null);
  const locationSubscriptionRef = useRef<any>(null);
  const hasSetInitialViewRef = useRef(false);
  const lastEntriesKeyRef = useRef<string>('');
  const lastRegionRef = useRef({ latitudeDelta: 0.0922, longitudeDelta: 0.0421 });
  const userLocationRef = useRef<UserLocation | null>(null);

  // Keep ref in sync for use in async callbacks (e.g. WebView onMessage)
  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  // Responsive dimensions - map should align with header text (greeting) left edge
  const screenWidth = Dimensions.get('window').width;
  // Header padding matches greeting text left position
  const headerPaddingLeft = screenWidth * 0.0324;
  // Account for ScrollView feedContent padding (SPACING.md = 16px on each side)
  const feedContentPadding = 16; // SPACING.md value
  // Map left edge should align with header text, accounting for ScrollView padding
  // So map left = headerPaddingLeft - feedContentPadding (to compensate for ScrollView padding)
  const feedMapLeft = Math.max(headerPaddingLeft - feedContentPadding, 0);
  // Map right edge should also align with header text right edge (same padding on right)
  const headerPaddingRight = screenWidth * 0.0324;
  // Available width is screen width minus header paddings
  const availableWidth = screenWidth - (headerPaddingLeft + headerPaddingRight);
  // Map width should span from header left to header right
  const mapWidth = availableWidth;
  const mapHeightCollapsed = screenWidth * 0.608; // Maintain aspect ratio
  const mapHeightExpanded = screenWidth * 1.282; // Maintain aspect ratio
  
  // Animated height for smooth expand/collapse
  const animatedHeight = useRef(new Animated.Value(collapsed ? mapHeightCollapsed : mapHeightExpanded)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    // Load map module - try native first (TestFlight), fallback to WebView (Expo Go)
    const loadMap = async () => {
      setIsLoading(true);
      
      // Try native react-native-maps first (works in TestFlight/custom builds)
      try {
        const mapModule = await import('react-native-maps');
        if (mapModule?.default) {
          setMapView(() => mapModule.default);
          setMarker(() => mapModule.Marker);
          setCallout(() => mapModule.Callout);
          setMapReady(true);
          setUseWebViewFallback(false);
          logger.log('Native map module loaded (TestFlight ready)');
        } else {
          throw new Error('MapView not found');
        }
      } catch (error) {
        logger.log('Native maps not available, trying WebView fallback:', error);
        
        // Fallback to WebView for Expo Go
        try {
          const webViewModule = await import('react-native-webview');
          if (webViewModule?.default) {
            setWebView(() => webViewModule.default);
            setMapReady(true);
            setUseWebViewFallback(true);
            logger.log('WebView fallback loaded (Expo Go)');
          } else {
            throw new Error('WebView not found');
          }
        } catch (webViewError) {
          logger.error('Both native maps and WebView failed:', webViewError);
          setMapReady(false);
        }
      } finally {
        setIsLoading(false);
      }
    };
    
    loadMap();

    // Load location module
    const loadLocationModule = async () => {
      try {
        const locationModule = await import('expo-location');
        if (locationModule) {
          setLocationModule(locationModule);
          
          // Request permission in background
          const { status } = await locationModule.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            try {
              // Get initial location with timeout
              const locationPromise = locationModule.getCurrentPositionAsync({
                accuracy: locationModule.Accuracy.Balanced,
              });
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Location timeout')), 10000)
              );
              
              const location = await Promise.race([locationPromise, timeoutPromise]) as any;
              setUserLocation({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
              });
              
              // Start watching position for real-time updates
              const subscription = await locationModule.watchPositionAsync(
                {
                  accuracy: locationModule.Accuracy.Balanced,
                  timeInterval: 5000,      // Update every 5 seconds
                  distanceInterval: 10,    // Update every 10 meters
                },
                (newLocation) => {
                  // Only update user location (blue dot). Do not recenter the map so the view
                  // stays stable while the user is moving (e.g. on a train).
                  setUserLocation({
                    latitude: newLocation.coords.latitude,
                    longitude: newLocation.coords.longitude,
                  });
                }
              );
              
              locationSubscriptionRef.current = subscription;
            } catch (error) {
              logger.error('Error getting location:', error);
              setHasError(true);
            }
          }
        }
      } catch (error) {
        logger.error('Error loading location module:', error);
        setHasError(true);
      }
    };
    
    loadLocationModule();
    
    // Cleanup location subscription on unmount
    return () => {
      if (locationSubscriptionRef.current) {
        locationSubscriptionRef.current.remove();
        locationSubscriptionRef.current = null;
      }
    };
  }, []);

  // Smooth expand/collapse with pronounced deceleration at target size
  const ANIM_DURATION = 280;
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const targetHeight = collapsed ? mapHeightCollapsed : mapHeightExpanded;
    
    // Cancel any in-flight animation to prevent overlapping/freezing
    animationRef.current?.stop();
    animationRef.current = null;
    
    setIsAnimating(true);
    
    const anim = Animated.timing(animatedHeight, {
      toValue: targetHeight,
      duration: ANIM_DURATION,
      easing: MAP_ANIM_EASING,
      useNativeDriver: false,
    });
    animationRef.current = anim;
    
    anim.start(({ finished }) => {
      animationRef.current = null;
      if (finished) setIsAnimating(false);
    });
    
    const timer = setTimeout(() => setIsAnimating(false), ANIM_DURATION + 50);
    return () => {
      anim.stop();
      clearTimeout(timer);
    };
  }, [collapsed, mapHeightCollapsed, mapHeightExpanded]);

  // Update map region only once on first ready, or when entries content actually changes (not on every reference change)
  useEffect(() => {
    if (!mapReady) return;

    const entriesWithLocation = entries.filter(
      entry => entry.latitude !== undefined && entry.longitude !== undefined
    );
    const entriesKey = `${entries.length}_${entries.map(e => e.id).sort().join(',')}`;
    if (hasSetInitialViewRef.current && entriesKey === lastEntriesKeyRef.current) return;

    // When entry pins are hidden (e.g. home map): center only on user or stay on default; never use entries for initial view
    if (!showEntryPins) {
      if (userLocation) {
        const newRegion = {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        };
        setMapRegion(newRegion);
        lastRegionRef.current = { latitudeDelta: newRegion.latitudeDelta, longitudeDelta: newRegion.longitudeDelta };
        if (useWebViewFallback && webViewRef.current) {
          webViewRef.current.injectJavaScript(`map.setView([${userLocation.latitude}, ${userLocation.longitude}], 13, { animate: true, duration: 0.5 });`);
        } else if (!useWebViewFallback && mapRef.current && typeof mapRef.current.animateToRegion === 'function') {
          mapRef.current.animateToRegion(newRegion, 1000);
        }
        hasSetInitialViewRef.current = true;
        lastEntriesKeyRef.current = entriesKey;
      }
      return;
    }

    // Priority 1: User location (always center on user if available)
    if (userLocation) {
      // If entries exist, calculate bounds that include both user and entries
      if (entriesWithLocation.length > 0) {
        const allLatitudes = [userLocation.latitude, ...entriesWithLocation.map(e => e.latitude!)];
        const allLongitudes = [userLocation.longitude, ...entriesWithLocation.map(e => e.longitude!)];
        
        const minLat = Math.min(...allLatitudes);
        const maxLat = Math.max(...allLatitudes);
        const minLng = Math.min(...allLongitudes);
        const maxLng = Math.max(...allLongitudes);
        
        const latDelta = Math.max((maxLat - minLat) * 1.5, 0.0922);
        const lngDelta = Math.max((maxLng - minLng) * 1.5, 0.0421);
        
        // Center on user location, but include entries in bounds
        const newRegion = {
          latitude: userLocation.latitude, // Center on user
          longitude: userLocation.longitude, // Center on user
          latitudeDelta: latDelta,
          longitudeDelta: lngDelta,
        };
        
        setMapRegion(newRegion);
        lastRegionRef.current = { latitudeDelta: newRegion.latitudeDelta, longitudeDelta: newRegion.longitudeDelta };

        // Update WebView with auto-fit bounds including user location
        if (useWebViewFallback && webViewRef.current) {
          const bounds = [
            [minLat, minLng],
            [maxLat, maxLng]
          ];
          webViewRef.current.injectJavaScript(`
            var bounds = L.latLngBounds(${JSON.stringify(bounds)});
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
            map.setView([${userLocation.latitude}, ${userLocation.longitude}], map.getZoom(), { animate: true, duration: 0.5 });
          `);
        }
        // Update native map with auto-fit
        else if (!useWebViewFallback && mapRef.current && typeof mapRef.current.fitToCoordinates === 'function') {
          const coordinates = [
            { latitude: userLocation.latitude, longitude: userLocation.longitude },
            ...entriesWithLocation.map(e => ({
              latitude: e.latitude!,
              longitude: e.longitude!,
            }))
          ];
          mapRef.current.fitToCoordinates(
            coordinates,
            { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true }
          );
          // Ensure user location is centered
          setTimeout(() => {
            if (mapRef.current && typeof mapRef.current.animateToRegion === 'function') {
              mapRef.current.animateToRegion(newRegion, 1000);
            }
          }, 100);
        }
        hasSetInitialViewRef.current = true;
        lastEntriesKeyRef.current = entriesKey;
      } else {
        // Only user location, center on it
        const newRegion = {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        };
        setMapRegion(newRegion);
        lastRegionRef.current = { latitudeDelta: newRegion.latitudeDelta, longitudeDelta: newRegion.longitudeDelta };

        // Update WebView if using fallback
        if (useWebViewFallback && webViewRef.current) {
          webViewRef.current.injectJavaScript(`map.setView([${userLocation.latitude}, ${userLocation.longitude}], 13, { animate: true, duration: 0.5 });`);
        }
        // Update native map
        else if (!useWebViewFallback && mapRef.current && typeof mapRef.current.animateToRegion === 'function') {
          mapRef.current.animateToRegion(newRegion, 1000);
        }
        hasSetInitialViewRef.current = true;
        lastEntriesKeyRef.current = entriesKey;
      }
      return;
    }

    // Priority 2: Entries (only if no user location)
    if (entriesWithLocation.length === 0) {
      // No entries and no user location, use default
      return;
    }

    if (entriesWithLocation.length === 1) {
      // Single entry, center on it
      const entry = entriesWithLocation[0];
      const region = {
        latitude: entry.latitude!,
        longitude: entry.longitude!,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      };
      setMapRegion(region);
      lastRegionRef.current = { latitudeDelta: region.latitudeDelta, longitudeDelta: region.longitudeDelta };

      // Update WebView if using fallback
      if (useWebViewFallback && webViewRef.current) {
        webViewRef.current.injectJavaScript(`map.setView([${entry.latitude}, ${entry.longitude}], 13, { animate: true, duration: 0.5 });`);
      }
      // Update native map
      else if (!useWebViewFallback && mapRef.current && typeof mapRef.current.fitToCoordinates === 'function') {
        mapRef.current.fitToCoordinates(
          [{ latitude: entry.latitude!, longitude: entry.longitude! }],
          { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true }
        );
      }
      return;
    }

    // Multiple entries - auto-fit bounds
    const latitudes = entriesWithLocation.map(e => e.latitude!);
    const longitudes = entriesWithLocation.map(e => e.longitude!);
    
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);

    const latDelta = Math.max((maxLat - minLat) * 1.5, 0.0922);
    const lngDelta = Math.max((maxLng - minLng) * 1.5, 0.0421);

    const newRegion = {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };

    setMapRegion(newRegion);
    lastRegionRef.current = { latitudeDelta: newRegion.latitudeDelta, longitudeDelta: newRegion.longitudeDelta };

    // Update WebView with auto-fit bounds
    if (useWebViewFallback && webViewRef.current) {
      const bounds = [
        [minLat, minLng],
        [maxLat, maxLng]
      ];
      webViewRef.current.injectJavaScript(`
        var bounds = L.latLngBounds(${JSON.stringify(bounds)});
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      `);
    }
    // Update native map with auto-fit
    else if (!useWebViewFallback && mapRef.current && typeof mapRef.current.fitToCoordinates === 'function') {
      const coordinates = entriesWithLocation.map(e => ({
        latitude: e.latitude!,
        longitude: e.longitude!,
      }));
      mapRef.current.fitToCoordinates(
        coordinates,
        { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true }
      );
    }
  }, [entries, mapReady, useWebViewFallback, userLocation, showEntryPins]);

  // Native map only: Google Maps–style follow mode — pan map so user stays centered (blue dot fixed)
  useEffect(() => {
    if (useWebViewFallback || !mapReady || !userLocation || !hasSetInitialViewRef.current) return;
    try {
      const { latitudeDelta, longitudeDelta } = lastRegionRef.current;
      const followRegion = {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta,
        longitudeDelta,
      };
      if (mapRef.current && typeof mapRef.current.animateToRegion === 'function') {
        mapRef.current.animateToRegion(followRegion, 500);
      }
    } catch (e) {
      logger.warn('InteractiveMap: follow-mode pan failed', e);
    }
  }, [userLocation, mapReady, useWebViewFallback]);

  // WebView only: add/update user marker and pan map (follow mode) when userLocation changes
  useEffect(() => {
    if (!useWebViewFallback || !userLocation || !webViewRef.current) return;
    try {
      webViewRef.current.injectJavaScript(
        `if (typeof ensureUserMarker === 'function') { ensureUserMarker(${userLocation.latitude}, ${userLocation.longitude}); }
         if (typeof map !== 'undefined' && map) { map.setView([${userLocation.latitude}, ${userLocation.longitude}], map.getZoom(), { animate: true, duration: 0.5 }); }
         true;`
      );
    } catch (e) {
      logger.warn('InteractiveMap: failed to update WebView user marker', e);
    }
  }, [userLocation, useWebViewFallback]);

  const handleRecenter = async () => {
    let locationModule = LocationModule;
    
    if (!locationModule) {
      try {
        const imported = await import('expo-location');
        if (imported) {
          locationModule = imported;
          setLocationModule(imported);
        } else {
          return;
        }
      } catch (error) {
        logger.error('Error loading location module:', error);
        return;
      }
    }
    
    try {
      const { status } = await locationModule.requestForegroundPermissionsAsync();
      
      if (status === 'granted') {
        const location = await locationModule.getCurrentPositionAsync({
          accuracy: locationModule.Accuracy.Balanced,
        });
        
        const userLoc = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };
        
        setUserLocation(userLoc);
        
        const newRegion = {
          latitude: userLoc.latitude,
          longitude: userLoc.longitude,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        };
        
        setMapRegion(newRegion);
        
        // Update native map
        if (!useWebViewFallback && mapRef.current && typeof mapRef.current.animateToRegion === 'function') {
          mapRef.current.animateToRegion(newRegion, 1000);
        }
        // Update WebView map
        else if (useWebViewFallback && webViewRef.current) {
          webViewRef.current.injectJavaScript(`map.setView([${userLoc.latitude}, ${userLoc.longitude}], 13);`);
        }
      }
    } catch (error) {
      logger.error('Error recentering map:', error);
    }
  };

  // Generate interactive map HTML with minimalistic pin markers and improved error handling
  const generateMapHTML = (lat: number, lng: number, entriesWithLocation: Entry[], userLoc: UserLocation | null, initialZoom: number = 13) => {
    // Pin SVG: teardrop shape, subtly 3D with inner highlight, mirrors MapPinMarker
    const entryPinSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 36" width="28" height="36">' +
      '<defs>' +
      '<linearGradient id="pinGradient" x1="14" y1="2" x2="14" y2="34" gradientUnits="userSpaceOnUse">' +
      '<stop offset="0" stop-color="#1f2933" stop-opacity="0.95" />' +
      '<stop offset="1" stop-color="#111827" stop-opacity="1" />' +
      '</linearGradient>' +
      '</defs>' +
      '<path d="M14 2C8.477 2 4 6.477 4 12c0 6 10 22 10 22s10-16 10-22c0-5.523-4.477-10-10-10z" fill="url(#pinGradient)"/>' +
      '<circle cx="14" cy="12" r="5.5" fill="#ffffff" fill-opacity="0.96"/>' +
      '</svg>';
    const entryPinHtml = `'${entryPinSvg.replace(/'/g, "\\'")}'`;
    const entryMarkerIcon = `L.divIcon({
      className: 'custom-marker-entry',
      html: ${entryPinHtml},
      iconSize: [28, 36],
      iconAnchor: [14, 36]
    })`;
    
    // Custom marker icon for user location (blue circle)
    const userMarkerIcon = `L.divIcon({
      className: 'custom-marker-user',
      html: '',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    })`;
    
    // Generate entry markers HTML
    const markersHTML = entriesWithLocation.map(entry => {
      const title = (entry.title || 'Untitled Entry').replace(/'/g, "\\'").replace(/"/g, '&quot;');
      const entryId = entry.id.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      return `var entryMarker${entry.id.replace(/[^a-zA-Z0-9]/g, '_')} = L.marker([${entry.latitude}, ${entry.longitude}], {
        icon: ${entryMarkerIcon}
      }).addTo(map);
      entryMarker${entry.id.replace(/[^a-zA-Z0-9]/g, '_')}.bindPopup(
        '<div style="padding: 8px; text-align: center; cursor: pointer; min-width: 100px;" onclick="if (window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(JSON.stringify({type: \\'popupClick\\', entryId: \\'${entryId}\\'})); }">${title}</div>'
      );
      entryMarker${entry.id.replace(/[^a-zA-Z0-9]/g, '_')}.on('click', function() { 
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({type: 'markerClick', entryId: '${entryId}'})); 
        }
      });`;
    }).join('\n              ');
    
    // User marker: always expose ensureUserMarker so React can add/update without changing HTML source (avoids WebView reload and white flash)
    const userMarkerHTML = `
              var userMarker = null;
              var userMarkerIcon = ${userMarkerIcon};
              window.ensureUserMarker = function(lat, lng) {
                if (userMarker === null) {
                  userMarker = L.marker([lat, lng], { icon: userMarkerIcon }).addTo(map);
                  userMarker.bindPopup('Your Location');
                } else {
                  userMarker.setLatLng([lat, lng]);
                }
              };
            `;

    // Auto-fit bounds logic (entries only; user marker is added via ensureUserMarker so source stays stable)
    const allMarkers = entriesWithLocation.map(e => `[${e.latitude}, ${e.longitude}]`);
    const fitBoundsCode = allMarkers.length >= 1 ? `
              var allMarkers = [${allMarkers.join(', ')}];
              var bounds = L.latLngBounds(allMarkers);
              map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
            ` : '';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""/>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body, html { width: 100%; height: 100%; overflow: hidden; background: #e8e8e8; }
#map { width: 100%; height: 100%; background: #e8e8e8; }
.leaflet-container { background: #e8e8e8; }
.custom-marker-entry {
  width: 28px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.custom-marker-entry svg {
  display: block;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
}
.custom-marker-user {
  background-color: #007AFF;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 3px solid #fff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.5);
}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
(function() {
  var map = null;
  var initAttempts = 0;
  var maxAttempts = 100;
  
  function initMap() {
    if (typeof L === 'undefined') {
      initAttempts++;
      if (initAttempts < maxAttempts) {
        setTimeout(initMap, 50);
        return;
      }
      logger.error('Leaflet failed to load');
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({type: 'mapError', message: 'Leaflet library failed to load'}));
      }
      return;
    }
    
    try {
      map = L.map('map', {
        zoomControl: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        boxZoom: true,
        keyboard: true,
        dragging: true,
        touchZoom: true
      }).setView([${lat}, ${lng}], ${initialZoom});
      
      var tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
        minZoom: 1,
        errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
      });
      
      tileLayer.addTo(map);
      
      map.whenReady(function() {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({type: 'mapLoaded'}));
        }
      });
      
      ${markersHTML}
      ${userMarkerHTML}
      ${fitBoundsCode}
      
      window.updateMap = function(newLat, newLng) {
        if (map) {
          map.setView([newLat, newLng], map.getZoom(), { animate: true, duration: 0.5 });
        }
      };
      
    } catch (error) {
      logger.error('Map init error:', error);
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({type: 'mapError', message: error.message || 'Map initialization failed'}));
      }
    }
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMap);
  } else {
    initMap();
  }
})();
</script>
</body>
</html>`;
  };

  // Filter entries with location data
  const entriesWithLocation = entries.filter(
    entry => entry.latitude !== undefined && entry.longitude !== undefined
  );

  const containerHeight = collapsed ? mapHeightCollapsed : mapHeightExpanded;

  return (
    <Animated.View 
      style={[
        styles.container,
        useFullHeight && styles.containerFullHeight,
        {
          height: useFullHeight ? undefined : animatedHeight,
          flex: useFullHeight ? 1 : undefined,
          width: useFullHeight ? '100%' : mapWidth,
          marginLeft: useFullHeight ? 0 : feedMapLeft,
          marginRight: useFullHeight ? 0 : feedMapLeft,
          alignSelf: useFullHeight ? 'stretch' : 'center',
        },
      ]}
      pointerEvents={isAnimating ? 'none' : 'auto'}
    >
      <View 
        style={[styles.mapContainer, { 
          height: useFullHeight ? '100%' : containerHeight, 
          flex: useFullHeight ? 1 : undefined,
          width: useFullHeight ? '100%' : mapWidth,
        }]}
        pointerEvents={isAnimating ? 'none' : 'auto'}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <LoadingSpinner size="large" color={COLORS.white} />
            <Text style={styles.loadingText}>Loading map...</Text>
          </View>
        ) : mapReady && !useWebViewFallback && MapView && Marker ? (
          // Native MapView (TestFlight/custom builds)
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={WORLD_VIEW}
            showsUserLocation={true}
            showsMyLocationButton={false}
            mapType="standard"
            scrollEnabled={true}
            zoomEnabled={true}
            onRegionChangeComplete={(region: Region) => {
              lastRegionRef.current = {
                latitudeDelta: region.latitudeDelta,
                longitudeDelta: region.longitudeDelta,
              };
            }}
            onError={(error: unknown) => {
              logger.error('Map error:', error);
              setHasError(true);
            }}
          >
            {showEntryPins && entriesWithLocation.map((entry) => (
              <Marker
                key={entry.id}
                coordinate={{
                  latitude: entry.latitude!,
                  longitude: entry.longitude!,
                }}
                anchor={{ x: 0.5, y: 1 }}
                tracksViewChanges={false}
                onPress={() => onEntryPress?.(entry)}
              >
                <MapPinMarker color={COLORS.zinc700} width={PIN_WIDTH} height={PIN_HEIGHT} />
                {Callout && (
                  <Callout>
                    <TouchableOpacity onPress={() => onEntryPress?.(entry)}>
                      <View style={styles.calloutContainer}>
                        <Text style={styles.calloutText}>
                          {entry.title || 'Untitled Entry'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </Callout>
                )}
              </Marker>
            ))}
          </MapView>
        ) : mapReady && useWebViewFallback && WebView ? (
          // WebView fallback (Expo Go)
          <WebView
            ref={webViewRef}
            source={{ html: generateMapHTML(mapRegion.latitude, mapRegion.longitude, showEntryPins ? entriesWithLocation : [], null, mapRegion.latitudeDelta > 50 ? 2 : 13) }}
            style={styles.map}
            scrollEnabled={true}
            zoomEnabled={true}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
            originWhitelist={['*']}
            mixedContentMode="always"
            onLoadEnd={() => {
              logger.log('WebView HTML loaded');
            }}
            onLoadStart={() => {
              logger.log('WebView started loading');
            }}
            onMessage={(event: WebViewMessageEvent) => {
              try {
                const data = JSON.parse(event.nativeEvent.data);
                logger.log('WebView message:', data.type);
                if (data.type === 'popupClick' && data.entryId) {
                  const entry = entries.find(e => e.id === data.entryId);
                  if (entry) onEntryPress?.(entry);
                } else if (data.type === 'markerClick' && data.entryId) {
                  const entry = entries.find(e => e.id === data.entryId);
                  if (entry) onEntryPress?.(entry);
                } else if (data.type === 'mapLoaded') {
                  logger.log('Map loaded successfully');
                  setHasError(false);
                  // Add blue dot as soon as map is ready if we already have user location
                  const loc = userLocationRef.current;
                  if (loc && webViewRef.current) {
                    try {
                      webViewRef.current.injectJavaScript(
                        `if (typeof ensureUserMarker === 'function') { ensureUserMarker(${loc.latitude}, ${loc.longitude}); } true;`
                      );
                    } catch (e) {
                      logger.warn('InteractiveMap: failed to add user marker on mapLoaded', e);
                    }
                  }
                } else if (data.type === 'mapError') {
                  logger.error('Map error:', data.message);
                  setHasError(true);
                }
              } catch (e) {
                logger.error('Error parsing WebView message:', e);
              }
            }}
            onError={(syntheticEvent: WebViewErrorEvent) => {
              const { nativeEvent } = syntheticEvent;
              logger.error('WebView error:', nativeEvent);
              setHasError(true);
            }}
            onHttpError={(syntheticEvent: WebViewHttpErrorEvent) => {
              const { nativeEvent } = syntheticEvent;
              logger.error('WebView HTTP error:', nativeEvent);
              setHasError(true);
            }}
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Map unavailable</Text>
          </View>
        )}
      </View>
      
      {/* Expand/Collapse Button - Top Right */}
      {onToggleCollapse && (
        <TouchableOpacity style={styles.recenterButton} onPress={onToggleCollapse}>
          <Text style={styles.recenterButtonText}>
            {collapsed ? 'Expand' : 'Collapse'}
          </Text>
        </TouchableOpacity>
      )}
      
      {/* Recenter Button - Bottom Right */}
      {mapReady && (
        <TouchableOpacity style={styles.toggleButton} onPress={handleRecenter}>
          <Text style={styles.toggleButtonText}>Recenter</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: SPACING.md,
    marginRight: 0,
    backgroundColor: COLORS.stone500,
    alignSelf: 'center',
  },
  containerFullHeight: {
    borderRadius: 0,
    marginBottom: 0,
  },
  mapContainer: {
    overflow: 'hidden',
    position: 'relative',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.stone500,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...TEXT_STYLES.entryInput,
    color: COLORS.white,
    fontSize: 14,
    marginTop: SPACING.sm,
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.stone500,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    ...TEXT_STYLES.entryInput,
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  placeholderSubtext: {
    ...TEXT_STYLES.entryInput,
    color: COLORS.neutral400,
    fontSize: 12,
  },
  recenterButton: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 20, // Same as toggleButton
    opacity: 0.9,
    zIndex: 10,
  },
  recenterButtonText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 12, // Same as toggleButtonText
    color: COLORS.black,
    fontWeight: '700', // Same as toggleButtonText
  },
  toggleButton: {
    position: 'absolute',
    bottom: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 20,
    opacity: 0.9,
    zIndex: 10,
  },
  toggleButtonText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 12,
    color: COLORS.black,
    fontWeight: '700',
  },
  calloutContainer: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 100,
    alignItems: 'center',
  },
  calloutText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 14,
    color: COLORS.black,
    fontWeight: '600',
  },
});

export default InteractiveMap;
