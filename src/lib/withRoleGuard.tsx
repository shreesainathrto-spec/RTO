// src/lib/withRoleGuard.tsx
import React from "react";
import { getSession } from "./auth";
import { Navigate } from "@tanstack/react-router";

/**
 * Higher order component that restricts access to users with the specified role.
 * If the user does not have the role, they are redirected to the settings page.
 */
export function withRoleGuard<P>(Component: React.ComponentType<P>, requiredRole: string) {
  return function GuardedComponent(props: P) {
    const session = getSession();
    if (!session) {
      // Not logged in – let the app handle auth redirect elsewhere.
      return null;
    }
    if (session.role !== requiredRole) {
      // Not authorized – redirect to settings (or a 403 page).
      return <Navigate to="/dashboard/settings" replace />;
    }
    return <Component {...(props as any)} />;
  };
}
