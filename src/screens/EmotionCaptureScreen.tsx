// EmotionCaptureScreen
// Full-screen emotion capture flow (mood wheel then specific emotions).
// Uses useNavigation() only (nearest navigator) so goBack() returns to the correct caller:
// - From Capture: nested stack pops to CaptureMain (main capture screen).
// - From EntryEdit: root stack pops to EntryEdit. Do not use root navigator ref here.

import React, { useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppContext } from '../context/AppContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BackArrow from '../components/common/icons/BackArrow';
import EmotionalCaptureFlow from '../components/capture/EmotionalCaptureFlow';
import { useTheme } from '../context/ThemeContext';

type EmotionCaptureNavigationProp = NativeStackNavigationProp<RootStackParamList, 'EmotionCapture'>;
type EmotionCaptureRouteProp = RouteProp<RootStackParamList, 'EmotionCapture'>;

const EmotionCaptureScreen: React.FC = () => {
  const navigation = useNavigation<EmotionCaptureNavigationProp>();
  const route = useRoute<EmotionCaptureRouteProp>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { setPendingEmotionLabels, setPendingEmotionNote } = useAppContext();

  const params = route.params;
  const initialLabels = params?.initialLabels ?? [];
  // route.params?.returnFrom ('Capture' | 'EntryEdit') available for future pop-to-specific-screen if needed.

  const handleClose = () => {
    navigation.goBack();
  };

  const handleSave = (labels: string[], note?: string) => {
    setPendingEmotionLabels(labels);
    const trimmedNote = note?.trim();
    setPendingEmotionNote(trimmedNote && trimmedNote.length > 0 ? trimmedNote.slice(0, 200) : null);
    navigation.goBack(); // Returns to CaptureMain (from Capture) or EntryEdit (from EntryEdit).
  };

  const screenHeight = Dimensions.get('window').height;
  const spacingBelowClose = Math.round(0.06 * screenHeight);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        backButton: { position: 'absolute', top: 16, left: 16, zIndex: 10, padding: 8 },
        flowWrapper: { paddingHorizontal: 16, minHeight: 0 },
      }),
    [colors]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={handleClose}
        activeOpacity={0.7}
      >
        <BackArrow width={19} height={21} color={colors.textPrimary} />
      </TouchableOpacity>
      <View
        style={[
          styles.flowWrapper,
          { flex: 1, paddingTop: 45 + spacingBelowClose },
        ]}
      >
        <EmotionalCaptureFlow
          initialLabels={initialLabels}
          onClose={handleClose}
          onSave={handleSave}
        />
      </View>
    </View>
  );
};

export default EmotionCaptureScreen;
