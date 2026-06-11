import React, { useMemo } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../components/common/AppText';
import { useTheme } from '../context/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { FONTS, FONT_WEIGHTS, SPACING } from '../config/constants';
import { TEMPLATE_REGISTRY, type TemplateRegistryEntry } from '../config/templateRegistry';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const COLUMNS = 2;
const CARD_GAP = 12;

/** Template-specific preview content rendered as colored rects/shapes */
const TemplatePreview: React.FC<{ templateId: string; height: number }> = ({ templateId, height }) => {
  const darkRect = { backgroundColor: '#2a2a2a', borderRadius: 3 };
  const medRect = { backgroundColor: '#333', borderRadius: 3 };
  const lightRect = { backgroundColor: '#444', borderRadius: 3 };

  switch (templateId) {
    case 'T-01':
    case 'T-09':
      // 2×2 grid
      return (
        <View style={{ flex: 1, padding: 6, gap: 4 }}>
          <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
            <View style={[{ flex: 1 }, darkRect]} />
            <View style={[{ flex: 1 }, darkRect]} />
          </View>
          <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
            <View style={[{ flex: 1 }, darkRect]} />
            <View style={[{ flex: 1 }, darkRect]} />
          </View>
        </View>
      );
    case 'T-02': {
      // Single photo with corner brackets and bottom strip
      const bracketColor = 'rgba(255,255,255,0.5)';
      return (
        <View style={{ flex: 1, position: 'relative', margin: 6 }}>
          <View style={[StyleSheet.absoluteFill, darkRect]} />
          {/* Corner brackets */}
          <View style={{ position: 'absolute', top: 4, left: 4, width: 10, height: 2, backgroundColor: bracketColor }} />
          <View style={{ position: 'absolute', top: 4, left: 4, width: 2, height: 10, backgroundColor: bracketColor }} />
          <View style={{ position: 'absolute', top: 4, right: 4, width: 10, height: 2, backgroundColor: bracketColor }} />
          <View style={{ position: 'absolute', top: 4, right: 4, width: 2, height: 10, backgroundColor: bracketColor }} />
          <View style={{ position: 'absolute', bottom: 14, left: 4, width: 10, height: 2, backgroundColor: bracketColor }} />
          <View style={{ position: 'absolute', bottom: 4, left: 4, width: 2, height: 10, backgroundColor: bracketColor }} />
          <View style={{ position: 'absolute', bottom: 14, right: 4, width: 10, height: 2, backgroundColor: bracketColor }} />
          <View style={{ position: 'absolute', bottom: 4, right: 4, width: 2, height: 10, backgroundColor: bracketColor }} />
          {/* Bottom strip */}
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 12, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 3 }} />
        </View>
      );
    }
    case 'T-03':
      // Photo with text overlay suggestion
      return (
        <View style={{ flex: 1, margin: 6, position: 'relative' }}>
          <View style={[StyleSheet.absoluteFill, darkRect]} />
          <View style={{ position: 'absolute', top: '35%', left: 8, right: 8, gap: 4 }}>
            <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 2 }} />
            <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 2, width: '70%' }} />
            <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 2, width: '85%' }} />
          </View>
        </View>
      );
    case 'T-04':
      // Overlapping rotated rects on blurred bg
      return (
        <View style={{ flex: 1, overflow: 'hidden', margin: 6, position: 'relative' }}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1A2E4A', borderRadius: 3 }]} />
          <View style={{ position: 'absolute', top: 8, left: 6, width: '55%', aspectRatio: 4/5, backgroundColor: '#fff', borderRadius: 2, transform: [{ rotate: '-3deg' }], padding: 3 }}>
            <View style={{ flex: 1, backgroundColor: '#555', borderRadius: 1 }} />
          </View>
          <View style={{ position: 'absolute', top: '30%', right: 5, width: '55%', aspectRatio: 4/5, backgroundColor: '#fff', borderRadius: 2, transform: [{ rotate: '2.5deg' }], padding: 3 }}>
            <View style={{ flex: 1, backgroundColor: '#555', borderRadius: 1 }} />
          </View>
        </View>
      );
    case 'T-05':
      // Dark bg, two bubble-shaped rects
      return (
        <View style={{ flex: 1, backgroundColor: '#000', margin: 6, padding: 6, gap: 6 }}>
          <View style={{ alignSelf: 'flex-end', width: '65%', flex: 1, backgroundColor: '#2a2a2a', borderRadius: 10 }} />
          <View style={{ alignSelf: 'flex-start', width: '58%', flex: 1, backgroundColor: '#2a2a2a', borderRadius: 10 }} />
          <View style={{ alignSelf: 'flex-end', width: '55%', height: 18, backgroundColor: '#007AFF', borderRadius: 10 }} />
        </View>
      );
    case 'T-06':
    case 'T-12':
      // 3 horizontal strips
      return (
        <View style={{ flex: 1, padding: 6, gap: 3 }}>
          <View style={[{ flex: 1 }, darkRect]} />
          <View style={[{ flex: 1 }, darkRect]} />
          <View style={[{ flex: 1 }, darkRect]} />
        </View>
      );
    case 'T-07':
      // Top photo + bottom white panel with lines
      return (
        <View style={{ flex: 1, flexDirection: 'column', margin: 6, gap: 3 }}>
          <View style={[{ flex: 2 }, darkRect]} />
          <View style={{ flex: 1, backgroundColor: '#FAFAF8', borderRadius: 3, padding: 4, gap: 2 }}>
            <View style={{ height: 2, backgroundColor: '#ddd', borderRadius: 1 }} />
            <View style={{ height: 2, backgroundColor: '#ddd', borderRadius: 1, width: '70%' }} />
            <View style={{ height: 2, backgroundColor: '#eee', borderRadius: 1 }} />
          </View>
        </View>
      );
    case 'T-08':
      // Top white panel + bottom photo
      return (
        <View style={{ flex: 1, flexDirection: 'column', margin: 6, gap: 3 }}>
          <View style={{ flex: 2, backgroundColor: '#FAFAF8', borderRadius: 3, padding: 4, gap: 2 }}>
            <View style={{ height: 3, backgroundColor: '#007AFF', borderRadius: 1, width: '40%' }} />
            <View style={{ height: 2, backgroundColor: '#ddd', borderRadius: 1 }} />
            <View style={{ height: 2, backgroundColor: '#ddd', borderRadius: 1, width: '60%' }} />
            <View style={{ height: 2, backgroundColor: '#ddd', borderRadius: 1, width: '80%' }} />
          </View>
          <View style={[{ flex: 1 }, darkRect]} />
        </View>
      );
    case 'T-10':
      // White bg with centered photo rect
      return (
        <View style={{ flex: 1, backgroundColor: '#fff', margin: 6, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 8 }}>
          <View style={{ width: '80%', aspectRatio: 4/5, backgroundColor: '#ddd', borderRadius: 2 }} />
        </View>
      );
    case 'T-11':
      // 2 vertical rects (existing)
      return (
        <View style={{ flex: 1, padding: 8, gap: 4 }}>
          <View style={[{ flex: 1 }, darkRect]} />
          <View style={[{ flex: 1 }, darkRect]} />
          <View style={{ height: 10, backgroundColor: '#222', borderRadius: 2, marginHorizontal: 12 }} />
        </View>
      );
    default:
      return (
        <View style={{ flex: 1, padding: 8, gap: 4 }}>
          <View style={[{ flex: 1 }, darkRect]} />
          <View style={[{ flex: 1 }, darkRect]} />
        </View>
      );
  }
};

const PostcardTemplatesScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();

  const cardWidth = (screenWidth - SPACING.lg * 2 - CARD_GAP) / COLUMNS;
  const previewHeight = cardWidth * (4 / 3) - 36; // minus label row height

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
          paddingTop: insets.top + 8,
          paddingHorizontal: SPACING.lg,
          paddingBottom: 16,
        },
        backButton: {
          width: 40,
          height: 40,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 4,
        },
        title: {
          fontFamily: FONTS.inter,
          fontSize: 20,
          fontWeight: FONT_WEIGHTS.bold,
          color: colors.textPrimary,
        },
        subtitle: {
          fontFamily: FONTS.inter,
          fontSize: 14,
          color: colors.textSecondary,
          paddingHorizontal: SPACING.lg,
          marginBottom: 20,
        },
        list: {
          paddingHorizontal: SPACING.lg,
          paddingBottom: insets.bottom + 24,
        },
        row: {
          flexDirection: 'row',
          gap: CARD_GAP,
          marginBottom: CARD_GAP,
        },
        card: {
          width: cardWidth,
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: colors.surfaceVariant,
          borderWidth: 1,
          borderColor: colors.border,
        },
        previewArea: {
          height: previewHeight,
          backgroundColor: '#111',
          overflow: 'hidden',
        },
        labelRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 10,
          paddingVertical: 9,
        },
        cardLabel: {
          fontFamily: FONTS.inter,
          fontSize: 12,
          fontWeight: FONT_WEIGHTS.semibold,
          color: colors.textPrimary,
          flex: 1,
        },
        comingSoon: {
          fontFamily: FONTS.inter,
          fontSize: 10,
          color: colors.textSecondary,
          marginLeft: 4,
        },
      }),
    [colors, insets, cardWidth, previewHeight]
  );

  const renderTemplate = (template: TemplateRegistryEntry) => {
    const available = true; // All registry entries are available
    return (
      <TouchableOpacity
        key={template.id}
        style={styles.card}
        onPress={() => navigation.navigate('PostcardEditor', { templateId: template.id })}
        activeOpacity={0.72}
        accessibilityRole="button"
        accessibilityLabel={`Use ${template.displayName} template`}
      >
        <View style={styles.previewArea}>
          <TemplatePreview templateId={template.id} height={previewHeight} />
        </View>
        <View style={styles.labelRow}>
          <AppText style={styles.cardLabel} numberOfLines={1}>
            {template.displayName}
          </AppText>
        </View>
      </TouchableOpacity>
    );
  };

  // Group into rows of 2
  const rows = useMemo(() => {
    const result: TemplateRegistryEntry[][] = [];
    for (let i = 0; i < TEMPLATE_REGISTRY.length; i += COLUMNS) {
      result.push(TEMPLATE_REGISTRY.slice(i, i + COLUMNS));
    }
    return result;
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <AppText style={styles.title}>Templates</AppText>
      </View>

      <AppText style={styles.subtitle}>Choose a template to create your postcard</AppText>

      <FlatList
        data={rows}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={styles.row}>{item.map(renderTemplate)}</View>
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

export default PostcardTemplatesScreen;
