'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { apiLogin, apiRegister, getMe, getOrganizations, switchOrg as apiSwitchOrg } from './api';
import type { Organization } from '@tandemu/types';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role?: string;
  oauthProviders?: string[];
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  hasOrganization: boolean;
  currentOrg: Organization | null;
  organizations: Organization[];
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  switchOrg: (organizationId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PUBLIC_PATHS = ['/login', '/register', '/setup', '/cli-auth', '/auth/callback'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const clearAuth = useCallback(() => {
    localStorage.removeItem('tandemu_token');
    localStorage.removeItem('tandemu_current_org');
    setToken(null);
    setUser(null);
    setOrganizations([]);
    setCurrentOrg(null);
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    router.push('/login');
  }, [clearAuth, router]);

  const resolveCurrentOrg = useCallback((orgs: Organization[]) => {
    if (orgs.length === 0) {
      setCurrentOrg(null);
      return;
    }
    // Try to restore last selected org from localStorage
    const savedOrgId = localStorage.getItem('tandemu_current_org');
    const saved = savedOrgId ? orgs.find((o) => o.id === savedOrgId) : null;
    setCurrentOrg(saved ?? orgs[0]);
  }, []);

  // On mount, check for existing token
  useEffect(() => {
    const storedToken = localStorage.getItem('tandemu_token');
    if (!storedToken) {
      setIsLoading(false);
      if (!PUBLIC_PATHS.includes(pathname)) {
        router.push(`/login?redirect=${encodeURIComponent(pathname + window.location.search)}`);
      }
      return;
    }

    setToken(storedToken);

    Promise.all([getMe(), getOrganizations()])
      .then(([userData, orgs]) => {
        setUser(userData);
        setOrganizations(orgs);
        resolveCurrentOrg(orgs);
        if (orgs.length === 0 && !PUBLIC_PATHS.includes(pathname)) {
          router.push('/setup');
        }
      })
      .catch(() => {
        clearAuth();
        if (!PUBLIC_PATHS.includes(pathname)) {
          router.push(`/login?redirect=${encodeURIComponent(pathname + window.location.search)}`);
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (email: string, password: string) => {
    const response = await apiLogin(email, password);
    localStorage.setItem('tandemu_token', response.accessToken);
    setToken(response.accessToken);
    setUser(response.user);

    const orgs = await getOrganizations();
    setOrganizations(orgs);
    resolveCurrentOrg(orgs);

    if (orgs.length === 0) {
      router.push('/setup');
    } else {
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get('redirect') || localStorage.getItem('tandemu_auth_redirect');
      localStorage.removeItem('tandemu_auth_redirect');
      router.push(redirect || '/');
    }
  };

  const register = async (email: string, name: string, password: string) => {
    const response = await apiRegister(email, name, password);
    localStorage.setItem('tandemu_token', response.accessToken);
    setToken(response.accessToken);
    setUser(response.user);
    router.push('/setup');
  };

  const switchOrg = async (organizationId: string) => {
    const result = await apiSwitchOrg(organizationId);
    localStorage.setItem('tandemu_token', result.accessToken);
    localStorage.setItem('tandemu_current_org', organizationId);
    setToken(result.accessToken);

    const org = organizations.find((o) => o.id === organizationId);
    if (org) setCurrentOrg(org);

    // Reload the page to refresh all data with the new org context
    window.location.reload();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isAdmin: user?.role === 'OWNER' || user?.role === 'ADMIN',
        hasOrganization: organizations.length > 0,
        currentOrg,
        organizations,
        isLoading,
        login,
        register,
        logout,
        switchOrg,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
