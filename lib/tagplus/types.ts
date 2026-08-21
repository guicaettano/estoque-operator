export interface TagPlusOAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: "bearer" | string;
  expires_in: number;
}

export interface TagPlusConnection {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_type: string;
  scopes: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

// The public guide documents /produtos as a collection but does not publish a field schema.
// Preserve each product exactly as returned instead of inventing fields.
export type TagPlusProduct = Record<string, unknown>;
export type TagPlusProductsResponse = TagPlusProduct[];

export interface TagPlusApiError {
  error_code?: string;
  message?: string;
  dev_message?: string;
  data?: unknown[];
}

export class TagPlusIntegrationError extends Error {
  constructor(message: string, public readonly status: number, public readonly details?: TagPlusApiError) {
    super(message);
  }
}
