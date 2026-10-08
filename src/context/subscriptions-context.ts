import { createContext } from 'react';
import type { Subscription } from '@/data/subscriptions';

export type SubscriptionContextValue = {
  subscriptions: Subscription[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  setAvatarColor: (subscriptionId: string, color: string) => Promise<void>;
};

export const SubscriptionsContext =
  createContext<SubscriptionContextValue | null>(null);
