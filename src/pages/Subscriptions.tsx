import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, Search, Share2, Trash2, X } from 'lucide-react';
import { SubscriptionLogo } from '@/components/design/SubscriptionLogo';
import { SubscriptionMemberAvatars } from '@/components/design/SubscriptionMemberAvatars';
import { UserAvatar } from '@/components/design/UserAvatar';
import {
  PendingSubscriptionInvitations,
  SubscriptionSharingPanel,
} from '@/components/design/SubscriptionSharing';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { useSubscriptions } from '@/hooks/use-subscriptions';
import { supabase } from '@/lib/supabase';
import type { Subscription } from '@/data/subscriptions';
import {
  formatMoney,
  formatPaymentDate,
  getEffectiveAmount,
  getMonthlyTotals,
  getSubscriptionAvatarColor,
  translateSubscriptionCategory,
} from '@/data/subscriptions';

type CatalogEntry = {
  id: string;
  name: string;
  logo_url: string | null;
  category: string;
  default_price: number | string | null;
  billing_cycle: string | null;
};

type CatalogFormSelection =
  | { kind: 'catalog'; entry: CatalogEntry }
  | { kind: 'custom' };

type SearchableUser = {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

type FriendProfile = SearchableUser & {
  relationship_state: 'friend' | 'incoming' | 'outgoing';
};

type SelectedMember = SearchableUser & {
  shareAmount: string;
};

type EditableSubscriptionMember = SelectedMember & {
  status: 'pending' | 'active';
};

function getLocalDateInputValue(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function getEvenMemberShare(cost: string, memberCount: number) {
  const amount = Number(cost);
  if (!Number.isFinite(amount) || amount <= 0 || memberCount === 0) return '';
  const centsPerMember = Math.floor(Math.round(amount * 100) / (memberCount + 1));
  return (centsPerMember / 100).toFixed(2);
}

function parseOptionalPrice(price: number | string | null) {
  if (price === null) return '';
  const parsed = typeof price === 'number' ? price : Number(price);
  return Number.isFinite(parsed) ? String(parsed) : '';
}

function getMemberAvatarUrl(userId: string, avatarUrl: string | null) {
  return avatarUrl ||
    supabase.storage.from('avatars').getPublicUrl(`${userId}/avatar`).data.publicUrl;
}

function Subscriptions() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const {
    subscriptions,
    loading,
    error,
    refresh,
    setAvatarColor,
  } = useSubscriptions();
  const defaultCategory = t('categories.entertainment');
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogContentElement, setCatalogContentElement] =
    useState<HTMLDivElement | null>(null);
  const editMembersLoadId = useRef(0);
  const [selection, setSelection] = useState<CatalogFormSelection | null>(null);
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState(defaultCategory);
  const [cost, setCost] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [nextBillingDate, setNextBillingDate] = useState(() =>
    getLocalDateInputValue(new Date()),
  );
  const [memberSearch, setMemberSearch] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<SearchableUser[]>([]);
  const [friendList, setFriendList] = useState<SearchableUser[]>([]);
  const [friendListLoading, setFriendListLoading] = useState(false);
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  const [memberSearchError, setMemberSearchError] = useState<string | null>(null);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<SelectedMember[]>([]);
  const [editMembers, setEditMembers] = useState<EditableSubscriptionMember[]>([]);
  const [editMembersLoading, setEditMembersLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingColorId, setSavingColorId] = useState<string | null>(null);
  const [colorError, setColorError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [sharingSubscriptionId, setSharingSubscriptionId] = useState<string | null>(null);
  const monthlyTotals = getMonthlyTotals(subscriptions);
  const sortedSubscriptions = [...subscriptions].sort(
    (a, b) => a.nextBillingDate.getTime() - b.nextBillingDate.getTime(),
  );
  const sharingSubscription = subscriptions.find(
    ({ id }) => id === sharingSubscriptionId,
  );
  const formCategory =
    selection?.kind === 'custom' &&
    (category === 'Entertainment' || category === 'Entretenimiento')
      ? defaultCategory
      : selection?.kind === 'catalog' &&
          category === selection.entry.category
        ? translateSubscriptionCategory(category)
      : category;
  const filteredCatalog = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return catalog.filter(
      ({ name: catalogName, category: catalogCategory }) =>
        !normalizedSearch ||
        catalogName.toLowerCase().includes(normalizedSearch) ||
        catalogCategory.toLowerCase().includes(normalizedSearch),
    );
  }, [catalog, search]);

  useEffect(() => {
    if (!selection || !user) return;

    let active = true;
    const loadFriends = async () => {
      await Promise.resolve();
      if (!active) return;
      setFriendListLoading(true);
      try {
        const { data, error: queryError } = await supabase.rpc(
          'get_my_friend_connections',
        );
        if (!active) return;
        if (queryError) {
          setMemberSearchError(queryError.message);
          return;
        }
        setFriendList(
          ((data ?? []) as FriendProfile[])
            .filter(({ relationship_state }) => relationship_state === 'friend')
            .map(({ user_id, username, display_name, avatar_url }) => ({
              user_id,
              username,
              display_name,
              avatar_url: getMemberAvatarUrl(user_id, avatar_url),
            })),
        );
      } catch (queryError) {
        if (!active) return;
        setMemberSearchError(
          queryError instanceof Error
            ? queryError.message
            : t('subscriptions.memberSearchUnavailable'),
        );
      } finally {
        if (active) setFriendListLoading(false);
      }
    };
    void loadFriends();

    return () => {
      active = false;
    };
  }, [selection, t, user]);

  useEffect(() => {
    const query = memberSearch.trim();
    let active = true;
    const timeout = window.setTimeout(async () => {
      if (query.length < 2) {
        setMemberSearchResults([]);
        setMemberSearchLoading(false);
        setMemberSearchError(null);
        return;
      }

      setMemberSearchLoading(true);
      setMemberSearchError(null);
      try {
        const { data, error: queryError } = await supabase.rpc(
          'search_profiles_for_subscription',
          { p_query: query },
        );
        if (!active) return;

        if (queryError) {
          setMemberSearchError(queryError.message);
          setMemberSearchResults([]);
        } else {
          setMemberSearchResults(
            ((data ?? []) as SearchableUser[]).map((member) => ({
              ...member,
              avatar_url: getMemberAvatarUrl(member.user_id, member.avatar_url),
            })),
          );
        }
      } catch (queryError) {
        if (!active) return;
        setMemberSearchError(
          queryError instanceof Error ? queryError.message : t('subscriptions.memberSearchUnavailable'),
        );
        setMemberSearchResults([]);
      } finally {
        if (active) setMemberSearchLoading(false);
      }
    }, query.length < 2 ? 0 : 250);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [memberSearch, t]);

  const memberOptions = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    const friendById = new Map(friendList.map((friend) => [friend.user_id, friend]));
    const candidates =
      query.length >= 2
        ? memberSearchResults.map((result) => ({
            ...result,
            avatar_url: result.avatar_url ?? friendById.get(result.user_id)?.avatar_url ?? null,
          }))
        : friendList.filter(
            ({ username, display_name }) =>
              !query ||
              username.toLowerCase().includes(query) ||
              display_name.toLowerCase().includes(query),
          );
    const friendIds = new Set(friendList.map(({ user_id }) => user_id));

    return candidates
      .filter(
        ({ user_id }) =>
          !selectedMembers.some((selected) => selected.user_id === user_id),
      )
      .sort(
        (first, second) =>
          Number(friendIds.has(second.user_id)) -
          Number(friendIds.has(first.user_id)),
      );
  }, [friendList, memberSearch, memberSearchResults, selectedMembers]);

  useEffect(() => {
    let active = true;
    const loadCatalog = async () => {
      try {
        const { data, error: queryError } = await supabase
          .from('subscription_catalog')
          .select('id, name, logo_url, category, default_price, billing_cycle')
          .order('name');
        if (!active) return;
        if (queryError) {
          setCatalogError(
            t('subscriptions.catalogError', { message: queryError.message }),
          );
          setCatalogLoading(false);
          return;
        }
        setCatalog((data ?? []) as unknown as CatalogEntry[]);
        setCatalogError(null);
        setCatalogLoading(false);
      } catch (queryError) {
        if (!active) return;
        setCatalogError(
          queryError instanceof Error
            ? t('subscriptions.catalogError', { message: queryError.message })
            : t('subscriptions.catalogLoadError'),
        );
        setCatalogLoading(false);
      }
    };
    void loadCatalog();

    return () => {
      active = false;
    };
  }, [t]);

  const clearForm = useCallback(() => {
    editMembersLoadId.current += 1;
    setEditingSubscription(null);
    setSelection(null);
    setName('');
    setCategory(defaultCategory);
    setCost('');
    setCurrency('EUR');
    setBillingCycle('monthly');
    setNextBillingDate(getLocalDateInputValue(new Date()));
    setMemberSearch('');
    setMemberSearchResults([]);
    setMemberPickerOpen(false);
    setMemberSearchError(null);
    setSelectedMembers([]);
    setEditMembers([]);
    setEditMembersLoading(false);
    setFormError(null);
  }, [defaultCategory]);

  const closeCatalog = useCallback(() => {
    setCatalogOpen(false);
    clearForm();
  }, [clearForm]);

  const selectCatalogEntry = (entry: CatalogEntry) => {
    const nextCost = parseOptionalPrice(entry.default_price);
    setSelection({ kind: 'catalog', entry });
    setName(entry.name);
    setCategory(entry.category);
    setCost(nextCost);
    setSelectedMembers((current) => {
      const shareAmount = getEvenMemberShare(nextCost, current.length);
      return current.map((member) => ({ ...member, shareAmount }));
    });
    setCurrency('EUR');
    setBillingCycle(
      entry.billing_cycle?.toLowerCase() === 'yearly' ||
        entry.billing_cycle?.toLowerCase() === 'weekly'
        ? entry.billing_cycle.toLowerCase()
        : 'monthly',
    );
    setFormError(null);
  };

  const selectCustom = () => {
    setEditingSubscription(null);
    setSelection({ kind: 'custom' });
    setName('');
    setCategory(defaultCategory);
    setCost('');
    setCurrency('EUR');
    setBillingCycle('monthly');
    setFormError(null);
  };

  const startEditing = async (subscription: Subscription) => {
    const loadId = editMembersLoadId.current + 1;
    editMembersLoadId.current = loadId;
    const catalogEntry = catalog.find(({ id }) => id === subscription.catalogId);
    setEditingSubscription(subscription);
    setSelection(catalogEntry ? { kind: 'catalog', entry: catalogEntry } : { kind: 'custom' });
    setName(subscription.name);
    setCategory(subscription.category);
    setCost(String(subscription.cost));
    setCurrency(subscription.currency);
    setBillingCycle(subscription.billingCycle);
    setNextBillingDate(getLocalDateInputValue(subscription.nextBillingDate));
    setMemberSearch('');
    setMemberSearchResults([]);
    setMemberPickerOpen(false);
    setMemberSearchError(null);
    setSelectedMembers([]);
    setEditMembers([]);
    setEditMembersLoading(true);
    setFormError(null);
    setCatalogOpen(true);

    try {
      const { data, error: membersError } = await supabase.rpc(
        'get_subscription_members',
        { p_subscription_id: subscription.id },
      );
      if (loadId !== editMembersLoadId.current) return;
      if (membersError) {
        setFormError(t('subscriptions.memberLoadError', { message: membersError.message }));
        return;
      }

      const members = (data ?? []) as Array<{
        user_id: string;
        username: string;
        display_name: string;
        avatar_url: string | null;
        share_amount: number | string;
        status: string;
      }>;
      setEditMembers(
        members
          .filter(
            (member): member is typeof member & { status: 'pending' | 'active' } =>
              member.status === 'pending' || member.status === 'active',
          )
          .map((member) => ({
            user_id: member.user_id,
            username: member.username,
            display_name: member.display_name,
            avatar_url: member.avatar_url,
            shareAmount: String(member.share_amount),
            status: member.status,
          })),
      );
    } catch (membersError) {
      if (loadId !== editMembersLoadId.current) return;
      setFormError(
        membersError instanceof Error
          ? t('subscriptions.memberLoadError', { message: membersError.message })
          : t('subscriptions.memberLoadErrorGeneric'),
      );
    } finally {
      if (loadId === editMembersLoadId.current) setEditMembersLoading(false);
    }
  };

  useEffect(() => {
    if (!catalogOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCatalog();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [catalogOpen, closeCatalog]);

  const handleAdd = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) {
      setFormError(t('subscriptions.notSignedIn'));
      return;
    }
    if (!selection) {
      setFormError(t('subscriptions.chooseEntry'));
      return;
    }

    const amount = Number(cost);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError(t('subscriptions.invalidPrice'));
      return;
    }
    if (!/^[A-Z]{3}$/.test(currency.trim().toUpperCase())) {
      setFormError(t('subscriptions.invalidCurrency'));
      return;
    }
    const memberShareCents = (editingSubscription ? editMembers : selectedMembers).map(
      ({ shareAmount }) => Math.round(Number(shareAmount) * 100),
    );
    if (memberShareCents.some((share) => !Number.isFinite(share) || share <= 0)) {
      setFormError(t('subscriptions.invalidMemberShare'));
      return;
    }
    if (
      memberShareCents.reduce((total, share) => total + share, 0) >
      Math.round(amount * 100)
    ) {
      setFormError(t('subscriptions.memberSharesExceedCost'));
      return;
    }

    setSaving(true);
    setFormError(null);
    if (editingSubscription) {
      try {
        const { error: updateError } = await supabase.rpc(
          'update_subscription_with_member_shares',
          {
            p_subscription_id: editingSubscription.id,
            p_name: name.trim(),
            p_cost: amount,
            p_currency: currency.trim().toUpperCase(),
            p_billing_cycle: billingCycle,
            p_next_billing_date: nextBillingDate,
            p_category: formCategory.trim(),
            p_member_ids: editMembers.map(({ user_id }) => user_id),
            p_member_shares: editMembers.map(({ shareAmount }) => Number(shareAmount)),
          },
        );
        if (updateError) {
          setFormError(t('subscriptions.editError', { message: updateError.message }));
          setSaving(false);
          return;
        }
      } catch (updateError) {
        setFormError(
          updateError instanceof Error
            ? t('subscriptions.editError', { message: updateError.message })
            : t('subscriptions.editErrorGeneric'),
        );
        setSaving(false);
        return;
      }

      clearForm();
      setSaving(false);
      setCatalogOpen(false);
      refresh();
      return;
    }

    try {
      const { data: insertedSubscription, error: insertError } = await supabase
        .from('user_subscriptions')
        .insert({
          owner_id: user.id,
          catalog_id: selection.kind === 'catalog' ? selection.entry.id : null,
          name: name.trim(),
          cost: amount,
          currency: currency.trim().toUpperCase(),
          billing_cycle: billingCycle,
          next_billing_date: nextBillingDate,
          category: formCategory.trim(),
          is_shared: false,
        })
        .select('id')
        .single();

      if (insertError) {
        setFormError(
          t('subscriptions.addError', { message: insertError.message }),
        );
        setSaving(false);
        return;
      }

      for (const member of selectedMembers) {
        let inviteErrorMessage: string | null = null;
        try {
          const { error: inviteError } = await supabase.rpc(
            'invite_subscription_member',
            {
              p_subscription_id: insertedSubscription.id,
              p_username: member.username,
              p_share_amount: Number(member.shareAmount),
            },
          );
          inviteErrorMessage = inviteError?.message ?? null;
        } catch (inviteError) {
          inviteErrorMessage =
            inviteError instanceof Error
              ? inviteError.message
              : t('subscriptions.addErrorGeneric');
        }

        if (inviteErrorMessage) {
          let cleanupErrorMessage: string | null = null;
          try {
            const { data: removedSubscription, error: cleanupError } = await supabase
              .from('user_subscriptions')
              .delete()
              .eq('id', insertedSubscription.id)
              .select('id')
              .maybeSingle();
            cleanupErrorMessage =
              cleanupError?.message ??
              (removedSubscription ? null : t('subscriptions.cleanupDidNotRemove'));
          } catch (cleanupError) {
            cleanupErrorMessage =
              cleanupError instanceof Error
                ? cleanupError.message
                : t('subscriptions.addErrorGeneric');
          }

          setFormError(
            cleanupErrorMessage
              ? t('subscriptions.inviteCleanupError', {
                  name: member.display_name,
                  message: inviteErrorMessage,
                  cleanup: cleanupErrorMessage,
                })
              : t('subscriptions.inviteDuringCreateError', {
                  name: member.display_name,
                  message: inviteErrorMessage,
                }),
          );
          if (cleanupErrorMessage) refresh();
          setSaving(false);
          return;
        }
      }
    } catch (insertError) {
      setFormError(
        insertError instanceof Error
          ? t('subscriptions.addError', { message: insertError.message })
          : t('subscriptions.addErrorGeneric'),
      );
      setSaving(false);
      return;
    }

    clearForm();
    setSaving(false);
    setCatalogOpen(false);
    refresh();
  };

  const handleColorChange = async (
    subscriptionId: string,
    color: string,
  ) => {
    setSavingColorId(subscriptionId);
    setColorError(null);
    try {
      await setAvatarColor(subscriptionId, color);
    } catch (error) {
      setColorError(
        error instanceof Error
          ? error.message
          : t('subscriptions.colorError'),
      );
    } finally {
      setSavingColorId(null);
    }
  };

  const handleRemove = async (
    subscriptionId: string,
    subscriptionName: string,
  ) => {
    if (
      !window.confirm(
        t('subscriptions.removeConfirm', { name: subscriptionName }),
      )
    ) {
      return;
    }

    setDeletingId(subscriptionId);
    setDeleteError(null);
    try {
      const { data, error: deleteSubscriptionError } = await supabase
        .from('user_subscriptions')
        .delete()
        .eq('id', subscriptionId)
        .select('id')
        .maybeSingle();

      if (deleteSubscriptionError) {
        throw new Error(deleteSubscriptionError.message);
      }
      if (!data) {
        throw new Error(
          t('subscriptions.cannotRemove'),
        );
      }
      refresh();
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? t('subscriptions.removeError', { message: error.message })
          : t('subscriptions.removeErrorGeneric'),
      );
    } finally {
      setDeletingId(null);
    }
  };

  if (loading || catalogLoading) {
    return (
      <div
        className="flex flex-1 items-center justify-center text-sm text-muted-foreground"
        role="status"
      >
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {t('subscriptions.tagline')}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {t('subscriptions.title')}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {t('subscriptions.intro')}
          </p>
        </div>
        <Button type="button" onClick={() => setCatalogOpen(true)}>
          <Plus aria-hidden="true" />
          {t('subscriptions.addSubscription')}
        </Button>
      </div>

      {user && <PendingSubscriptionInvitations refreshSubscriptions={refresh} />}

      {catalogError && (
        <p
          className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          {catalogError}
        </p>
      )}

      {colorError && (
        <p
          className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          {colorError}
        </p>
      )}

      {deleteError && (
        <p
          className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          {deleteError}
        </p>
      )}

      {selection && catalogOpen && catalogContentElement && createPortal((
        <div>
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleAdd}>
              <div className="grid gap-2">
                <Label htmlFor="subscription-name">{t('subscriptions.name')}</Label>
                <Input
                  id="subscription-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={100}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="subscription-category">{t('subscriptions.category')}</Label>
                <Input
                  id="subscription-category"
                  value={formCategory}
                  onChange={(event) => setCategory(event.target.value)}
                  required
                  maxLength={60}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="subscription-cost">{t('subscriptions.price')}</Label>
                <Input
                  id="subscription-cost"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={cost}
                  onChange={(event) => {
                    const nextCost = event.target.value;
                    setCost(nextCost);
                    setSelectedMembers((current) => {
                      const share = getEvenMemberShare(nextCost, current.length);
                      return current.map((member) => ({ ...member, shareAmount: share }));
                    });
                  }}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="subscription-currency">{t('common.currency')}</Label>
                <Input
                  id="subscription-currency"
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                  required
                  maxLength={3}
                  minLength={3}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="subscription-cycle">{t('subscriptions.billingCycle')}</Label>
                <select
                  id="subscription-cycle"
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  value={billingCycle}
                  onChange={(event) => setBillingCycle(event.target.value)}
                >
                  <option value="monthly">{t('common.monthly')}</option>
                  <option value="yearly">{t('common.yearly')}</option>
                  <option value="weekly">{t('common.weekly')}</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="subscription-next-date">{t('subscriptions.nextPaymentDate')}</Label>
                <Input
                  id="subscription-next-date"
                  type="date"
                  value={nextBillingDate}
                  onChange={(event) => setNextBillingDate(event.target.value)}
                  required
                />
              </div>
              {user && !editingSubscription && (
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="subscription-member-search">
                    {t('subscriptions.membersToInvite')}
                  </Label>
                  <div className="relative">
                    <Search
                      aria-hidden="true"
                      className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id="subscription-member-search"
                      className="pl-9"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={memberPickerOpen}
                      aria-controls="subscription-member-results"
                      placeholder={t('subscriptions.memberSearchPlaceholder')}
                      value={memberSearch}
                      autoComplete="off"
                      onFocus={() => setMemberPickerOpen(true)}
                      onBlur={(event) => {
                        if (
                          !(event.relatedTarget instanceof Node) ||
                          !event.currentTarget.parentElement?.contains(event.relatedTarget)
                        ) {
                          setMemberPickerOpen(false);
                        }
                      }}
                      onChange={(event) => {
                        const query = event.target.value;
                        setMemberSearch(query);
                        setMemberPickerOpen(true);
                        setMemberSearchResults([]);
                        setMemberSearchLoading(query.trim().length >= 2);
                        setMemberSearchError(null);
                      }}
                    />
                    {memberPickerOpen && (
                      <div
                        id="subscription-member-results"
                        className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
                        role="listbox"
                        aria-label={t('subscriptions.membersToInvite')}
                      >
                        {memberSearch.trim().length < 2 && friendListLoading ? (
                          <p className="p-3 text-sm text-muted-foreground" role="status">
                            {t('subscriptions.loadingFriends')}
                          </p>
                        ) : memberSearchLoading ? (
                          <p className="p-3 text-sm text-muted-foreground" role="status">
                            {t('subscriptions.searchingMembers')}
                          </p>
                        ) : memberSearchError ? (
                          <p className="p-3 text-sm text-destructive" role="alert">
                            {t('subscriptions.memberSearchError', { message: memberSearchError })}
                          </p>
                        ) : memberOptions.length === 0 ? (
                          <p className="p-3 text-sm text-muted-foreground">
                            {memberSearch.trim().length < 2 && friendList.length === 0
                              ? t('subscriptions.noFriendsToInvite')
                              : t('subscriptions.noMemberMatches')}
                          </p>
                        ) : (
                          memberOptions.map((member) => (
                              <button
                                key={member.user_id}
                                type="button"
                                role="option"
                                aria-selected={false}
                                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                  setSelectedMembers((current) => {
                                    const next = [
                                      ...current,
                                      { ...member, shareAmount: '' },
                                    ];
                                    const shareAmount = getEvenMemberShare(cost, next.length);
                                    return next.map((selected) => ({
                                      ...selected,
                                      shareAmount,
                                    }));
                                  });
                                  setMemberSearch('');
                                  setMemberPickerOpen(false);
                                }}
                              >
                                <UserAvatar
                                  name={member.display_name}
                                  imageUrl={member.avatar_url}
                                  className="size-7 text-[0.65rem]"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-medium">{member.display_name}</span>
                                  <span className="block truncate text-xs text-muted-foreground">
                                    @{member.username}
                                  </span>
                                </span>
                              </button>
                            ))
                        )}
                      </div>
                    )}
                  </div>
                  {selectedMembers.length > 0 && (
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {selectedMembers.map((member) => (
                        <li
                          key={member.user_id}
                          className="flex min-w-0 items-center gap-2 rounded-lg border p-2"
                        >
                          <UserAvatar
                            name={member.display_name}
                            imageUrl={member.avatar_url}
                            className="size-8 text-xs"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{member.display_name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              @{member.username}
                            </p>
                          </div>
                          <div className="w-24 shrink-0">
                            <Label className="sr-only" htmlFor={`create-member-share-${member.user_id}`}>
                              {t('sharing.memberShare', { currency: currency.toUpperCase() })}
                            </Label>
                            <Input
                              id={`create-member-share-${member.user_id}`}
                              type="number"
                              min="0.01"
                              step="0.01"
                              max={cost}
                              value={member.shareAmount}
                              onChange={(event) =>
                                setSelectedMembers((current) =>
                                  current.map((selected) =>
                                    selected.user_id === member.user_id
                                      ? { ...selected, shareAmount: event.target.value }
                                      : selected,
                                  ),
                                )
                              }
                              required
                              aria-label={t('sharing.memberShare', { currency: currency.toUpperCase() })}
                            />
                          </div>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t('subscriptions.removeMember', { name: member.display_name })}
                            onClick={() =>
                              setSelectedMembers((current) => {
                                const next = current.filter(
                                  (selected) => selected.user_id !== member.user_id,
                                );
                                const shareAmount = getEvenMemberShare(cost, next.length);
                                return next.map((selected) => ({
                                  ...selected,
                                  shareAmount,
                                }));
                              })
                            }
                          >
                            <X aria-hidden="true" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {editingSubscription && (
                <div className="grid gap-2 sm:col-span-2">
                  <Label>{t('subscriptions.memberContributions')}</Label>
                  {editMembersLoading ? (
                    <p className="text-sm text-muted-foreground" role="status">
                      {t('subscriptions.loadingMemberContributions')}
                    </p>
                  ) : editMembers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t('subscriptions.noMemberContributions')}
                    </p>
                  ) : (
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {editMembers.map((member) => (
                        <li
                          key={member.user_id}
                          className="flex min-w-0 items-center gap-2 rounded-lg border p-2"
                        >
                          <UserAvatar
                            name={member.display_name}
                            imageUrl={member.avatar_url}
                            className="size-8 text-xs"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{member.display_name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              @{member.username}
                            </p>
                          </div>
                          <div className="w-24 shrink-0">
                            <Label
                              className="sr-only"
                              htmlFor={`edit-member-share-${member.user_id}`}
                            >
                              {t('sharing.memberShare', { currency: currency.toUpperCase() })}
                            </Label>
                            <Input
                              id={`edit-member-share-${member.user_id}`}
                              type="number"
                              min="0.01"
                              step="0.01"
                              max={cost}
                              value={member.shareAmount}
                              onChange={(event) =>
                                setEditMembers((current) =>
                                  current.map((selected) =>
                                    selected.user_id === member.user_id
                                      ? { ...selected, shareAmount: event.target.value }
                                      : selected,
                                  ),
                                )
                              }
                              required
                              aria-label={t('sharing.memberShare', { currency: currency.toUpperCase() })}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {formError && (
                <p
                  className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive sm:col-span-2"
                  role="alert"
                >
                  {formError}
                </p>
              )}
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={saving || editMembersLoading}>
                  {saving
                    ? editingSubscription
                      ? t('subscriptions.savingChanges')
                      : t('subscriptions.adding')
                    : editingSubscription
                      ? t('subscriptions.saveChanges')
                      : t('subscriptions.addSubscription')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={clearForm}
                  disabled={saving}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </form>
        </div>
      ), catalogContentElement)}

      <Card>
        <CardHeader className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <CardTitle>{t('subscriptions.yourSubscriptions')}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('subscriptions.activeCount', { count: subscriptions.length })}
              {subscriptions.some(({ isShared }) => isShared)
                ? ` · ${t('subscriptions.includesShared')}`
                : ''}
            </p>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            {monthlyTotals.length === 0 ? (
              <span className="text-sm text-muted-foreground">
                {t('subscriptions.noMonthlySpend')}
              </span>
            ) : (
              monthlyTotals.map(({ currency: totalCurrency, amount }) => (
                <span key={totalCurrency} className="text-sm font-medium">
                  {formatMoney(amount, totalCurrency, i18n.language)}
                  <span className="font-normal text-muted-foreground">
                    {' '}{t('subscriptions.perMonth')}
                  </span>
                </span>
              ))
            )}
          </div>
        </CardHeader>
        <CardContent>
          {subscriptions.length === 0 ? (
            <div className="py-10 text-center">
              <p className="font-medium">{t('subscriptions.noSubscriptions')}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('subscriptions.noSubscriptionsDescription')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="pb-3 font-medium">{t('subscriptions.subscription')}</th>
                    <th className="pb-3 font-medium">{t('subscriptions.category')}</th>
                    <th className="pb-3 font-medium">{t('subscriptions.nextPayment')}</th>
                    <th className="pb-3 text-right font-medium">{t('subscriptions.price')}</th>
                    <th className="pb-3 text-right font-medium">{t('subscriptions.type')}</th>
                    <th className="pb-3 text-right font-medium">{t('subscriptions.avatarColor')}</th>
                    <th className="pb-3 text-right font-medium">{t('subscriptions.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sortedSubscriptions.map((subscription) => {
                    const amount = getEffectiveAmount(subscription);

                    return (
                      <tr key={subscription.id}>
                        <td className="py-4">
                          <div className="flex items-center gap-3">
                            <SubscriptionLogo
                              name={subscription.name}
                              logoUrl={subscription.logoUrl}
                              avatarColor={getSubscriptionAvatarColor(subscription)}
                              className="size-9"
                            />
                            <span className="font-medium">
                              {subscription.name}
                            </span>
                            <SubscriptionMemberAvatars
                              members={subscription.memberPreviews}
                              currentUserId={user?.id}
                              className="ml-1"
                            />
                          </div>
                        </td>
                        <td className="py-4 text-muted-foreground">
                          {translateSubscriptionCategory(subscription.category)}
                        </td>
                        <td className="py-4 text-muted-foreground">
                          {formatPaymentDate(subscription.nextBillingDate, i18n.language)}
                        </td>
                        <td className="py-4 text-right font-medium">
                          {amount === null
                            ? t('overview.shareUnavailable')
                            : formatMoney(amount, subscription.currency, i18n.language)}
                          {amount !== null && (
                            <span className="font-normal text-muted-foreground">
                              {' / '}
                              {subscription.billingCycle === 'yearly'
                                ? t('common.year')
                                : subscription.billingCycle === 'weekly'
                                  ? t('common.week')
                                  : t('common.month')}
                            </span>
                          )}
                        </td>
                        <td className="py-4 text-right">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                            {subscription.isShared
                              ? t('common.sharedWithYou')
                              : t('common.owned')}
                          </span>
                        </td>
                        <td className="py-4 text-right">
                          <label className="inline-flex items-center justify-end gap-2">
                            <span className="sr-only">
                              {t('subscriptions.avatarColorFor', { name: subscription.name })}
                            </span>
                            <input
                              type="color"
                              aria-label={t('subscriptions.avatarColorFor', { name: subscription.name })}
                              value={getSubscriptionAvatarColor(subscription)}
                              disabled={savingColorId === subscription.id}
                              onChange={(event) =>
                                void handleColorChange(
                                  subscription.id,
                                  event.target.value,
                                )
                              }
                              className="size-8 cursor-pointer rounded-md border border-input bg-transparent p-0.5 disabled:cursor-wait disabled:opacity-50"
                            />
                          </label>
                        </td>
                        <td className="py-4 text-right">
                          <div className="flex justify-end gap-1">
                            {user && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label={t(
                                  subscription.isShared
                                    ? 'sharing.openShared'
                                    : 'sharing.manage',
                                  { name: subscription.name },
                                )}
                                title={t(
                                  subscription.isShared
                                    ? 'sharing.openShared'
                                    : 'sharing.manage',
                                  { name: subscription.name },
                                )}
                                onClick={() =>
                                  setSharingSubscriptionId((current) =>
                                    current === subscription.id
                                      ? null
                                      : subscription.id,
                                  )
                                }
                              >
                                <Share2 aria-hidden="true" />
                              </Button>
                            )}
                            {!subscription.isShared && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t('subscriptions.edit', { name: subscription.name })}
                                title={t('subscriptions.edit', { name: subscription.name })}
                                onClick={() => startEditing(subscription)}
                              >
                                <Pencil aria-hidden="true" />
                              </Button>
                            )}
                            {!subscription.isShared && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t('subscriptions.remove', { name: subscription.name })}
                              title={t('subscriptions.remove', { name: subscription.name })}
                              disabled={deletingId === subscription.id}
                              onClick={() =>
                                void handleRemove(
                                  subscription.id,
                                  subscription.name,
                                )
                              }
                            >
                              <Trash2 aria-hidden="true" />
                            </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {catalogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCatalog();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="subscription-catalog-title"
            className="flex max-h-[min(90vh,52rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl"
          >
            <header className="flex flex-wrap items-start justify-between gap-4 border-b p-5 sm:p-6">
              <div>
                <h2
                  id="subscription-catalog-title"
                  className="text-xl font-semibold tracking-tight"
                >
                  {editingSubscription
                    ? t('subscriptions.editTitle', { name: editingSubscription.name })
                    : selection
                      ? selection.kind === 'custom'
                        ? t('subscriptions.customTitle')
                        : t('subscriptions.addNamedTitle', { name: selection.entry.name })
                      : t('subscriptions.popular')}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selection
                    ? t('subscriptions.formDescription')
                    : t('subscriptions.catalogDescription')}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('common.close')}
                onClick={closeCatalog}
              >
                <X aria-hidden="true" />
              </Button>
            </header>
            {!selection && (
              <div className="relative border-b p-4 sm:px-6">
                <Search
                  aria-hidden="true"
                  className="absolute left-6 top-1/2 size-4 -translate-y-1/2 text-muted-foreground sm:left-8"
                />
                <Input
                  aria-label={t('subscriptions.searchLabel')}
                  className="pl-9"
                  placeholder={t('subscriptions.search')}
                  value={search}
                  autoFocus
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            )}
            <div
              ref={setCatalogContentElement}
              className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"
            >
              {!selection && (catalog.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <p className="font-medium">{t('subscriptions.emptyCatalog')}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('subscriptions.seedHint')}
                  </p>
                </div>
              ) : filteredCatalog.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t('subscriptions.noMatch', { search })}
                </p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {filteredCatalog.map((entry) => {
                    const alreadyAdded = subscriptions.some(
                      ({ catalogId }) => catalogId === entry.id,
                    );
                    const defaultPrice = parseOptionalPrice(entry.default_price);

                    return (
                      <li
                        key={entry.id}
                        className="flex min-w-0 items-center gap-3 rounded-xl border p-3"
                      >
                        <SubscriptionLogo
                          name={entry.name}
                          logoUrl={entry.logo_url}
                          className="size-10"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{entry.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {translateSubscriptionCategory(entry.category)}
                            {defaultPrice
                              ? ` · ${formatMoney(Number(defaultPrice), 'EUR', i18n.language)}`
                              : ''}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={alreadyAdded}
                          onClick={() => selectCatalogEntry(entry)}
                        >
                          {alreadyAdded ? t('common.added') : t('common.add')}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              ))}
            </div>
            {!selection && <footer className="border-t bg-muted/40 p-4 sm:p-5">
              <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center">
                <div>
                  <p className="font-semibold">{t('subscriptions.customPrompt')}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {t('subscriptions.customDescription')}
                  </p>
                </div>
                <Button type="button" onClick={selectCustom}>
                  <Plus aria-hidden="true" />
                  {t('subscriptions.addCustom')}
                </Button>
              </div>
            </footer>}
          </section>
        </div>
      )}

      {sharingSubscription && user && (
        <SubscriptionSharingPanel
          subscription={sharingSubscription}
          userId={user.id}
          onClose={() => setSharingSubscriptionId(null)}
          refreshSubscriptions={refresh}
        />
      )}
    </div>
  );
}

export default Subscriptions;
