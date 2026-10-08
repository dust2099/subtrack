import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, LoaderCircle, Search, UserPlus, UserRoundMinus, UsersRound, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserAvatar } from '@/components/design/UserAvatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';

type FriendConnection = {
  request_id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  relationship_state: 'friend' | 'incoming' | 'outgoing';
};

type SearchResult = {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

function getAvatarUrl(userId: string, avatarUrl: string | null) {
  return avatarUrl ||
    supabase.storage.from('avatars').getPublicUrl(`${userId}/avatar`).data.publicUrl;
}

function Friends() {
  const { t } = useTranslation();
  const [connections, setConnections] = useState<FriendConnection[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    try {
      const { data, error: queryError } = await supabase.rpc(
        'get_my_friend_connections',
      );
      if (queryError) throw new Error(queryError.message);
      setConnections((data ?? []) as FriendConnection[]);
      setError(null);
    } catch (loadError) {
      setError(
        t('friends.loadError', {
          message:
            loadError instanceof Error
              ? loadError.message
              : t('friends.loadErrorGeneric'),
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void Promise.resolve().then(loadConnections);
  }, [loadConnections]);

  useEffect(() => {
    const query = search.trim();
    let active = true;
    const timeout = window.setTimeout(async () => {
      if (query.length < 2) {
        setSearchResults([]);
        setSearching(false);
        return;
      }

      setSearching(true);
      try {
        const { data, error: queryError } = await supabase.rpc(
          'search_profiles_for_subscription',
          { p_query: query },
        );
        if (!active) return;
        if (queryError) throw new Error(queryError.message);
        setSearchResults((data ?? []) as SearchResult[]);
        setError(null);
      } catch (searchError) {
        if (!active) return;
        setError(
          t('friends.searchError', {
            message:
              searchError instanceof Error
                ? searchError.message
                : t('friends.searchErrorGeneric'),
          }),
        );
        setSearchResults([]);
      } finally {
        if (active) setSearching(false);
      }
    }, query.length < 2 ? 0 : 250);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [search, t]);

  const connectedUserIds = useMemo(
    () => new Set(connections.map(({ user_id }) => user_id)),
    [connections],
  );
  const availableResults = searchResults.filter(
    ({ user_id }) => !connectedUserIds.has(user_id),
  );
  const friends = connections.filter(
    ({ relationship_state }) => relationship_state === 'friend',
  );
  const incomingRequests = connections.filter(
    ({ relationship_state }) => relationship_state === 'incoming',
  );
  const outgoingRequests = connections.filter(
    ({ relationship_state }) => relationship_state === 'outgoing',
  );

  const sendRequest = async (username: string, userId: string) => {
    setBusyId(userId);
    setError(null);
    setSuccess(null);
    try {
      const { error: requestError } = await supabase.rpc(
        'send_friend_request',
        { p_username: username },
      );
      if (requestError) throw new Error(requestError.message);
      setSuccess(t('friends.requestSent'));
      setSearch('');
      setSearchResults([]);
      await loadConnections();
    } catch (requestError) {
      setError(
        t('friends.requestError', {
          message:
            requestError instanceof Error
              ? requestError.message
              : t('friends.requestErrorGeneric'),
        }),
      );
    } finally {
      setBusyId(null);
    }
  };

  const respondToRequest = async (
    connection: FriendConnection,
    accept: boolean,
  ) => {
    setBusyId(connection.request_id);
    setError(null);
    setSuccess(null);
    try {
      const { error: responseError } = await supabase.rpc(
        'respond_to_friend_request',
        {
          p_request_id: connection.request_id,
          p_accept: accept,
        },
      );
      if (responseError) throw new Error(responseError.message);
      setSuccess(
        accept
          ? t('friends.requestAccepted', { name: connection.display_name })
          : t('friends.requestDeclined', { name: connection.display_name }),
      );
      await loadConnections();
    } catch (responseError) {
      setError(
        t('friends.responseError', {
          message:
            responseError instanceof Error
              ? responseError.message
              : t('friends.responseErrorGeneric'),
        }),
      );
    } finally {
      setBusyId(null);
    }
  };

  const cancelRequest = async (connection: FriendConnection) => {
    setBusyId(connection.request_id);
    setError(null);
    setSuccess(null);
    try {
      const { error: cancelError } = await supabase.rpc(
        'cancel_friend_request',
        { p_request_id: connection.request_id },
      );
      if (cancelError) throw new Error(cancelError.message);
      setSuccess(t('friends.requestCancelled'));
      await loadConnections();
    } catch (cancelError) {
      setError(
        t('friends.cancelError', {
          message:
            cancelError instanceof Error
              ? cancelError.message
              : t('friends.cancelErrorGeneric'),
        }),
      );
    } finally {
      setBusyId(null);
    }
  };

  const removeFriend = async (connection: FriendConnection) => {
    setBusyId(connection.user_id);
    setError(null);
    setSuccess(null);
    try {
      const { error: removeError } = await supabase.rpc('remove_friend', {
        p_user_id: connection.user_id,
      });
      if (removeError) throw new Error(removeError.message);
      setSuccess(t('friends.friendRemoved', { name: connection.display_name }));
      await loadConnections();
    } catch (removeError) {
      setError(
        t('friends.removeError', {
          message:
            removeError instanceof Error
              ? removeError.message
              : t('friends.removeErrorGeneric'),
        }),
      );
    } finally {
      setBusyId(null);
    }
  };

  const renderPerson = (connection: FriendConnection) => (
    <li
      key={connection.request_id}
      className="flex flex-wrap items-center justify-between gap-3 py-3"
    >
      <div className="flex min-w-0 items-center gap-3">
        <UserAvatar
          name={connection.display_name}
          imageUrl={getAvatarUrl(connection.user_id, connection.avatar_url)}
          className="size-10"
        />
        <div className="min-w-0">
          <p className="truncate font-medium">{connection.display_name}</p>
          <p className="text-sm text-muted-foreground">@{connection.username}</p>
        </div>
      </div>
      {connection.relationship_state === 'incoming' ? (
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busyId === connection.request_id}
            onClick={() => void respondToRequest(connection, true)}
          >
            {busyId === connection.request_id ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <Check aria-hidden="true" />
            )}
            {t('friends.accept')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busyId === connection.request_id}
            onClick={() => void respondToRequest(connection, false)}
          >
            <X aria-hidden="true" />
            {t('friends.decline')}
          </Button>
        </div>
      ) : connection.relationship_state === 'outgoing' ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busyId === connection.request_id}
          onClick={() => void cancelRequest(connection)}
        >
          {t('friends.cancelRequest')}
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busyId === connection.user_id}
          onClick={() => void removeFriend(connection)}
        >
          <UserRoundMinus aria-hidden="true" />
          {t('friends.remove')}
        </Button>
      )}
    </li>
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-7">
      <div>
        <p className="text-sm text-muted-foreground">{t('friends.tagline')}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {t('friends.title')}
        </h1>
        <p className="mt-2 text-muted-foreground">{t('friends.intro')}</p>
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle>{t('friends.findPeople')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="friend-search">{t('friends.searchLabel')}</Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="friend-search"
              className="pl-9"
              placeholder={t('friends.searchPlaceholder')}
              value={search}
              autoComplete="off"
              onChange={(event) => {
                setSearch(event.target.value);
                setSearchResults([]);
                setError(null);
              }}
            />
          </div>
          {search.trim().length < 2 ? (
            <p className="text-sm text-muted-foreground">
              {t('friends.searchHint')}
            </p>
          ) : searching ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              {t('friends.searching')}
            </p>
          ) : availableResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('friends.noSearchResults')}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {availableResults.map((person) => (
                <li
                  key={person.user_id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar
                      name={person.display_name}
                      imageUrl={getAvatarUrl(person.user_id, person.avatar_url)}
                      className="size-10"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{person.display_name}</p>
                      <p className="text-sm text-muted-foreground">@{person.username}</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyId === person.user_id}
                    onClick={() => void sendRequest(person.username, person.user_id)}
                  >
                    {busyId === person.user_id ? (
                      <LoaderCircle aria-hidden="true" className="animate-spin" />
                    ) : (
                      <UserPlus aria-hidden="true" />
                    )}
                    {t('friends.sendRequest')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t('friends.loading')}
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <CardTitle>{t('friends.incomingRequests')}</CardTitle>
              {incomingRequests.length > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {incomingRequests.length}
                </span>
              )}
            </CardHeader>
            <CardContent>
              {incomingRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('friends.noIncomingRequests')}</p>
              ) : (
                <ul className="divide-y">
                  {incomingRequests.map(renderPerson)}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('friends.outgoingRequests')}</CardTitle>
            </CardHeader>
            <CardContent>
              {outgoingRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('friends.noOutgoingRequests')}</p>
              ) : (
                <ul className="divide-y">
                  {outgoingRequests.map(renderPerson)}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center gap-2">
              <UsersRound aria-hidden="true" className="size-5 text-muted-foreground" />
              <CardTitle>{t('friends.friendList')}</CardTitle>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                {friends.length}
              </span>
            </CardHeader>
            <CardContent>
              {friends.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('friends.noFriends')}</p>
              ) : (
                <ul className="divide-y">{friends.map(renderPerson)}</ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default Friends;
