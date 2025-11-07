// components/CopilotTutorial.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef } from "react";
import { CopilotProvider, useCopilot, walkthroughable, CopilotStep } from "react-native-copilot";
import { Pressable, Text, View } from "react-native";
import { copilotSteps } from "../lib/copilotSteps";

const TUTORIAL_SEEN_KEY = "@padel_sync_tutorial_seen";

// Composant interne qui gère le lancement automatique
function CopilotAutoStart({ children }) {
  const { start, copilotEvents } = useCopilot();
  const hasStartedRef = useRef(false);

  useEffect(() => {
    const checkAndStartTutorial = async () => {
      try {
        const seen = await AsyncStorage.getItem(TUTORIAL_SEEN_KEY);
        if (!seen && !hasStartedRef.current) {
          hasStartedRef.current = true;
          // Délai pour s'assurer que l'UI est prête
          setTimeout(() => {
            start();
          }, 1000);
        }
      } catch (error) {
        console.error("[Copilot] Erreur vérification tutorial:", error);
      }
    };

    checkAndStartTutorial();
  }, [start]);

  useEffect(() => {
    const handleTutorialEnd = () => {
      AsyncStorage.setItem(TUTORIAL_SEEN_KEY, "true").catch(console.error);
    };

    copilotEvents.on("stop", handleTutorialEnd);
    return () => {
      copilotEvents.off("stop", handleTutorialEnd);
    };
  }, [copilotEvents]);

  return <>{children}</>;
}

// Composant personnalisé pour le numéro d'étape
function StepNumber({ currentStepNumber, totalSteps }) {
  return (
    <View
      style={{
        backgroundColor: "#e0ff00",
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 4,
        marginBottom: 8,
      }}
    >
      <View
        style={{
          backgroundColor: "#001831",
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 6,
        }}
      >
        <Text
          style={{
            color: "#e0ff00",
            fontSize: 14,
            fontWeight: "800",
            textAlign: "center",
          }}
        >
          {currentStepNumber} / {totalSteps}
        </Text>
      </View>
    </View>
  );
}

// Composant personnalisé pour le tooltip
function CustomTooltip({ currentStep, handlePrev, handleNext, handleStop, isFirstStep, isLastStep }) {
  return (
    <View
      style={{
        backgroundColor: "#ffffff",
        borderRadius: 16,
        padding: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
        maxWidth: 320,
      }}
    >
      <Text
        style={{
          fontSize: 18,
          fontWeight: "900",
          color: "#001831",
          marginBottom: 8,
        }}
      >
        {currentStep?.text?.title || "Bienvenue !"}
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: "#374151",
          lineHeight: 20,
          marginBottom: 16,
        }}
      >
        {currentStep?.text?.body || ""}
      </Text>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        {!isFirstStep && (
          <Pressable
            onPress={handlePrev}
            style={{
              flex: 1,
              backgroundColor: "#f3f4f6",
              borderRadius: 8,
              paddingVertical: 10,
              paddingHorizontal: 16,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: "#374151",
                fontWeight: "700",
                fontSize: 14,
              }}
            >
              Précédent
            </Text>
          </Pressable>
        )}
        {isLastStep ? (
          <Pressable
            onPress={handleStop}
            style={{
              flex: 1,
              backgroundColor: "#e0ff00",
              borderRadius: 8,
              paddingVertical: 10,
              paddingHorizontal: 16,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: "#001831",
                fontWeight: "900",
                fontSize: 14,
              }}
            >
              Terminer
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleNext}
            style={{
              flex: 1,
              backgroundColor: "#156bc9",
              borderRadius: 8,
              paddingVertical: 10,
              paddingHorizontal: 16,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: "#ffffff",
                fontWeight: "900",
                fontSize: 14,
              }}
            >
              Suivant
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// Wrapper principal
export function CopilotTutorialProvider({ children }) {
  return (
    <CopilotProvider
      stepNumberComponent={StepNumber}
      tooltipComponent={CustomTooltip}
      overlay="svg"
      animated
      steps={copilotSteps}
    >
      <CopilotAutoStart>{children}</CopilotAutoStart>
    </CopilotProvider>
  );
}

// Export walkthroughable pour créer des composants wrappables
export { walkthroughable, CopilotStep, useCopilot };

// Fonction utilitaire pour relancer le tutoriel
export async function restartTutorial(copilotStart) {
  try {
    await AsyncStorage.removeItem(TUTORIAL_SEEN_KEY);
    if (copilotStart) {
      copilotStart();
    }
  } catch (error) {
    console.error("[Copilot] Erreur relance tutorial:", error);
  }
}
