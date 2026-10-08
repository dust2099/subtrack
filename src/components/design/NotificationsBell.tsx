import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/design/UserAvatar';
import { formatMoney } from '@/data/subscriptions';
import { useSubscriptions } from '@/hooks/use-subscriptions';
import { supabase } from '@/lib/supabase';

type FriendRequest = {
  request_id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  relationship_state: string;
};

type SubscriptionInvitation = {
  subscription_id: string;
  subscription_name: string;
  share_amount: number | string;
  currency: string;
  owner_username: string;
  owner_display_name: string;
};

type NotificationItem =
  | {
      key: string;
      kind: 'friend';
      id: string;
      title: string;
      detail: string;
      avatar: { name: string; url: string | null };
    }
  | {
      key: string;
      kind: 'subscription';
      id: string;
      title: string;
      detail: string;
    };

function readDismissedKeys(
  storageKey: string,
): { keys: string[]; error: string | null } {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === null) return { keys: [] as string[], error: null };
    const keys: unknown = JSON.parse(stored);
    if (!Array.isArray(keys) || !keys.every((key) => typeof key === 'string')) {
      throw new Error('Invalid notification dismissal data.');
    }
    return {
      keys: keys.filter((key): key is string => typeof key === 'string'),
      error: null,
    };
  } catch (storageError) {
    return {
      keys: [],
      error:
        storageError instanceof Error
          ? storageError.message
          : 'Could not read notification dismissal data.',
    };
  }
}

export function NotificationsBell({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation();
  const { refresh: refreshSubscriptions } = useSubscriptions();
  const [open, setOpen] = useState(false);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [invitations, setInvitations] = useState<SubscriptionInvitation[]>([]);
  const storageKey = `subtrack-dismissed-notifications:${userId}`;
  const [dismissalState, setDismissalState] = useState(() =>
    readDismissedKeys(storageKey),
  );
  const [dismissedKeys, setDismissedKeys] = useState(dismissalState.keys);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    dismissalState.error
      ? t('notifications.dismissError', { message: dismissalState.error })
      : null,
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    try {
      const [friendResult, invitationResult] = await Promise.all([
        supabase.rpc('get_my_friend_connections'),
        supabase.rpc('get_my_subscription_invitations'),
      ]);
      const errorMessages = [
        friendResult.error?.message,
        invitationResult.error?.message,
      ].filter((message): message is string => Boolean(message));
      if (errorMessages.length > 0) {
        setError(
          t('notifications.loadError', {
            message: errorMessages.join(' · '),
          }),
        );
        setLoading(false);
        return;
      }

      setFriendRequests(
        ((friendResult.data ?? []) as FriendRequest[]).filter(
          ({ relationship_state }) => relationship_state === 'incoming',
        ),
      );
      setInvitations((invitationResult.data ?? []) as SubscriptionInvitation[]);
      setError(null);
    } catch (loadError) {
      setError(
        t('notifications.loadError', {
          message:
            loadError instanceof Error
              ? loadError.message
              : t('notifications.loadErrorGeneric'),
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void Promise.resolve().then(loadNotifications);
    const interval = window.setInterval(() => void loadNotifications(), 60_000);
    return () => window.clearInterval(interval);
  }, [loadNotifications]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const notifications = useMemo<NotificationItem[]>(() => [
    ...friendRequests.map((request) => ({
      key: `friend:${request.request_id}`,
      kind: 'friend' as const,
      id: request.request_id,
      title: t('notifications.friendRequest', { name: request.display_name }),
      detail: `@${request.username}`,
      avatar: { name: request.display_name, url: request.avatar_url },
    })),
    ...invitations.map((invitation) => ({
      key: `subscription:${invitation.subscription_id}`,
      kind: 'subscription' as const,
      id: invitation.subscription_id,
      title: t('notifications.subscriptionInvitation', {
        name: invitation.subscription_name,
      }),
      detail: t('notifications.invitedBy', {
        name: invitation.owner_display_name,
        username: invitation.owner_username,
        amount: formatMoney(
          Number(invitation.share_amount),
          invitation.currency,
          i18n.language,
        ),
      }),
    })),
  ], [friendRequests, i18n.language, invitations, t]);

  const visibleNotifications = notifications.filter(
    ({ key }) => !dismissedKeys.includes(key),
  );

  const respond = async (item: NotificationItem, accept: boolean) => {
    setBusyKey(item.key);
    setError(null);
    try {
      const result = item.kind === 'friend'
        ? await supabase.rpc('respond_to_friend_request', {
            p_request_id: item.id,
            p_accept: accept,
          })
        : await supabase.rpc('respond_to_subscription_invitation', {
            p_subscription_id: item.id,
            p_accept: accept,
          });
      if (result.error) {
        setError(t('notifications.actionError', { message: result.error.message }));
        return;
      }
      if (item.kind === 'subscription' && accept) refreshSubscriptions();
      await loadNotifications();
    } catch (actionError) {
      setError(
        t('notifications.actionError', {
          message:
            actionError instanceof Error
              ? actionError.message
              : t('notifications.actionErrorGeneric'),
        }),
      );
    } finally {
      setBusyKey(null);
    }
  };

  const dismissAll = () => {
    const nextKeys = [...new Set([...dismissedKeys, ...visibleNotifications.map(({ key }) => key)])];
    try {
      localStorage.setItem(storageKey, JSON.stringify(nextKeys));
      setDismissedKeys(nextKeys);
      setDismissalState({ keys: nextKeys, error: null });
      setError(null);
    } catch (storageError) {
      setError(
        storageError instanceof Error
          ? t('notifications.dismissError', { message: storageError.message })
          : t('notifications.dismissErrorGeneric'),
      );
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t('notifications.open', { count: visibleNotifications.length })}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          if (!open) void loadNotifications();
        }}
        className="relative"
      >
        <Bell aria-hidden="true" />
        {visibleNotifications.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-destructive text-[0.65rem] font-semibold text-destructive-foreground">
            {visibleNotifications.length > 9 ? '9+' : visibleNotifications.length}
          </span>
        )}
      </Button>

      {open && (
        <section
          role="dialog"
          aria-label={t('notifications.title')}
          className="absolute right-0 top-full z-50 mt-2 max-h-[min(75vh,34rem)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border bg-popover p-3 text-popover-foreground shadow-xl"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-semibold">{t('notifications.title')}</h2>
            {visibleNotifications.length > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={dismissAll}>
                {t('notifications.dismissAll')}
              </Button>
            )}
          </div>
          {error && (
            <p className="mb-3 rounded-lg bg-destructive/10 p-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground" role="status">
              {t('notifications.loading')}
            </p>
          ) : visibleNotifications.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('notifications.empty')}
            </p>
          ) : (
            <ul className="space-y-2">
              {visibleNotifications.map((item) => (
                <li key={item.key} className="rounded-lg border p-3">
                  <div className="flex items-start gap-2">
                    {item.kind === 'friend' && (
                      <UserAvatar
                        name={item.avatar.name}
                        imageUrl={item.avatar.url}
                        className="size-9 shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyKey === item.key}
                      onClick={() => void respond(item, false)}
                    >
                      <X aria-hidden="true" />
                      {t('notifications.deny')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busyKey === item.key}
                      onClick={() => void respond(item, true)}
                    >
                      <Check aria-hidden="true" />
                      {t('notifications.accept')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
