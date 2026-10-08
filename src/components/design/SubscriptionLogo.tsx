import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function SubscriptionLogo({
  name,
  logoUrl,
  avatarColor,
  className = 'size-10',
}: {
  name: string;
  logoUrl: string | null;
  avatarColor?: string | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const safeColor =
    avatarColor && /^#[\da-f]{6}$/i.test(avatarColor) ? avatarColor : null;
  const colorValue = safeColor
    ? Number.parseInt(safeColor.slice(1), 16)
    : null;
  const luminance =
    colorValue === null
      ? 0
      : (0.299 * ((colorValue >> 16) & 255) +
          0.587 * ((colorValue >> 8) & 255) +
          0.114 * (colorValue & 255)) /
        255;
  const avatarStyle = safeColor
    ? {
        backgroundColor: safeColor,
        color: luminance > 0.62 ? '#111827' : '#ffffff',
      }
    : undefined;

  if (!logoUrl || imageFailed) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-xl text-sm font-semibold ${safeColor ? '' : 'bg-muted text-muted-foreground'} ${className}`}
        style={avatarStyle}
        aria-label={t('common.logoUnavailable', { name })}
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={t('common.logoAlt', { name })}
      className={`shrink-0 rounded-xl border object-contain p-1 ${className}`}
      style={safeColor ? { backgroundColor: safeColor } : undefined}
      onError={() => setImageFailed(true)}
    />
  );
}
