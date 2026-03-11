import { createServiceIdentifier } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import type { AuthState } from '../../ipc/common/ipc.js';

export type { AuthState };

export interface AuthUser {
  githubId: string;
  githubLogin: string;
  avatarUrl: string;
  copilotTier: 'free' | 'pro' | 'pro_plus' | 'business' | 'enterprise';
}

export interface IAuthService {
  readonly state: AuthState;
  readonly onDidChangeAuth: Event<AuthState>;
  login(): Promise<void>;
  logout(): Promise<void>;
  getAccessToken(): Promise<string | null>;
}

export const IAuthService = createServiceIdentifier<IAuthService>('IAuthService');

export interface ISecureStorageService {
  store(key: string, value: string): void;
  retrieve(key: string): string | null;
  delete(key: string): void;
}

export const ISecureStorageService =
  createServiceIdentifier<ISecureStorageService>('ISecureStorageService');
