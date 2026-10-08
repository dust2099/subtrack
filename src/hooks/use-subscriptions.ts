import { useContext } from 'react';
import { SubscriptionsContext } from '@/context/subscriptions-context';

export function useSubscriptions() {
  const context = useContext(SubscriptionsContext);
  if (!context) {
    throw new Error(
      'useSubscriptions must be used within SubscriptionsProvider.',
    );
  }
  return context;
}
