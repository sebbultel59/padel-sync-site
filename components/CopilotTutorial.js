// components/CopilotTutorial.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef } from "react";
import { CopilotProvider, useCopilot, walkthroughable, CopilotStep } from "react-native-copilot";
import { Pressable, Text, View } from "react-native";
import { copilotSteps } from "../lib/copilotSteps";

const TUTORIAL_SEEN_KEY = "@padel_sync_tutorial_seen";

// Référence globale pour accéder à start() depuis n'importe où
let globalCopilotStart = null;
let globalCopilotEvents = null;

// Composant interne qui gère le lancement automatique
function CopilotAutoStart({ children }) {
  const { start, copilotEvents } = useCopilot();
  const hasStartedRef = useRef(false);

  // Stocker la référence globale
  useEffect(() => {
    globalCopilotStart = start;
    globalCopilotEvents = copilotEvents;
    return () => {
      globalCopilotStart = null;
      globalCopilotEvents = null;
    };
  }, [start, copilotEvents]);

  useEffect(() => {
    // Écouter les événements pour voir ce qui se passe
    if (copilotEvents) {
      copilotEvents.on("stepChange", (step) => {
        console.log("[Copilot] Étape changée:", step);
      });
      copilotEvents.on("start", () => {
        console.log("[Copilot] Tutoriel démarré (événement start)");
      });
      copilotEvents.on("stop", () => {
        console.log("[Copilot] Tutoriel arrêté");
      });
    }
    
    const checkAndStartTutorial = async () => {
      try {
        const seen = await AsyncStorage.getItem(TUTORIAL_SEEN_KEY);
        if (!seen && !hasStartedRef.current) {
          hasStartedRef.current = true;
          
          // Ne pas démarrer automatiquement ici - laisser groupes.js le faire
          // car il faut que l'utilisateur soit sur l'onglet Groupes pour que step1 soit monté
          console.log("[Copilot] Auto-start désactivé - sera démarré depuis groupes.js");
        }
      } catch (error) {
        console.error("[Copilot] Erreur vérification tutorial:", error);
      }
    };

    checkAndStartTutorial();
  }, [start, copilotEvents]);

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
  console.log("[Copilot] CustomTooltip appelé avec currentStep:", currentStep ? currentStep.name : "null");
  
  // Gérer le format du text (peut être string ou object)
  const stepText = typeof currentStep?.text === 'string' 
    ? currentStep.text 
    : currentStep?.text?.body || currentStep?.text || "";
  const stepTitle = typeof currentStep?.text === 'object' && currentStep?.text?.title
    ? currentStep.text.title
    : typeof currentStep?.text === 'string'
    ? currentStep.text
    : "Bienvenue !";
  
  console.log("[Copilot] CustomTooltip rendu:", { 
    stepName: currentStep?.name, 
    textType: typeof currentStep?.text,
    stepTitle,
    stepText,
    wrapperRef: currentStep?.wrapperRef?.current,
    visible: currentStep?.visible
  });
  
  // Si le wrapperRef est null, afficher quand même le tooltip mais avec un message d'avertissement
  if (!currentStep?.wrapperRef?.current) {
    console.warn("[Copilot] wrapperRef est null pour l'étape:", currentStep?.name);
  }
  
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
        {stepTitle}
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: "#374151",
          lineHeight: 20,
          marginBottom: 16,
        }}
      >
        {stepText}
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
      backdropColor="rgba(0, 0, 0, 0.7)"
    >
      <CopilotAutoStart>{children}</CopilotAutoStart>
    </CopilotProvider>
  );
}

// Export walkthroughable pour créer des composants wrappables
export { walkthroughable, CopilotStep, useCopilot };

// Fonction pour obtenir la fonction start globale
export function getGlobalCopilotStart() {
  return globalCopilotStart;
}

// Fonction utilitaire pour relancer le tutoriel
export async function restartTutorial(copilotStart) {
  try {
    await AsyncStorage.removeItem(TUTORIAL_SEEN_KEY);
    const startFn = copilotStart || globalCopilotStart;
    if (startFn && typeof startFn === 'function') {
      startFn();
    }
  } catch (error) {
    console.error("[Copilot] Erreur relance tutorial:", error);
  }
}
