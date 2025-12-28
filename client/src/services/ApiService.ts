/**
 * ApiService - Centralized API Client
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001"

class ApiService {

    private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const url = `${BASE_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        }

        const response = await fetch(url, {
            ...options,
            headers,
            credentials: 'include'  // Critical: Send/receive cookies
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || errorData.error || `HTTP Error: ${response.status}`);
        }

        return response.json();
    }

    /**
     * GET request with query params support
     */
    public get<T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
        let finalEndpoint = endpoint;

        if (params) {
            const searchParams = new URLSearchParams();

            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                    searchParams.append(key, String(value));
                }
            });

            const queryString = searchParams.toString();
            if (queryString) {
                const separator = endpoint.includes('?') ? '&' : '?';
                finalEndpoint += `${separator}${queryString}`;
            }
        }

        return this.request<T>(finalEndpoint, { method: 'GET' });
    }

    /**
     * POST request with JSON body
     */
    public post<T>(endpoint: string, body?: any): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'POST',
            body: body ? JSON.stringify(body) : undefined
        });
    }

    // ========================================
    // DataModels API
    // ========================================

    /**
     * Get all data
     */
    public getModels() {
        return this.get<IModel[]>('/models');
    }

    /**
     * Get model by ID
     */
    public getModelById(id: string) {
        return this.get<IModel>(`/models/${id}`);
    }

    /**
     * Check if model hash exists
     */
    public checkModelHash(hash: string) {
        return this.get<{ exists: boolean }>(`/models/check/${hash}`);
    }

    /**
     * Confirm model upload
     */
    public confirmModel(data: {
        name: string;
        type: string;
        modelFileCid: string;
        size: number;
        hash: string;
    }) {
        return this.post('/models/confirm', data);
    }

    // ========================================
    // Auth API
    // ========================================

    /**
     * Get nonce for SIWE
     * returns { nonce: string; expiresAt: string }
     */
    public getNonce() {
        return this.get<{ nonce: string; expiresAt: string }>('/auth/nonce');
    }

    /**
     * Verify SIWE signature
     * returns { success: boolean; walletAddress: string }
     */
    public verifySiweSignature(message: string, signature: string) {
        return this.post<{ success: boolean; walletAddress: string }>('/auth/verify', {
            message,
            signature
        });
    }

    /**
     * Check authentication status
     * Returns { authenticated: boolean; walletAddress?: string }
     */
    public checkAuth() {
        return this.get<{ authenticated: boolean; walletAddress?: string }>('/auth/me');
    }

    /**
     * Logout
     * Returns { success: boolean }
     */
    public logout() {
        return this.post<{ success: boolean }>('/auth/logout');
    }

    // ========================================
    // Pinata API
    // ========================================

    /**
     * Get signed URL for Pinata upload
     * Returns { signedUrl: string }
     */
    public getPinataSignedUrl(fileName: string) {
        return this.get<{ signedUrl: string }>('/pinata-auth/signed-url', { fileName });
    }
}

export const apiService = new ApiService();