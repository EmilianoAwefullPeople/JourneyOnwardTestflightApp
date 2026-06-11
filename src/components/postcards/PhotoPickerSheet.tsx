import React, { useMemo } from 'react';
import {
  Modal,
  View,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../common/AppText';
import { useAppContext } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { Entry } from '../../models/Entry';
import { FONTS, FONT_WEIGHTS } from '../../config/constants';

const COLUMNS = 3;
const CELL_GAP = 2;

interface PhotoItem {
  uri: string;
  entry: Entry;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (uri: string, entry: Entry) => void;
}

const PhotoPickerSheet: React.FC<Props> = ({ visible, onClose, onSelect }) => {
  const { entries } = useAppContext();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get('window').width;
  const cellSize = (screenWidth - CELL_GAP * (COLUMNS + 1)) / COLUMNS;

  const photoItems = useMemo<PhotoItem[]>(
    () =>
      entries
        .filter((e) => !e.isDraft)
        .flatMap((e) =>
          (e.photoPaths || [])
            .filter(Boolean)
            .map((uri) => ({ uri, entry: e }))
        ),
    [entries]
  );

  const handleSelect = (item: PhotoItem) => {
    onSelect(item.uri, item.entry);
    onClose();
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 16,
          paddingBottom: 14,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        title: {
          fontFamily: FONTS.inter,
          fontSize: 16,
          fontWeight: FONT_WEIGHTS.semibold,
          color: colors.textPrimary,
        },
        closeButton: {
          position: 'absolute',
          right: 16,
          width: 36,
          height: 36,
          alignItems: 'center',
          justifyContent: 'center',
        },
        grid: {
          padding: CELL_GAP,
          paddingBottom: insets.bottom + 16,
        },
        cell: {
          margin: CELL_GAP / 2,
        },
        empty: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          paddingBottom: insets.bottom,
        },
        emptyText: {
          fontFamily: FONTS.inter,
          fontSize: 16,
          color: colors.textSecondary,
        },
      }),
    [colors, insets.bottom]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <AppText style={styles.title}>Choose a photo</AppText>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close photo picker"
          >
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {photoItems.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="images-outline" size={48} color={colors.textSecondary} />
            <AppText style={styles.emptyText}>No photos yet</AppText>
          </View>
        ) : (
          <FlatList
            data={photoItems}
            keyExtractor={(item, index) => `${item.uri}-${index}`}
            numColumns={COLUMNS}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.cell}
                onPress={() => handleSelect(item)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Select this photo"
              >
                <Image
                  source={{ uri: item.uri }}
                  style={{ width: cellSize, height: cellSize }}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                />
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </Modal>
  );
};

export default PhotoPickerSheet;
