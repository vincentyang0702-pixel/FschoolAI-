/**
 * Canvas OAuth Integration Service
 * 
 * Handles OAuth 2.0 authentication flow with Canvas:
 * - Authorization code flow
 * - Token exchange
 * - Token refresh
 * - Token storage and retrieval
 */

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  canvasInstanceUrl: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export class CanvasOAuthService {
  private config: OAuthConfig;
  private supabase = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.VITE_SUPABASE_ANON_KEY || ''
  );

  constructor(config: OAuthConfig) {
    this.config = config;
  }

  /**
   * Generate OAuth authorization URL
   */
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      state: state,
      scope: 'url:POST|GET', // Canvas scopes
    });

    return `${this.config.canvasInstanceUrl}/oauth2/auth?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<TokenResponse> {
    try {
      const response = await axios.post(
        `${this.config.canvasInstanceUrl}/oauth2/token`,
        {
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code: code,
          redirect_uri: this.config.redirectUri,
          grant_type: 'authorization_code',
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error exchanging code for token:', error);
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    try {
      const response = await axios.post(
        `${this.config.canvasInstanceUrl}/oauth2/token`,
        {
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error refreshing token:', error);
      throw error;
    }
  }

  /**
   * Store Canvas OAuth token in database
   */
  async storeToken(
    userId: string,
    accessToken: string,
    refreshToken?: string,
    expiresIn?: number
  ): Promise<void> {
    try {
      const expiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 1000)
        : null;

      const { error } = await this.supabase
        .from('canvas_oauth_tokens')
        .upsert(
          {
            user_id: userId,
            canvas_instance_url: this.config.canvasInstanceUrl,
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: expiresAt,
            updated_at: new Date(),
          },
          {
            onConflict: 'user_id',
          }
        );

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error storing Canvas token:', error);
      throw error;
    }
  }

  /**
   * Retrieve Canvas OAuth token from database
   */
  async getToken(userId: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
  } | null> {
    try {
      const { data, error } = await this.supabase
        .from('canvas_oauth_tokens')
        .select('access_token, refresh_token, expires_at')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_at ? new Date(data.expires_at) : undefined,
      };
    } catch (error) {
      console.error('Error retrieving Canvas token:', error);
      return null;
    }
  }

  /**
   * Check if token is expired and refresh if needed
   */
  async getValidToken(userId: string): Promise<string | null> {
    try {
      const token = await this.getToken(userId);
      if (!token) {
        return null;
      }

      // Check if token is expired
      if (token.expiresAt && new Date() > token.expiresAt) {
        if (token.refreshToken) {
          // Refresh the token
          const newToken = await this.refreshToken(token.refreshToken);
          await this.storeToken(
            userId,
            newToken.access_token,
            newToken.refresh_token,
            newToken.expires_in
          );
          return newToken.access_token;
        }
      }

      return token.accessToken;
    } catch (error) {
      console.error('Error getting valid token:', error);
      return null;
    }
  }

  /**
   * Revoke Canvas OAuth token
   */
  async revokeToken(userId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('canvas_oauth_tokens')
        .delete()
        .eq('user_id', userId);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error revoking Canvas token:', error);
      throw error;
    }
  }
}

export default CanvasOAuthService;
