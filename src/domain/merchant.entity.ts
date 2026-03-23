export interface Merchant {
  id: string;
  merchantIdentifier: string;
  merchantName: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
