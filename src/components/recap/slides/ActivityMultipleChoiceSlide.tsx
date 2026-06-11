import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FONTS, FONT_WEIGHTS } from '../../../config/constants';
import { RECAP_SLIDE_H_MARGIN, recapSlideStyles } from '../recapSlideStyles';
import RecapAnimatedTitle from '../motion/RecapAnimatedTitle';
import RecapChoiceRow from '../motion/RecapChoiceRow';

interface Props {
  peakDay: string;
  choices: string[];
  onComplete: () => void;
}

function formatChoiceDate(iso: string): string {
  try {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

type ChoiceState = 'idle' | 'correct' | 'wrong' | 'dimmed';

const ActivityMultipleChoiceSlide: React.FC<Props> = ({ peakDay, choices, onComplete }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const revealed = selected !== null;

  const handleChoice = (day: string) => {
    if (revealed) return;
    setSelected(day);
    setTimeout(onComplete, 1800);
  };

  const stateFor = (day: string): ChoiceState => {
    if (!revealed) return 'idle';
    if (day === peakDay) return 'correct';
    if (day === selected) return 'wrong';
    return 'dimmed';
  };

  return (
    <View style={styles.container}>
      <RecapAnimatedTitle>
        Guess the day with the{'\n'}most saved experiences...
      </RecapAnimatedTitle>

      <View style={styles.choices}>
        {choices.map((day, i) => {
          const state = stateFor(day);
          return (
            <RecapChoiceRow key={day} index={i}>
              <TouchableOpacity
                style={[styles.choice, choiceStyle[state]]}
                onPress={() => handleChoice(day)}
                activeOpacity={revealed ? 1 : 0.75}
                accessibilityRole="button"
                accessibilityLabel={formatChoiceDate(day)}
              >
                <Text style={[styles.choiceText, choiceTextStyle[state]]}>
                  {formatChoiceDate(day)}
                </Text>
                {revealed && day === peakDay && <Text style={styles.correctBadge}>✓</Text>}
                {revealed && day === selected && day !== peakDay && (
                  <Text style={styles.wrongBadge}>✗</Text>
                )}
              </TouchableOpacity>
            </RecapChoiceRow>
          );
        })}
      </View>

      {revealed && (
        <Text style={styles.resultLabel}>
          {selected === peakDay ? 'You got it!' : `It was ${formatChoiceDate(peakDay)}`}
        </Text>
      )}
    </View>
  );
};

const choiceStyle: Record<ChoiceState, object> = {
  idle: { borderColor: 'rgba(255,255,255,0.55)', backgroundColor: 'transparent' },
  correct: { borderColor: '#4CAF50', backgroundColor: 'rgba(76,175,80,0.15)' },
  wrong: { borderColor: '#F44336', backgroundColor: 'rgba(244,67,54,0.15)' },
  dimmed: { borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'transparent' },
};

const choiceTextStyle: Record<ChoiceState, object> = {
  idle: { color: '#FFFFFF' },
  correct: { color: '#81C784' },
  wrong: { color: '#EF9A9A' },
  dimmed: { color: 'rgba(255,255,255,0.3)' },
};

const styles = StyleSheet.create({
  container: {
    ...recapSlideStyles.screenWithTopInset,
    paddingHorizontal: RECAP_SLIDE_H_MARGIN,
  },
  choices: {
    gap: 16,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 70,
    borderRadius: 50,
    borderWidth: 1.5,
    paddingHorizontal: 24,
  },
  choiceText: {
    fontFamily: FONTS.inter,
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.semibold,
    flex: 1,
    textAlign: 'center',
  },
  correctBadge: { fontSize: 20, color: '#81C784', marginLeft: 8 },
  wrongBadge: { fontSize: 20, color: '#EF9A9A', marginLeft: 8 },
  resultLabel: {
    fontFamily: FONTS.inter,
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.regular,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginTop: 28,
  },
});

export default ActivityMultipleChoiceSlide;
