import { Disposable, Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import type { IAuthService, AuthState, AuthUser, ISecureStorageService } from '../common/auth.js';

const TOKEN_KEY = 'github.accessToken';
const GITHUB_CLIENT_ID = 'Iv1.PLACEHOLDER';

interface PlatformAPI {
  openExternal(url: string): void;
  createLocalServer(port: number): Promise<{ waitForCallback(): Promise<string>; close(): void }>;
  fetchJson(url: string, headers?: Record<string, string>): Promise<any>;
}

export class AuthServiceImpl extends Disposable implements IAuthService {
  private _state: AuthState = { isAuthenticated: false, user: null };
  private readonly _onDidChangeAuth = this._register(new Emitter<AuthState>());
  readonly onDidChangeAuth: Event<AuthState> = this._onDidChangeAuth.event;

  constructor(
    private readonly _secureStorage: ISecureStorageService,
    private readonly _platform: PlatformAPI,
  ) {
    super();
  }

  get state(): AuthState {
    return this._state;
  }

  async login(): Promise<void> {
    const verifier = this._generateCodeVerifier();
    const challenge = await this._generateCodeChallenge(verifier);
    const state = crypto.randomUUID();

    const server = await this._platform.createLocalServer(17239);

    try {
      const params = new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        redirect_uri: 'http://127.0.0.1:17239/callback',
        scope: 'read:user read:org copilot',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      });

      this._platform.openExternal(
        `https://github.com/login/oauth/authorize?${params}`,
      );

      const callbackUrl = await server.waitForCallback();
      const url = new URL(callbackUrl, 'http://127.0.0.1:17239');
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');

      if (returnedState !== state || !code) {
        throw new Error('OAuth state mismatch or missing code');
      }

      const tokenResponse = await this._platform.fetchJson(
        'https://github.com/login/oauth/access_token',
        {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      );

      const token = tokenResponse.access_token;
      this._setToken(token);
      await this._fetchUserAndSetState(token);
    } finally {
      server.close();
    }
  }

  async logout(): Promise<void> {
    this._secureStorage.delete(TOKEN_KEY);
    this._state = { isAuthenticated: false, user: null };
    this._onDidChangeAuth.fire(this._state);
  }

  async getAccessToken(): Promise<string | null> {
    return this._secureStorage.retrieve(TOKEN_KEY);
  }

  async tryRestoreSession(): Promise<void> {
    const token = this._secureStorage.retrieve(TOKEN_KEY);
    if (token) {
      try {
        await this._fetchUserAndSetState(token);
      } catch {
        this._secureStorage.delete(TOKEN_KEY);
      }
    }
  }

  _setAuthenticatedState(user: AuthUser): void {
    this._state = { isAuthenticated: true, user };
    this._onDidChangeAuth.fire(this._state);
  }

  _setToken(token: string): void {
    this._secureStorage.store(TOKEN_KEY, token);
  }

  private async _fetchUserAndSetState(token: string): Promise<void> {
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    const userInfo = await this._platform.fetchJson('https://api.github.com/user', headers);
    const copilotInfo = await this._platform.fetchJson(
      'https://api.github.com/user/copilot',
      headers,
    );

    const user: AuthUser = {
      githubId: String(userInfo.id),
      githubLogin: userInfo.login,
      avatarUrl: userInfo.avatar_url,
      copilotTier: copilotInfo?.copilot_plan?.plan_type ?? 'free',
    };

    this._setAuthenticatedState(user);
  }

  private _generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  private async _generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
}
