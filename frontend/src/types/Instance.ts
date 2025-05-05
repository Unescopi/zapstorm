export type InstanceStatus = 'disconnected' | 'connected' | 'connecting' | 'failed';

export type WebhookEvent = 
  | 'message' 
  | 'message-status' 
  | 'connection-status'
  | 'QRCODE_UPDATED'
  | 'CONNECTION_UPDATE'
  | 'MESSAGES_SET'
  | 'MESSAGES_UPSERT'
  | 'MESSAGES_UPDATE'
  | 'MESSAGES_DELETE'
  | 'SEND_MESSAGE'
  | 'CONTACTS_SET'
  | 'CONTACTS_UPSERT'
  | 'CONTACTS_UPDATE'
  | 'PRESENCE_UPDATE'
  | 'CHATS_SET'
  | 'CHATS_UPDATE'
  | 'CHATS_UPSERT'
  | 'CHATS_DELETE'
  | 'GROUPS_UPSERT'
  | 'GROUPS_UPDATE'
  | 'GROUP_PARTICIPANTS_UPDATE'
  | 'NEW_TOKEN';

export type Webhook = {
  enabled: boolean;
  url: string;
  webhookByEvents: boolean;
  webhookBase64: boolean;
  events: WebhookEvent[];
}

export type ThrottlingConfig = {
  perSecond: number;
  perMinute: number;
  perHour: number;
  perBatch: number;
  batchDelay: number;
  retryDelay: number;
  maxRetries: number;
}

export type Instance = {
  _id: string;
  instanceName: string;
  status: InstanceStatus;
  serverUrl: string;
  profileName?: string;
  profilePictureUrl?: string;
  profileStatus?: string;
  owner?: string;
  qrcode?: string;
  lastConnection?: string;
  createdAt: string;
  webhook?: Webhook;
  throttling?: ThrottlingConfig;
}; 