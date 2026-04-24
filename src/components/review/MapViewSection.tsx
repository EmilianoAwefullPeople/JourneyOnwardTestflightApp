// MapViewSection
// Interactive map view showing pins for entries and journals with location data
// Uses InteractiveMap component (works in both TestFlight and Expo Go)

import React, { useMemo } from 'react';
import { View, StyleSheet, Text, ScrollView } from 'react-native';
import { Entry } from '../../models/Entry';
import { Journal } from '../../models/Journal';
import { SPACING } from '../../config/constants';
import { TEXT_STYLES } from '../../config/typography';
import { useTheme } from '../../context/ThemeContext';
import InteractiveMap from '../feed/InteractiveMap';

interface MapViewSectionProps {
  entries: Entry[];
  journals: Journal[];
  onEntryPress: (entry: Entry) => void;
  onJournalPress: (journal: Journal) => void;
  scrollRef?: React.RefObject<ScrollView | null>;
}

const MapViewSection: React.FC<MapViewSectionProps> = ({ 
  entries, 
  journals, 
  onEntryPress, 
  onJournalPress,
  scrollRef
}) => {
  const { colors } = useTheme();
  const entriesWithLocation = useMemo(() => {
    const list = entries ?? [];
    return list.filter(
      (e) => e.latitude !== undefined && e.longitude !== undefined
    );
  }, [entries]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        scrollContent: { flexGrow: 1 },
        emptyState: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: SPACING.xxl,
          backgroundColor: colors.background,
        },
        emptyStateText: {
          ...TEXT_STYLES.entryInput,
          fontSize: 20,
          marginBottom: SPACING.sm,
          color: colors.textPrimary,
        },
        emptyStateSubtext: {
          ...TEXT_STYLES.placeholderText,
          textAlign: 'center',
          color: colors.textSecondary,
        },
      }),
    [colors]
  );

  if (entriesWithLocation.length === 0) {
    return (
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.emptyState} accessibilityLabel="Map view, no location data">
          <Text style={styles.emptyStateText}>No location data</Text>
          <Text style={styles.emptyStateSubtext}>
            Entries and journals with location data will appear here
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.container} accessibilityLabel="Map view">
        <InteractiveMap
          entries={entriesWithLocation}
          onEntryPress={onEntryPress}
          collapsed={false} // Always expanded in Review screen
          onToggleCollapse={undefined} // Remove collapse button in Review screen
          useFullHeight={true} // Make map fill available height in Review screen
        />
      </View>
    </ScrollView>
  );
};

export default MapViewSection;
