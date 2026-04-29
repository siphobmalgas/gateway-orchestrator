export interface Merchant {
  id: string;
  merchantIdentifier: string;
  merchantName: string;
  webhookUrl?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
