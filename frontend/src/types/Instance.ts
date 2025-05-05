export interface Instance {
  _id: string;
  instanceName: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'failed';
  serverUrl: string;
  apiKey?: string;
  profileName?: string;
  profilePictureUrl?: string;
  profileStatus?: string;
  owner?: string;
  lastConnection?: Date;
  webhook?: {
    url?: string;
    events?: string[];
  };
  throttling?: {
    perSecond?: number;
    perMinute?: number;
    perHour?: number;
    perBatch?: number;
    batchDelay?: number;
    retryDelay?: number;
    maxRetries?: number;
  };
  metrics?: {
    totalSent?: number;
    totalDelivered?: number;
    totalFailed?: number;
  };
  createdAt?: Date;
  lastUpdated?: Date;
} 