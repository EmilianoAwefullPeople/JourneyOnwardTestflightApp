// ReviewFilters
// Filter controls for ReviewScreen

import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { COLORS, SPACING } from '../../config/constants';
import { TEXT_STYLES } from '../../config/typography';
import { useTheme } from '../../context/ThemeContext';
import { TripAlbum } from '../../models/TripAlbum';
import DateTimePicker from '@react-native-community/datetimepicker';

interface ReviewFiltersProps {
  tripAlbums: TripAlbum[];
  selectedTripAlbum: string | null;
  showDrafts: boolean;
  onTripAlbumChange: (albumId: string | null) => void;
  onDraftsToggle: (show: boolean) => void;
}

const ReviewFilters: React.FC<ReviewFiltersProps> = ({
  tripAlbums,
  selectedTripAlbum,
  showDrafts,
  onTripAlbumChange,
  onDraftsToggle,
}) => {
  const { colors } = useTheme();
  const [showTripFilter, setShowTripFilter] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flexDirection: 'row',
          padding: SPACING.md,
          gap: SPACING.sm,
        },
        filterButton: {
          paddingHorizontal: SPACING.md,
          paddingVertical: SPACING.sm,
          borderRadius: 20,
          backgroundColor: colors.border,
        },
        filterButtonActive: {
          backgroundColor: COLORS.lime800,
        },
        filterButtonText: {
          ...TEXT_STYLES.entryInput,
          fontSize: 14,
          color: colors.textPrimary,
        },
        filterButtonTextActive: {
          color: colors.textPrimary,
          fontWeight: '600',
        },
        modalOverlay: {
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          justifyContent: 'flex-end',
        },
        modalContent: {
          backgroundColor: colors.background,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: SPACING.lg,
          maxHeight: '50%',
        },
        modalTitle: {
          ...TEXT_STYLES.entryLabel,
          fontSize: 20,
          marginBottom: SPACING.md,
          color: colors.textPrimary,
        },
        filterOption: {
          padding: SPACING.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        filterOptionText: {
          ...TEXT_STYLES.entryInput,
          color: colors.textPrimary,
        },
        modalCloseButton: {
          marginTop: SPACING.md,
          padding: SPACING.md,
          backgroundColor: COLORS.lime800,
          borderRadius: 10,
          alignItems: 'center',
        },
        modalCloseButtonText: {
          ...TEXT_STYLES.entryLabel,
          color: colors.textPrimary,
        },
      }),
    [colors]
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.filterButton}
        onPress={() => setShowTripFilter(true)}
      >
        <Text style={styles.filterButtonText}>
          {selectedTripAlbum
            ? tripAlbums.find(a => a.id === selectedTripAlbum)?.name || 'All Trips'
            : 'All Trips'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.filterButton, showDrafts && styles.filterButtonActive]}
        onPress={() => onDraftsToggle(!showDrafts)}
      >
        <Text style={[styles.filterButtonText, showDrafts && styles.filterButtonTextActive]}>
          Drafts
        </Text>
      </TouchableOpacity>

      <Modal
        visible={showTripFilter}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTripFilter(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Filter by Trip</Text>
            <ScrollView>
              <TouchableOpacity
                style={styles.filterOption}
                onPress={() => {
                  onTripAlbumChange(null);
                  setShowTripFilter(false);
                }}
              >
                <Text style={styles.filterOptionText}>All Trips</Text>
              </TouchableOpacity>
              {tripAlbums.map((album) => (
                <TouchableOpacity
                  key={album.id}
                  style={styles.filterOption}
                  onPress={() => {
                    onTripAlbumChange(album.id);
                    setShowTripFilter(false);
                  }}
                >
                  <Text style={styles.filterOptionText}>{album.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowTripFilter(false)}
            >
              <Text style={styles.modalCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default ReviewFilters;
