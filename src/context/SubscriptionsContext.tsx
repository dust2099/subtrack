import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { Subscription, SubscriptionMemberPreview } from '@/data/subscriptions';
import { parseDateOnly } from '@/data/subscriptions';
import { SubscriptionsContext } from '@/context/subscriptions-context';
import i18n from '@/lib/i18n';

type SubscriptionRow = {
  id: string;
  owner_id: string;
  catalog_id: string | null;
  name: string;
  cost: number | string;
  currency: string;
  billing_cycle: string;
  next_billing_date: string;
  category: string;
};

type MembershipRow = {
  subscription_id: string;
  user_id: string;
  share_amount: number | string | null;
  status: string;
};

type CatalogRow = {
  id: string;
  logo_url: string | null;
};

type AppearancePreferenceRow = {
  subscription_id: string;
  avatar_color: string;
};

type SubscriptionMemberPreviewRow = {
  subscription_id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

type SubscriptionDataState = {
  userId: string;
  subscriptions: Subscription[];
  error: string | null;
};

function parseAmount(value: number | string | null, field: string) {
  if (value === null) return null;

  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) {
    throw new Error(i18n.t('data.invalidAmount', { field }));
  }
  return amount;
}

async function loadSubscriptions(userId: string): Promise<Subscription[]> {
  const [subscriptionResult, membershipResult, preferenceResult] = await Promise.all([
    supabase
      .from('user_subscriptions')
      .select(
        'id, owner_id, catalog_id, name, cost, currency, billing_cycle, next_billing_date, category',
      ),
    supabase
      .from('subscription_members')
      .select('subscription_id, user_id, share_amount, status'),
    supabase
      .from('subscription_appearance_preferences')
      .select('subscription_id, avatar_color')
      .eq('user_id', userId),
  ]);

  if (subscriptionResult.error) {
    throw new Error(
      i18n.t('data.loadSubscriptions', {
        message: subscriptionResult.error.message,
      }),
    );
  }
  if (membershipResult.error) {
    throw new Error(
      i18n.t('data.loadShared', { message: membershipResult.error.message }),
    );
  }
  if (preferenceResult.error) {
    throw new Error(
      i18n.t('data.loadAppearance', { message: preferenceResult.error.message }),
    );
  }

  const rows = (subscriptionResult.data ?? []) as unknown as SubscriptionRow[];
  const memberships = (membershipResult.data ?? []) as unknown as MembershipRow[];
  const preferences = (preferenceResult.data ?? []) as unknown as AppearancePreferenceRow[];
  const previewsBySubscription = new Map<string, SubscriptionMemberPreview[]>();
  if (rows.length > 0) {
    const previewResult = await supabase.rpc(
      'get_subscription_member_previews',
      { p_subscription_ids: rows.map(({ id }) => id) },
    );
    if (previewResult.error) {
      throw new Error(
        i18n.t('data.loadShared', { message: previewResult.error.message }),
      );
    }

    for (const preview of (previewResult.data ?? []) as SubscriptionMemberPreviewRow[]) {
      const previews = previewsBySubscription.get(preview.subscription_id) ?? [];
      previews.push({
        userId: preview.user_id,
        username: preview.username,
        displayName: preview.display_name,
        avatarUrl: preview.avatar_url,
      });
      previewsBySubscription.set(preview.subscription_id, previews);
    }
  }
  const colorsBySubscription = new Map(
    preferences.map((preference) => [
      preference.subscription_id,
      preference.avatar_color,
    ]),
  );
  const membershipsBySubscription = new Map<string, MembershipRow[]>();
  for (const membership of memberships) {
    const subscriptionMemberships =
      membershipsBySubscription.get(membership.subscription_id) ?? [];
    subscriptionMemberships.push(membership);
    membershipsBySubscription.set(
      membership.subscription_id,
      subscriptionMemberships,
    );
  }
  const catalogIds = [
    ...new Set(
      rows
        .map((row) => row.catalog_id)
        .filter((catalogId): catalogId is string => catalogId !== null),
    ),
  ];
  let logosByCatalogId = new Map<string, string | null>();

  if (catalogIds.length > 0) {
    const catalogResult = await supabase
      .from('subscription_catalog')
      .select('id, logo_url')
      .in('id', catalogIds);

    if (catalogResult.error) {
      throw new Error(
        i18n.t('data.loadLogos', { message: catalogResult.error.message }),
      );
    }

    const catalogRows = (catalogResult.data ?? []) as unknown as CatalogRow[];
    logosByCatalogId = new Map(
      catalogRows.map((catalog) => [catalog.id, catalog.logo_url]),
    );
  }

  return rows.flatMap((row) => {
    const isShared = row.owner_id !== userId;
    const subscriptionMemberships = isShared
      ? membershipsBySubscription.get(row.id)
      : undefined;
    const membership = subscriptionMemberships?.find(
      (candidate) => candidate.status === 'active',
    ) ?? subscriptionMemberships?.[0];

    if (isShared && membership && membership.status !== 'active') return [];

    const billingCycle = row.billing_cycle.toLowerCase();
    if (
      billingCycle !== 'monthly' &&
      billingCycle !== 'yearly' &&
      billingCycle !== 'weekly'
    ) {
      throw new Error(
        i18n.t('data.unsupportedCycle', {
          cycle: row.billing_cycle,
          name: row.name,
        }),
      );
    }

    const cost = parseAmount(row.cost, `cost for "${row.name}"`);
    if (cost === null) {
      throw new Error(i18n.t('data.missingCost', { name: row.name }));
    }
    const shareAmount = isShared && membership
      ? parseAmount(membership.share_amount, `share_amount for "${row.name}"`)
      : null;
    const activeMemberShares = !isShared
      ? (membershipsBySubscription.get(row.id) ?? [])
          .filter((candidate) => candidate.status === 'active')
          .reduce(
            (total, candidate) => {
              const amount = parseAmount(
                candidate.share_amount,
                `share_amount for "${row.name}"`,
              );
              if (amount === null) {
                throw new Error(
                  i18n.t('data.invalidAmount', {
                    field: `share_amount for "${row.name}"`,
                  }),
                );
              }
              return total + amount;
            },
            0,
          )
      : 0;
    if (!isShared && activeMemberShares > cost) {
      throw new Error(i18n.t('data.overallocatedShares', { name: row.name }));
    }
    const userShareAmount = !isShared
      ? cost - activeMemberShares
      : null;

    return [{
      id: row.id,
      catalogId: row.catalog_id,
      name: row.name,
      logoUrl: row.catalog_id
        ? logosByCatalogId.get(row.catalog_id) ?? null
        : null,
      avatarColor: colorsBySubscription.get(row.id) ?? null,
      category: row.category,
      cost,
      currency: row.currency,
      billingCycle,
      nextBillingDate: parseDateOnly(row.next_billing_date),
      isShared,
      shareAmount,
      userShareAmount,
      memberPreviews: previewsBySubscription.get(row.id) ?? [],
    }];
  });
}

