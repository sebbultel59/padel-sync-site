// lib/activeGroup.js
import React, { createContext, useContext, useState } from "react";

const ActiveGroupContext = createContext({
  activeGroup: null,
  setActiveGroup: () => {},
});

export function ActiveGroupProvider({ children }) {
  const [activeGroup, setActiveGroup] = useState(null);

  return (
    <ActiveGroupContext.Provider value={{ activeGroup, setActiveGroup }}>
      {children}
    </ActiveGroupContext.Provider>
  );
}

export function useActiveGroup() {
  return useContext(ActiveGroupContext);
}