import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function UserAvatar({
  name,
  imageUrl,
  className = 'size-9',
}: {
  name: string;
  imageUrl: string | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageFailed = imageUrl !== null && failedImageUrl === imageUrl;
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || '?';

  if (!imageUrl || imageFailed) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary ${className}`}
        aria-label={t('common.profilePicture', { name })}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={t('common.profileAlt', { name })}
      className={`shrink-0 rounded-full object-cover ${className}`}
      onError={() => setFailedImageUrl(imageUrl)}
    />
  );
}
