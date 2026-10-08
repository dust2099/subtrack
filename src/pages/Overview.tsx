import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  CreditCard,
  DollarSign,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SubscriptionLogo } from '@/components/design/SubscriptionLogo';
import { SubscriptionMemberAvatars } from '@/components/design/SubscriptionMemberAvatars';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { useSubscriptions } from '@/hooks/use-subscriptions';
import {
  formatMoney,
  formatPaymentDate,
  getEffectiveAmount,
  getMonthlyAmount,
  getMonthlyTotals,
  getSubscriptionAvatarColor,
  translateSubscriptionCategory,
} from '@/data/subscriptions';

function Overview() {
  const { t, i18n } = useTranslation();
  const { user, profile } = useAuth();
  const { subscriptions, loading, error } = useSubscriptions();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const username =
    profile?.display_name ||
    profile?.username ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    t('overview.fallbackName');
  const hour = now.getHours();
  const greeting =
    hour < 12
      ? t('overview.morning')
      : hour < 18
        ? t('overview.afternoon')
        : t('overview.evening');
  const monthlyTotals = getMonthlyTotals(subscriptions);
  const [selectedCurrency, setSelectedCurrency] = useState('');
  const chartCurrency = monthlyTotals.some(
    ({ currency }) => currency === selectedCurrency,
  )
    ? selectedCurrency
    : monthlyTotals[0]?.currency ?? '';
  const chartData = subscriptions
    .filter((subscription) => subscription.currency === chartCurrency)
    .flatMap((subscription) => {
      const monthlyAmount = getMonthlyAmount(subscription);
      return monthlyAmount === null
        ? []
        : [{ name: subscription.name, amount: monthlyAmount }];
    })
    .sort((a, b) => b.amount - a.amount);
  const upcomingPayments = subscriptions
    .filter((subscription) => subscription.nextBillingDate >= today)
    .sort(
      (a, b) =>
        a.nextBillingDate.getTime() - b.nextBillingDate.getTime(),
    );
  const nextPayment = upcomingPayments[0];
  const subscriptionsWithUnknownShare = subscriptions.filter(
    (subscription) => subscription.isShared && subscription.shareAmount === null,
  );
  const nextPaymentAmount = nextPayment
    ? getEffectiveAmount(nextPayment)
    : null;

  const spendingValue: ReactNode =
    monthlyTotals.length === 0 ? (
      '—'
    ) : (
      <span className="flex flex-col gap-0.5">
        {monthlyTotals.map(({ currency, amount }) => (
          <span key={currency} className="text-xl">
            {formatMoney(amount, currency, i18n.language)}
          </span>
        ))}
      </span>
    );

  const stats = [
    {
      title: t('overview.monthlySpending'),
      value: spendingValue,
      description: t('overview.monthlyEquivalent'),
      icon: DollarSign,
    },
    {
      title: t('overview.activeSubscriptions'),
      value: subscriptions.length.toString(),
      description: t('overview.includingShared'),
      icon: CreditCard,
    },
    {
      title: t('overview.nextPayment'),
      value: nextPayment
        ? nextPaymentAmount === null
          ? t('overview.shareUnavailable')
          : formatMoney(nextPaymentAmount, nextPayment.currency, i18n.language)
        : '—',
      description: nextPayment
        ? `${nextPayment.name} · ${formatPaymentDate(nextPayment.nextBillingDate, i18n.language)}`
        : t('overview.noUpcoming'),
      icon: CalendarDays,
    },
  ];

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground" role="status">
        {t('common.loadingSubscriptions')}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive"
        role="alert"
      >
        {error}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-muted-foreground">
            {new Intl.DateTimeFormat(i18n.language, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            }).format(now)}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {t('overview.greeting', { greeting, name: username })}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {t('overview.intro')}
          </p>
        </div>
      </div>

      {subscriptionsWithUnknownShare.length > 0 && (
        <p
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200"
          role="status"
        >
          {t('overview.unknownShare', {
            names: subscriptionsWithUnknownShare.map(({ name }) => name).join(', '),
          })}
        </p>
      )}

      <section
        aria-label={t('overview.summary')}
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        {stats.map(({ title, value, description, icon: Icon }) => (
          <Card key={title}>
            <CardHeader className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {title}
                </CardTitle>
                <div className="mt-3 text-2xl font-semibold tracking-tight">
                  {value}
                </div>
              </div>
              <div className="rounded-lg bg-muted p-2 text-muted-foreground">
                <Icon aria-hidden="true" className="size-4" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{description}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section
        aria-label={t('overview.paymentsAndSpending')}
        className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]"
      >
        <Card>
          <CardHeader className="flex items-start justify-between">
            <div>
              <CardTitle>{t('overview.upcomingPayments')}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('overview.nextCharges')}
              </p>
            </div>
            <ArrowUpRight
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
          </CardHeader>
          <CardContent>
            {upcomingPayments.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                {t('overview.noPayments')}
              </p>
            ) : (
              <ul className="divide-y">
                {upcomingPayments.map((payment) => {
                  const amount = getEffectiveAmount(payment);

                  return (
                    <li
                      key={payment.id}
                      className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <SubscriptionLogo
                        name={payment.name}
                        logoUrl={payment.logoUrl}
                        avatarColor={getSubscriptionAvatarColor(payment)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate font-medium">{payment.name}</p>
                          <SubscriptionMemberAvatars
                            members={payment.memberPreviews}
                            currentUserId={user?.id}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {translateSubscriptionCategory(payment.category)} ·{' '}
                          {formatPaymentDate(payment.nextBillingDate, i18n.language)}
                          {payment.isShared ? ` · ${t('overview.shared')}` : ''}
                        </p>
                      </div>
                      <p className="shrink-0 text-right font-medium">
                        {amount === null
                          ? t('overview.shareUnavailable')
                          : formatMoney(amount, payment.currency, i18n.language)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>{t('overview.monthlyCostChart')}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('overview.monthlyEquivalents')}
              </p>
            </div>
            {monthlyTotals.length > 1 && (
              <label className="grid shrink-0 gap-1 text-xs text-muted-foreground">
                <span>{t('common.currency')}</span>
                <select
                  aria-label={t('common.currency')}
                  className="h-8 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
                  value={chartCurrency}
                  onChange={(event) => setSelectedCurrency(event.target.value)}
                >
                  {monthlyTotals.map(({ currency }) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-center text-sm text-muted-foreground">
                {t('overview.chartNoData')}
              </div>
            ) : (
              <div
                className="w-full"
                style={{ height: Math.max(240, chartData.length * 42) }}
                role="img"
                aria-label={t('overview.chartLabel', { currency: chartCurrency })}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      horizontal={false}
                      stroke="var(--border)"
                      strokeDasharray="3 3"
                    />
                    <XAxis
                      type="number"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      axisLine={false}
                      tickLine={false}
                      width={112}
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                    />
                    <Tooltip
                      formatter={(value) => [
                        formatMoney(Number(value), chartCurrency, i18n.language),
                        t('overview.monthlyCost'),
                      ]}
                      contentStyle={{
                        borderRadius: '0.75rem',
                        border: '1px solid var(--border)',
                        backgroundColor: 'var(--background)',
                        color: 'var(--foreground)',
                      }}
                    />
                    <Bar
                      dataKey="amount"
                      fill="var(--primary)"
                      radius={[0, 6, 6, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

export default Overview;
