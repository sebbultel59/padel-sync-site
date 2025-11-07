// components/AppCopilot.js

import React from 'react';

import { copilot, CopilotStep, walkthroughable, DEFAULT_TOOLTIP } from 'react-native-copilot';

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



export function withCopilot(Component) {

  return copilot({

    animated: true,

    overlay: 'svg',         // spotlight doux

    tooltipStyle,

    arrowColor,

    stepNumberTextColor,

    labels: { previous: 'Préc.', next: 'Suivant', skip: 'Passer', finish: 'Terminer' },

  })(Component);

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

