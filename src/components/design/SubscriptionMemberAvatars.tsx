import { useTranslation } from 'react-i18next';
import type { SubscriptionMemberPreview } from '@/data/subscriptions';
import { UserAvatar } from '@/components/design/UserAvatar';

export function SubscriptionMemberAvatars({
  members,
  currentUserId,
  className = '',
}: {
  members: SubscriptionMemberPreview[];
  currentUserId: string | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const otherMembers = members.filter(
    ({ userId }) => userId !== currentUserId,
  );

  if (otherMembers.length === 0) return null;

  return (
    <div
      className={`flex -space-x-2 ${className}`}
      aria-label={t('sharing.sharedWithPeople', { count: otherMembers.length })}
    >
      {otherMembers.slice(0, 4).map((member) => (
        <span
          key={member.userId}
          className="rounded-full ring-2 ring-background"
          title={`${member.displayName} (@${member.username})`}
        >
          <UserAvatar
            name={member.displayName}
            imageUrl={member.avatarUrl}
            className="size-6 text-[0.55rem]"
          />
        </span>
      ))}
      {otherMembers.length > 4 && (
        <span
          className="flex size-6 items-center justify-center rounded-full bg-muted text-[0.6rem] font-medium text-muted-foreground ring-2 ring-background"
          title={t('sharing.moreMembers', {
            count: otherMembers.length - 4,
          })}
        >
          +{otherMembers.length - 4}
        </span>
      )}
    </div>
  );
}