export function SubscriptionsProvider({
  userId,
  children,
}: {
  userId: string | undefined;
  children: ReactNode;
}) {
  const { i18n: translationInstance } = useTranslation();
  const language = translationInstance.resolvedLanguage ?? translationInstance.language;
  const [state, setState] = useState<SubscriptionDataState>({
    userId: '',
    subscriptions: [],
    error: null,
  });
  const [refreshVersion, setRefreshVersion] = useState(0);

  const refresh = useCallback(() => {
    setRefreshVersion((version) => version + 1);
  }, []);

  const setAvatarColor = useCallback(
    async (subscriptionId: string, color: string) => {
      if (!userId) {
        throw new Error(i18n.t('data.signInToColor'));
      }

      const { error } = await supabase
        .from('subscription_appearance_preferences')
        .upsert(
          {
            user_id: userId,
            subscription_id: subscriptionId,
            avatar_color: color,
          },
          { onConflict: 'user_id,subscription_id' },
        );

      if (error) {
        throw new Error(i18n.t('data.saveColor', { message: error.message }));
      }

      setState((current) => {
        if (current.userId !== userId) return current;
        return {
          ...current,
          subscriptions: current.subscriptions.map((subscription) =>
            subscription.id === subscriptionId
              ? { ...subscription, avatarColor: color }
              : subscription,
          ),
        };
      });
    },
    [userId],
  );

  useEffect(() => {
    let active = true;

    if (!userId) return;

    void loadSubscriptions(userId)
      .then((subscriptions) => {
        if (active) setState({ userId, subscriptions, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          userId,
          subscriptions: [],
          error:
            error instanceof Error
              ? error.message
              : i18n.t('data.loadGeneric'),
        });
      });

    return () => {
      active = false;
    };
  }, [userId, refreshVersion, language]);

  const currentState = {
    ...(state.userId === userId
      ? {
          subscriptions: state.subscriptions,
          loading: false,
          error: state.error,
        }
      : {
          subscriptions: [],
          loading: Boolean(userId),
          error: null,
        }),
    refresh,
        setAvatarColor,
  };

  return (
    <SubscriptionsContext.Provider value={currentState}>
      {children}
    </SubscriptionsContext.Provider>
  );
}
