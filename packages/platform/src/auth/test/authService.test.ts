import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthServiceImpl } from '../node/authService.js';
import type { ISecureStorageService } from '../common/auth.js';

describe('AuthServiceImpl', () => {
  let authService: AuthServiceImpl;
  let mockSecureStorage: ISecureStorageService;
  let storedTokens: Map<string, string>;

  beforeEach(() => {
    storedTokens = new Map();
    mockSecureStorage = {
      store: vi.fn((k, v) => storedTokens.set(k, v)),
      retrieve: vi.fn((k) => storedTokens.get(k) ?? null),
      delete: vi.fn((k) => { storedTokens.delete(k); }),
    };
    authService = new AuthServiceImpl(mockSecureStorage, {
      openExternal: vi.fn(),
      createLocalServer: vi.fn(),
      fetchJson: vi.fn(),
    });
  });

  it('should start unauthenticated', () => {
    expect(authService.state.isAuthenticated).toBe(false);
    expect(authService.state.user).toBeNull();
  });

  it('should emit onDidChangeAuth when state changes', () => {
    const listener = vi.fn();
    authService.onDidChangeAuth(listener);

    authService._setAuthenticatedState({
      githubId: '12345',
      githubLogin: 'testuser',
      avatarUrl: 'https://github.com/testuser.png',
      copilotTier: 'pro',
    });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].isAuthenticated).toBe(true);
    expect(listener.mock.calls[0][0].user?.githubLogin).toBe('testuser');
  });

  it('should store token on login', () => {
    authService._setToken('gh_test_token_123');
    expect(mockSecureStorage.store).toHaveBeenCalledWith(
      'github.accessToken',
      'gh_test_token_123',
    );
  });

  it('should clear state on logout', async () => {
    authService._setAuthenticatedState({
      githubId: '12345',
      githubLogin: 'testuser',
      avatarUrl: '',
      copilotTier: 'pro',
    });
    authService._setToken('gh_token');

    await authService.logout();

    expect(authService.state.isAuthenticated).toBe(false);
    expect(mockSecureStorage.delete).toHaveBeenCalledWith('github.accessToken');
  });

  it('should restore session from stored token', async () => {
    storedTokens.set('github.accessToken', 'gh_stored_token');

    (authService as any)._platform.fetchJson = vi.fn()
      .mockResolvedValueOnce({
        id: 12345, login: 'testuser', avatar_url: 'https://avatar',
      })
      .mockResolvedValueOnce({ copilot_plan: { plan_type: 'pro' } });

    await authService.tryRestoreSession();

    expect(authService.state.isAuthenticated).toBe(true);
    expect(authService.state.user?.githubLogin).toBe('testuser');
  });
});
