import type { ApiResponse, ApiError } from '@bi/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...init?.headers,
        },
      });
    } catch {
      throw new ApiRequestError(
        `Cannot reach API server at ${this.baseUrl}. Is it running?`,
        'NETWORK_ERROR',
        0,
      );
    }

    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      let code = 'REQUEST_ERROR';
      try {
        const error: ApiError = await response.json();
        message = error.error.message;
        code = error.error.code;
      } catch {
        // Response wasn't JSON — use status text
        message = `${response.status} ${response.statusText}`;
      }
      throw new ApiRequestError(message, code, response.status);
    }

    const body: ApiResponse<T> = await response.json();
    return body.data;
  }

  get<T>(path: string) {
    return this.request<T>(path, { method: 'GET' });
  }

  post<T>(path: string, data: unknown) {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async upload<T>(path: string, file: File): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const formData = new FormData();
    formData.append('file', file);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        body: formData,
      });
    } catch {
      throw new ApiRequestError(
        `Cannot reach API server at ${this.baseUrl}. Is it running?`,
        'NETWORK_ERROR',
        0,
      );
    }

    if (!response.ok) {
      let message = `Upload failed (${response.status})`;
      let code = 'UPLOAD_ERROR';
      try {
        const error: ApiError = await response.json();
        message = error.error.message;
        code = error.error.code;
      } catch {
        message = `${response.status} ${response.statusText}`;
      }
      throw new ApiRequestError(message, code, response.status);
    }

    const body: ApiResponse<T> = await response.json();
    return body.data;
  }
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export const api = new ApiClient(API_BASE);
