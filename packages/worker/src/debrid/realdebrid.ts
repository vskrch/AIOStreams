/**
 * Real-Debrid Service for Workers
 * 
 * Integration with Real-Debrid API for cached torrent streaming.
 */

const RD_API = 'https://api.real-debrid.com/rest/1.0';

export interface RealDebridConfig {
  apiKey: string;
}

export interface RDAccountInfo {
  username: string;
  email: string;
  premium: boolean;
  expiration: string;
}

export interface RDCacheStatus {
  hash: string;
  cached: boolean;
  files?: Array<{
    id: number;
    filename: string;
    filesize: number;
  }>;
}

/**
 * Real-Debrid API Client
 */
export class RealDebrid {
  private apiKey: string;
  
  constructor(config: RealDebridConfig) {
    this.apiKey = config.apiKey;
  }
  
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${RD_API}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        ...options.headers,
      },
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Real-Debrid API error: ${response.status} - ${error}`);
    }
    
    return response.json();
  }
  
  /**
   * Validate API key
   */
  async validate(): Promise<boolean> {
    try {
      await this.request('/user');
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Get account information
   */
  async getAccountInfo(): Promise<RDAccountInfo> {
    const data = await this.request<{
      username: string;
      email: string;
      premium: number;
      expiration: string;
    }>('/user');
    
    return {
      username: data.username,
      email: data.email,
      premium: data.premium > 0,
      expiration: data.expiration,
    };
  }
  
  /**
   * Check if torrents are cached
   */
  async checkCache(hashes: string[]): Promise<Map<string, RDCacheStatus>> {
    if (hashes.length === 0) {
      return new Map();
    }
    
    // RD accepts up to 100 hashes at a time
    const chunks: string[][] = [];
    for (let i = 0; i < hashes.length; i += 100) {
      chunks.push(hashes.slice(i, i + 100));
    }
    
    const results = new Map<string, RDCacheStatus>();
    
    for (const chunk of chunks) {
      const hashString = chunk.join('/');
      const data = await this.request<Record<string, { rd?: Array<Record<string, { filename: string; filesize: number }>> }>>(
        `/torrents/instantAvailability/${hashString}`
      );
      
      for (const hash of chunk) {
        const hashLower = hash.toLowerCase();
        const availability = data[hashLower] || data[hash];
        
        if (availability?.rd && availability.rd.length > 0) {
          // Get the best variant (first one usually)
          const variant = availability.rd[0];
          const files = Object.entries(variant).map(([id, file]) => ({
            id: parseInt(id),
            filename: file.filename,
            filesize: file.filesize,
          }));
          
          results.set(hashLower, {
            hash: hashLower,
            cached: true,
            files,
          });
        } else {
          results.set(hashLower, {
            hash: hashLower,
            cached: false,
          });
        }
      }
    }
    
    return results;
  }
  
  /**
   * Add magnet link to Real-Debrid
   */
  async addMagnet(magnet: string): Promise<string> {
    const formData = new URLSearchParams();
    formData.set('magnet', magnet);
    
    const data = await this.request<{ id: string }>('/torrents/addMagnet', {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    
    return data.id;
  }
  
  /**
   * Get torrent info
   */
  async getTorrentInfo(id: string): Promise<{
    id: string;
    filename: string;
    hash: string;
    status: string;
    files: Array<{
      id: number;
      path: string;
      bytes: number;
      selected: number;
    }>;
    links: string[];
  }> {
    return this.request(`/torrents/info/${id}`);
  }
  
  /**
   * Select files in a torrent
   */
  async selectFiles(id: string, fileIds: number[] | 'all'): Promise<void> {
    const formData = new URLSearchParams();
    formData.set('files', fileIds === 'all' ? 'all' : fileIds.join(','));
    
    await this.request(`/torrents/selectFiles/${id}`, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  }
  
  /**
   * Unrestrict a link
   */
  async unrestrictLink(link: string): Promise<{
    id: string;
    filename: string;
    filesize: number;
    download: string;
    mimeType: string;
    streamable: number;
  }> {
    const formData = new URLSearchParams();
    formData.set('link', link);
    
    return this.request('/unrestrict/link', {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  }
  
  /**
   * Get streaming URL for a cached torrent
   */
  async getStreamUrl(
    hash: string,
    fileId?: number
  ): Promise<string | null> {
    try {
      // Add magnet
      const magnetUrl = `magnet:?xt=urn:btih:${hash}`;
      const torrentId = await this.addMagnet(magnetUrl);
      
      // Get torrent info
      const info = await this.getTorrentInfo(torrentId);
      
      // Select files
      if (fileId !== undefined) {
        await this.selectFiles(torrentId, [fileId]);
      } else {
        await this.selectFiles(torrentId, 'all');
      }
      
      // Wait a moment for processing
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Get updated info with links
      const updatedInfo = await this.getTorrentInfo(torrentId);
      
      if (!updatedInfo.links || updatedInfo.links.length === 0) {
        return null;
      }
      
      // Unrestrict the first link
      const unrestricted = await this.unrestrictLink(updatedInfo.links[0]);
      
      return unrestricted.download;
    } catch (error) {
      console.error('Real-Debrid getStreamUrl error:', error);
      return null;
    }
  }
}
