const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001"

class ApiService {
    private async request<T>(endpoint:string, options:RequestInit = {}): Promise<T>{
        const url = `${BASE_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
        
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        }

        const response = await fetch(url, {
            ...options,
            headers
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.log(errorData);
            throw new Error(errorData.message || errorData.error || `HTTP Error: ${response.status}`);
        }

        return response.json();
    }

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

        return this.request<T>(finalEndpoint, {
            method: 'GET'
        });
    }

    public post<T>(endpoint: string, body: any): Promise<T> {
        return this.request<T>(endpoint, {
            "method": 'POST',
            "body": JSON.stringify(body)
        });
    }
}

export const apiService = new ApiService();