import { MembershipRole } from "./org.js";

export interface ApiResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  readonly items: T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export interface AuthTokenPayload {
  readonly userId: string;
  readonly organizationId: string;
  readonly role: MembershipRole;
  readonly iat: number;
  readonly exp: number;
}
