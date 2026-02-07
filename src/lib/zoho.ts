/**
 * Zoho CRM API Client
 * 
 * Handles authentication and API requests to Zoho CRM.
 * Uses OAuth 2.0 with refresh token for authentication.
 */

interface ZohoTokenResponse {
    access_token: string;
    api_domain: string;
    token_type: string;
    expires_in: number;
}

interface ZohoRecord {
    id?: string;
    [key: string]: any;
}

interface ZohoResponse {
    data: ZohoRecord[];
    info?: {
        count: number;
        more_records: boolean;
        page: number;
        per_page: number;
    };
}

class ZohoCRMClient {
    private accessToken: string | null = null;
    private tokenExpiry: number = 0;

    private clientId = process.env.ZOHO_CLIENT_ID || '';
    private clientSecret = process.env.ZOHO_CLIENT_SECRET || '';
    private refreshToken = process.env.ZOHO_REFRESH_TOKEN || '';
    private accountsUrl = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com';
    private apiDomain = process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com';

    /**
     * Get a valid access token, refreshing if necessary
     */
    private async getAccessToken(): Promise<string> {
        // Return cached token if still valid (with 5 min buffer)
        if (this.accessToken && Date.now() < this.tokenExpiry - 300000) {
            return this.accessToken;
        }

        // Refresh the access token
        const tokenUrl = `${this.accountsUrl}/oauth/v2/token`;
        const params = new URLSearchParams({
            refresh_token: this.refreshToken,
            client_id: this.clientId,
            client_secret: this.clientSecret,
            grant_type: 'refresh_token'
        });

        const response = await fetch(`${tokenUrl}?${params.toString()}`, {
            method: 'POST',
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Zoho token refresh failed: ${error}`);
        }

        const data: ZohoTokenResponse = await response.json();
        this.accessToken = data.access_token;
        this.tokenExpiry = Date.now() + (data.expires_in * 1000);

        return this.accessToken;
    }

    /**
     * Make an authenticated API request to Zoho CRM
     */
    private async request(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        endpoint: string,
        body?: any
    ): Promise<any> {
        const token = await this.getAccessToken();
        const url = `${this.apiDomain}/crm/v6${endpoint}`;

        const options: RequestInit = {
            method,
            headers: {
                'Authorization': `Zoho-oauthtoken ${token}`,
                'Content-Type': 'application/json',
            },
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Zoho API error (${response.status}): ${error}`);
        }

        // Handle empty responses (204 No Content or empty body)
        const text = await response.text();
        if (!text || text.trim() === '') {
            return { data: [] };
        }

        try {
            return JSON.parse(text);
        } catch (error) {
            console.error('Failed to parse Zoho response:', text);
            throw new Error(`Invalid JSON response from Zoho: ${text.substring(0, 100)}`);
        }
    }

    /**
     * Get records from a module
     */
    async getRecords(module: string, params?: {
        fields?: string[];
        page?: number;
        per_page?: number;
        criteria?: string;
    }): Promise<ZohoResponse> {
        let endpoint = `/${module}`;

        if (params) {
            const queryParams = new URLSearchParams();
            if (params.fields) queryParams.set('fields', params.fields.join(','));
            if (params.page) queryParams.set('page', params.page.toString());
            if (params.per_page) queryParams.set('per_page', params.per_page.toString());
            if (params.criteria) queryParams.set('criteria', params.criteria);

            if (queryParams.toString()) {
                endpoint += `?${queryParams.toString()}`;
            }
        }

        return this.request('GET', endpoint);
    }

    /**
     * Get a single record by ID
     */
    async getRecord(module: string, id: string): Promise<ZohoRecord> {
        const response = await this.request('GET', `/${module}/${id}`);
        return response.data[0];
    }

    /**
     * Create a new record
     */
    async createRecord(module: string, data: ZohoRecord): Promise<ZohoRecord> {
        const response = await this.request('POST', `/${module}`, {
            data: [data]
        });

        if (response.data && response.data[0] && response.data[0].details) {
            return { id: response.data[0].details.id, ...data };
        }

        throw new Error('Failed to create record in Zoho CRM');
    }

    /**
     * Update an existing record
     */
    async updateRecord(module: string, id: string, data: ZohoRecord): Promise<ZohoRecord> {
        const response = await this.request('PUT', `/${module}/${id}`, {
            data: [data]
        });

        return { id, ...data };
    }

    /**
     * Delete a record
     */
    async deleteRecord(module: string, id: string): Promise<void> {
        await this.request('DELETE', `/${module}/${id}`);
    }

    /**
     * Search records using COQL
     */
    async searchRecords(query: string): Promise<ZohoResponse> {
        const response = await this.request('POST', '/coql', {
            select_query: query
        });
        return response;
    }
}

// Singleton instance
const zohoClient = new ZohoCRMClient();

export default zohoClient;
export type { ZohoRecord, ZohoResponse };
