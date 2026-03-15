export type MarketplaceSource =
  | { type: 'github'; repo: string; ref?: string }
  | { type: 'url'; url: string }
  | { type: 'local'; path: string };

export interface MarketplaceEntry {
  name: string;
  source: MarketplaceSource;
  owner?: { name: string; email?: string };
  lastUpdated?: string;
  isDefault?: boolean;
}
