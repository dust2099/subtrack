import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, LoaderCircle, Share2, X } from 'lucide-react';
import type { Subscription } from '@/data/subscriptions';
import { formatMoney, formatPaymentDate } from '@/data/subscriptions';
import { UserAvatar } from '@/components/design/UserAvatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';

type SubscriptionMember = {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  share_amount: number | string;
  status: 'pending' | 'active' | 'declined';
};

type Invitation = {
  subscription_id: string;
  subscription_name: string;
  share_amount: number | string;
  currency: string;
  billing_cycle: string;
  next_billing_date: string;
  owner_username: string;
  owner_display_name: string;
};

export function PendingSubscriptionInvitations({
  refreshSubscriptions,
}: {
  refreshSubscriptions: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadInvitations = useCallback(async () => {
    const { data, error: queryError } = await supabase.rpc(
      'get_my_subscription_invitations',
    );
    if (queryError) {
      setError(t('sharing.invitationLoadError', { message: queryError.message }));
      setLoading(false);
      return;
    }
    setInvitations((data ?? []) as Invitation[]);
    setError(null);
    setLoading(false);
  }, [t]);

  useEffect(() => {
    void Promise.resolve().then(loadInvitations);
  }, [loadInvitations]);

  const respond = async (subscriptionId: string, accept: boolean) => {
    setBusyId(subscriptionId);
    setError(null);
    const { error: responseError } = await supabase.rpc(
      'respond_to_subscription_invitation',
      { p_subscription_id: subscriptionId, p_accept: accept },
    );
    if (responseError) {
      setError(t('sharing.responseError', { message: responseError.message }));
      setBusyId(null);
      return;
    }
    await loadInvitations();
    if (accept) refreshSubscriptions();
    setBusyId(null);
  };

  if (!loading && invitations.length === 0 && !error) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('sharing.invitations')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <p className="text-sm text-muted-foreground" role="status">
            {t('sharing.loadingInvitations')}
          </p>
        ) : (
          invitations.map((invitation) => (
            <div
              key={invitation.subscription_id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div>
                <p className="font-medium">{invitation.subscription_name}</p>
                <p className="text-sm text-muted-foreground">
                  {t('sharing.invitedBy', {
                    name: invitation.owner_display_name,
                    username: invitation.owner_username,
                  })}
                  {' · '}
                  {formatMoney(
                    Number(invitation.share_amount),
                    invitation.currency,
                    i18n.language,
                  )}
                  {' · '}
                  {formatPaymentDate(
                    new Date(`${invitation.next_billing_date}T00:00:00`),
                    i18n.language,
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={busyId === invitation.subscription_id}
                  onClick={() => void respond(invitation.subscription_id, true)}
                >
                  {busyId === invitation.subscription_id ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                  ) : (
                    <Check aria-hidden="true" />
                  )}
                  {t('sharing.accept')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyId === invitation.subscription_id}
                  onClick={() => void respond(invitation.subscription_id, false)}
                >
                  <X aria-hidden="true" />
                  {t('sharing.decline')}
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function SubscriptionSharingPanel({
  subscription,
  userId,
  onClose,
  refreshSubscriptions,
}: {
  subscription: Subscription;
  userId: string;
  onClose: () => void;
  refreshSubscriptions: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [members, setMembers] = useState<SubscriptionMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [shareAmount, setShareAmount] = useState('');
  const [shareAmounts, setShareAmounts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const isOwner = !subscription.isShared;

  const loadMembers = useCallback(async () => {
    const { data, error: queryError } = await supabase.rpc(
      'get_subscription_members',
      { p_subscription_id: subscription.id },
    );
    if (queryError) {
      setError(t('sharing.memberLoadError', { message: queryError.message }));
      setMembersLoading(false);
      return;
    }
    const loadedMembers = (data ?? []) as SubscriptionMember[];
    setMembers(loadedMembers);
    setShareAmounts(
      Object.fromEntries(
        loadedMembers.map((member) => [
          member.user_id,
          String(member.share_amount),
        ]),
      ),
    );
    setError(null);
    setMembersLoading(false);
  }, [subscription.id, t]);

  useEffect(() => {
    if (isOwner) void Promise.resolve().then(loadMembers);
  }, [isOwner, loadMembers]);

  const invite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyId('invite');
    setError(null);
    setSuccess(null);
    const { error: inviteError } = await supabase.rpc(
      'invite_subscription_member',
      {
        p_subscription_id: subscription.id,
        p_username: username.trim(),
        p_share_amount: Number(shareAmount),
      },
    );
    if (inviteError) {
      setError(t('sharing.inviteError', { message: inviteError.message }));
    } else {
      setUsername('');
      setShareAmount('');
      setSuccess(t('sharing.inviteSent'));
      await loadMembers();
    }
    setBusyId(null);
  };

  const updateShare = async (member: SubscriptionMember) => {
    setBusyId(member.user_id);
    setError(null);
    setSuccess(null);
    const { error: updateError } = await supabase.rpc(
      'update_subscription_member_share',
      {
        p_subscription_id: subscription.id,
        p_user_id: member.user_id,
        p_share_amount: Number(shareAmounts[member.user_id]),
      },
    );
    if (updateError) {
      setError(t('sharing.updateError', { message: updateError.message }));
    } else {
      setSuccess(t('sharing.shareUpdated'));
      await loadMembers();
      refreshSubscriptions();
    }
    setBusyId(null);
  };

  const removeMember = async (memberId: string) => {
    const confirmed = window.confirm(
      isOwner
        ? t('sharing.removeMemberConfirm')
        : t('sharing.leaveConfirm', { name: subscription.name }),
    );
    if (!confirmed) return;

    setBusyId(memberId);
    setError(null);
    setSuccess(null);
    const { error: removeError } = await supabase.rpc(
      'remove_subscription_member',
      {
        p_subscription_id: subscription.id,
        p_user_id: memberId,
      },
    );
    if (removeError) {
      setError(t('sharing.removeError', { message: removeError.message }));
    } else {
      setSuccess(
        isOwner ? t('sharing.memberRemoved') : t('sharing.leftSubscription'),
      );
      if (isOwner) await loadMembers();
      refreshSubscriptions();
      if (!isOwner) onClose();
    }
    setBusyId(null);
  };

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>
            {isOwner
              ? t('sharing.manageTitle', { name: subscription.name })
              : t('sharing.sharedTitle', { name: subscription.name })}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {isOwner
              ? t('sharing.ownerDescription', {
                  total: formatMoney(
                    subscription.cost,
                    subscription.currency,
                    i18n.language,
                  ),
                  remainder: formatMoney(
                    subscription.userShareAmount ?? subscription.cost,
                    subscription.currency,
                    i18n.language,
                  ),
                })
              : t('sharing.memberDescription', {
                  amount:
                    subscription.shareAmount === null
                      ? t('overview.shareUnavailable')
                      : formatMoney(
                          subscription.shareAmount,
                          subscription.currency,
                          i18n.language,
                        ),
                })}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t('common.close')}
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400" role="status">
            {success}
          </p>
        )}

        {isOwner ? (
          <>
            <form className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]" onSubmit={(event) => void invite(event)}>
              <div className="grid gap-1">
                <Label htmlFor={`share-username-${subscription.id}`}>
                  {t('sharing.username')}
                </Label>
                <Input
                  id={`share-username-${subscription.id}`}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder={t('sharing.usernamePlaceholder')}
                  autoComplete="off"
                  required
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`share-amount-${subscription.id}`}>
                  {t('sharing.memberShare', { currency: subscription.currency })}
                </Label>
                <Input
                  id={`share-amount-${subscription.id}`}
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={subscription.cost}
                  value={shareAmount}
                  onChange={(event) => setShareAmount(event.target.value)}
                  required
                />
              </div>
              <div className="flex">
                <Button type="submit" disabled={busyId === 'invite'}>
                  {busyId === 'invite' ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                  ) : (
                    <Share2 aria-hidden="true" />
                  )}
                  {t('sharing.sendInvite')}
                </Button>
              </div>
            </form>

            <div>
              <h3 className="mb-2 text-sm font-medium">{t('sharing.members')}</h3>
              {membersLoading ? (
                <p className="text-sm text-muted-foreground" role="status">
                  {t('sharing.loadingMembers')}
                </p>
              ) : members.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('sharing.noMembers')}
                </p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {members.map((member) => (
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
                          @{member.username} · {t(`sharing.status.${member.status}`)}
                        </p>
                      </div>
                      <div className="w-24 shrink-0">
                        <Label className="sr-only" htmlFor={`member-share-${member.user_id}`}>
                          {t('sharing.share')}
                        </Label>
                        <Input
                          id={`member-share-${member.user_id}`}
                          type="number"
                          min="0.01"
                          step="0.01"
                          max={subscription.cost}
                          value={shareAmounts[member.user_id] ?? ''}
                          onChange={(event) =>
                            setShareAmounts((current) => ({
                              ...current,
                              [member.user_id]: event.target.value,
                            }))
                          }
                          aria-label={t('sharing.memberShare', { currency: subscription.currency })}
                        />
                      </div>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t('sharing.saveShare')}
                        disabled={busyId === member.user_id}
                        onClick={() => void updateShare(member)}
                      >
                        <Check aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t('sharing.removeMember')}
                        disabled={busyId === member.user_id}
                        onClick={() => void removeMember(member.user_id)}
                      >
                        {t('sharing.removeMember')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={busyId === userId}
            onClick={() => void removeMember(userId)}
          >
            {t('sharing.leave')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
