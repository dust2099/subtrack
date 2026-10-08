import i18n from '@/lib/i18n';

export type Subscription = {
  id: string;
  catalogId: string | null;
  name: string;
  logoUrl: string | null;
  avatarColor: string | null;
  category: string;
  cost: number;
  currency: string;
  billingCycle: 'monthly' | 'yearly' | 'weekly';
  nextBillingDate: Date;
  isShared: boolean;
  shareAmount: number | null;
  userShareAmount: number | null;
  memberPreviews: SubscriptionMemberPreview[];
};

export type SubscriptionMemberPreview = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export type MonthlyTotal = {
  currency: string;
  amount: number;
};

const avatarPalette = [
  '#fecaca',
  '#fed7aa',
  '#fde68a',
  '#d9f99d',
  '#a7f3d0',
  '#a5f3fc',
  '#bfdbfe',
  '#c7d2fe',
  '#ddd6fe',
  '#fbcfe8',
  '#e9d5ff',
  '#bae6fd',
];

export function getSubscriptionAvatarColor(
  subscription: Pick<Subscription, 'id' | 'name' | 'avatarColor'>,
) {
  if (subscription.avatarColor && /^#[\da-f]{6}$/i.test(subscription.avatarColor)) {
    return subscription.avatarColor;
  }

  const key = subscription.id || subscription.name;
  let hash = 0;
  for (const character of key) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return avatarPalette[hash % avatarPalette.length];
}

export function getEffectiveAmount(subscription: Subscription) {
  return subscription.isShared
    ? subscription.shareAmount
    : subscription.userShareAmount ?? subscription.cost;
}

export function getMonthlyAmount(subscription: Subscription) {
  const amount = getEffectiveAmount(subscription);
  if (amount === null) return null;

  switch (subscription.billingCycle) {
    case 'weekly':
      return (amount * 52) / 12;
    case 'yearly':
      return amount / 12;
    case 'monthly':
      return amount;
  }
}

export function getMonthlyTotals(subscriptions: Subscription[]): MonthlyTotal[] {
  const totals = new Map<string, number>();

  for (const subscription of subscriptions) {
    const monthlyAmount = getMonthlyAmount(subscription);
    if (monthlyAmount === null) continue;
    totals.set(
      subscription.currency,
      (totals.get(subscription.currency) ?? 0) + monthlyAmount,
    );
  }

  return Array.from(totals, ([currency, amount]) => ({ currency, amount })).sort(
    (a, b) => a.currency.localeCompare(b.currency),
  );
}

export function formatMoney(
  amount: number,
  currency: string,
  locale = 'en',
) {
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} ${currency}`;
}

export function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(i18n.t('data.invalidDate', { date: value }));
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function formatPaymentDate(date: Date, locale = 'en') {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(date);
}

export function translateSubscriptionCategory(category: string) {
  const key = category.trim().toLowerCase();
  return i18n.t(`categories.${key}`, { defaultValue: category });
}
