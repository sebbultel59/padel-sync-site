// components/AppCopilot.js

import React from 'react';

import { CopilotProvider, CopilotStep, useCopilot, walkthroughable, DEFAULT_TOOLTIP } from 'react-native-copilot';

import { View, Text } from 'react-native';



export const WalkthroughableView = walkthroughable(View);



const tooltipStyle = {

  ...DEFAULT_TOOLTIP,

  backgroundColor: '#0b2240',

  borderRadius: 12,

  padding: 14,

};

const arrowColor = '#0b2240';

const stepNumberTextColor = '#FF751F';



// Export CopilotProvider pour wrapper l'app
export { CopilotProvider };

// Export useCopilot hook pour utiliser dans les composants
export { useCopilot };

// HOC pour wrapper un composant et passer start/copilotEvents en props
// Utilise des refs pour éviter les re-renders infinis
export function withCopilot(Component) {
  return React.memo(function WrappedComponent(props) {
    const { start, copilotEvents } = useCopilot();
    const startRef = React.useRef(start);
    const eventsRef = React.useRef(copilotEvents);
    
    // Mettre à jour les refs sans déclencher de re-render
    React.useEffect(() => {
      startRef.current = start;
      eventsRef.current = copilotEvents;
    });
    
    // Créer des fonctions stables qui utilisent les refs
    const stableStart = React.useCallback(() => {
      if (startRef.current && typeof startRef.current === 'function') {
        startRef.current();
      }
    }, []);
    
    return <Component {...props} start={stableStart} copilotEvents={eventsRef.current} />;
  });
}



/** Bulle de texte courte, style Padel Sync */

export function Tip({ children }) {

  return <Text style={{ color: 'white', fontSize: 15, lineHeight: 20 }}>{children}</Text>;

}



// Petit helper pour créer une étape

export function Step({ order, name, text, children }) {

  return (

    <CopilotStep order={order} name={name} text={<Tip>{text}</Tip>}>

      <WalkthroughableView>{children}</WalkthroughableView>

    </CopilotStep>

  );

}

