"use client";

import { createContext, useContext, type ReactNode } from "react";

// Default closed even when an entry is accidentally rendered outside the layout.
const WorkspaceAvailabilityContext = createContext(false);

export function WorkspaceAvailabilityProvider({ enabled, children }: { enabled: boolean; children?: ReactNode }) {
  return <WorkspaceAvailabilityContext.Provider value={enabled === true}>{children}</WorkspaceAvailabilityContext.Provider>;
}

/** This server-provided value controls discovery, never write permissions. */
export function useWorkspaceAvailability(): boolean {
  return useContext(WorkspaceAvailabilityContext);
}
