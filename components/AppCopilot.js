// components/AppCopilot.js
import React from 'react';
import { CopilotProvider, CopilotStep, useCopilot, walkthroughable } from 'react-native-copilot';
import { Image, View, Text, StyleSheet, Pressable } from 'react-native';
import { getTutorialImage } from '../lib/helpImages';

export const WalkthroughableView = walkthroughable(View);

const tooltipStyle = {
  backgroundColor: '#0b2240',
  borderRadius: 12,
  padding: 14,
};

// Composant Tooltip personnalisé avec texte blanc
// Le composant tooltip personnalisé peut recevoir les fonctions comme props OU via useCopilot()
function CustomTooltip(props = {}) {
  // Essayer d'abord les props, puis le hook comme fallback
  const hookValues = useCopilot();
  
  const {
    isFirstStep: propsIsFirstStep,
    isLastStep: propsIsLastStep,
    handleNext: propsHandleNext,
    handlePrev: propsHandlePrev,
    handleStop: propsHandleStop,
    currentStep: propsCurrentStep,
  } = props;

  const {
    isFirstStep: hookIsFirstStep,
    isLastStep: hookIsLastStep,
    handleNext: hookHandleNext,
    handlePrev: hookHandlePrev,
    handleStop: hookHandleStop,
    currentStep: hookCurrentStep,
  } = hookValues || {};

  // Utiliser les props en priorité, sinon le hook
  const isFirstStep = propsIsFirstStep ?? hookIsFirstStep ?? false;
  const isLastStep = propsIsLastStep ?? hookIsLastStep ?? false;
  const handleNext = propsHandleNext ?? hookHandleNext;
  const handlePrev = propsHandlePrev ?? hookHandlePrev;
  const handleStop = propsHandleStop ?? hookHandleStop;
  const currentStep = propsCurrentStep ?? hookCurrentStep;

  console.log('[CustomTooltip] Render', {
    isFirstStep,
    isLastStep,
    hasHandleNext: !!handleNext,
    handleNextType: typeof handleNext,
    currentStepName: currentStep?.name,
    currentStepOrder: currentStep?.order,
    propsKeys: Object.keys(props || {}),
    hookValuesKeys: Object.keys(hookValues || {}),
    hasHookHandleNext: !!hookHandleNext,
    hookValues: hookValues,
    props: props,
  });

  // Récupérer l'image pour cette étape si disponible
  const stepImage = currentStep?.name ? getTutorialImage(currentStep.name) : null;

  return (
    <View style={styles.tooltipContainer} pointerEvents="box-none">
      <View style={styles.tooltip} pointerEvents="auto">
        {/* Afficher l'image si disponible */}
        {stepImage && (
          <Image
            source={stepImage}
            style={{
              width: '100%',
              maxHeight: 150,
              borderRadius: 8,
              marginBottom: 12,
              resizeMode: 'contain',
              backgroundColor: '#f9fafb',
            }}
          />
        )}
        <Text style={styles.tooltipText}>
          {currentStep?.text || ''}
        </Text>
        <View style={styles.tooltipFooter}>
          <View style={styles.tooltipButtons}>
            {!isFirstStep && (
              <Pressable 
                onPress={() => {
                  console.log('[CustomTooltip] handlePrev pressé');
                  handlePrev?.();
                }} 
                style={({ pressed }) => [styles.tooltipButton, pressed && styles.tooltipButtonPressed]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.tooltipButtonText}>Préc.</Text>
              </Pressable>
            )}
            {!isLastStep ? (
              <Pressable 
                onPress={() => {
                  console.log('[CustomTooltip] handleNext pressé', {
                    handleNext: typeof handleNext,
                    isFunction: typeof handleNext === 'function',
                    currentStep: currentStep?.name,
                    currentOrder: currentStep?.order,
                    isFirstStep,
                    isLastStep,
                  });
                  if (handleNext && typeof handleNext === 'function') {
                    try {
                      const result = handleNext();
                      console.log('[CustomTooltip] handleNext résultat:', result);
                    } catch (error) {
                      console.error('[CustomTooltip] Erreur handleNext:', error);
                    }
                  } else {
                    console.warn('[CustomTooltip] handleNext n\'est pas une fonction valide');
                  }
                }} 
                style={({ pressed }) => [styles.tooltipButton, pressed && styles.tooltipButtonPressed]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.tooltipButtonText}>Suivant</Text>
              </Pressable>
            ) : (
              <Pressable 
                onPress={() => {
                  console.log('[CustomTooltip] handleStop pressé (Terminer)');
                  handleStop?.();
                }} 
                style={({ pressed }) => [styles.tooltipButton, pressed && styles.tooltipButtonPressed]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.tooltipButtonText}>Terminer</Text>
              </Pressable>
            )}
            <Pressable 
              onPress={() => {
                console.log('[CustomTooltip] handleStop pressé (Passer)');
                handleStop?.();
              }} 
              style={({ pressed }) => [styles.tooltipButton, pressed && styles.tooltipButtonPressed]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.tooltipButtonText}>Passer</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tooltipContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  tooltip: {
    backgroundColor: '#dcff13',
    borderRadius: 12,
    padding: 14,
    maxWidth: 300,
    minWidth: 200,
    zIndex: 10000,
    elevation: 10000,
  },
  tooltipText: {
    color: '#000000',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
    fontWeight: '400',
  },
  tooltipFooter: {
    marginTop: 8,
  },
  tooltipButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 12,
  },
  tooltipButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  tooltipButtonPressed: {
    opacity: 0.7,
  },
  tooltipButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '600',
  },
});

export { CopilotProvider, useCopilot };

export function Step({ order, name, text, children, image }) {
  // Le composant Step accepte maintenant une prop image optionnelle
  // L'image sera récupérée automatiquement dans CustomTooltip via getTutorialImage(name)
  // mais on peut aussi la passer directement si nécessaire
  return (
    <CopilotStep order={order} name={name} text={text}>
      <WalkthroughableView>{children}</WalkthroughableView>
    </CopilotStep>
  );
}

export { CustomTooltip };

