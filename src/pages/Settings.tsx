import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LoaderCircle, Save } from 'lucide-react';
import { UserAvatar } from '@/components/design/UserAvatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function Settings() {
  const { t } = useTranslation();
  const { user, profile, updateProfile } = useAuth();
  const profileName =
    profile?.display_name || profile?.username || user?.email?.split('@')[0] || '';
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const effectiveDisplayName = displayName ?? profileName;

  const handleAvatarChange = (file: File | undefined) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!file) {
      setAvatarFile(null);
      return;
    }
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setAvatarFile(null);
      setErrorMessage(t('settings.badFileType'));
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setAvatarFile(null);
      setErrorMessage(t('settings.fileTooLarge'));
      return;
    }
    setAvatarFile(file);
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !profile) {
      setErrorMessage(
        t('settings.profileUnavailable'),
      );
      return;
    }

    const normalizedDisplayName = effectiveDisplayName.trim();
    if (!normalizedDisplayName) {
      setErrorMessage(t('settings.enterDisplayName'));
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      let avatarUrl = profile.avatar_url;

      if (avatarFile) {
        const objectPath = `${user.id}/avatar`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(objectPath, avatarFile, {
            cacheControl: '3600',
            contentType: avatarFile.type,
            upsert: true,
          });

        if (uploadError) {
          throw new Error(
            t('settings.uploadFailed', { message: uploadError.message }),
          );
        }

        const { data } = supabase.storage
          .from('avatars')
          .getPublicUrl(objectPath);
        avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
      }

      const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update({
          display_name: normalizedDisplayName,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
        .select('*')
        .single();

      if (updateError) {
        throw new Error(t('settings.saveFailed', { message: updateError.message }));
      }

      updateProfile(updatedProfile);
      setDisplayName(updatedProfile.display_name ?? updatedProfile.username);
      setAvatarFile(null);
      setSuccessMessage(t('settings.saved'));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t('settings.saveFailedGeneric'),
      );
    } finally {
      setSaving(false);
    }
  };

  const displayedAvatarUrl = profile?.avatar_url ?? null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-7">
      <div>
        <p className="text-sm text-muted-foreground">{t('settings.tagline')}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{t('settings.title')}</h1>
        <p className="mt-2 text-muted-foreground">
          {t('settings.intro')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.profile')}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t('settings.profileDescription')}
          </p>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-6" onSubmit={handleSave}>
            <div className="flex flex-wrap items-center gap-4">
              <UserAvatar
                name={effectiveDisplayName || t('settings.profileFallback')}
                imageUrl={displayedAvatarUrl}
                className="size-20 text-lg"
              />
              <div className="grid gap-2">
                <Label htmlFor="profile-avatar">{t('settings.picture')}</Label>
                <Input
                  id="profile-avatar"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) =>
                    handleAvatarChange(event.target.files?.[0])
                  }
                  className="h-10 max-w-sm"
                />
                <p className="text-xs text-muted-foreground">
                  {t('settings.fileHint')}
                </p>
                {avatarFile && (
                  <p className="text-xs text-muted-foreground">
                    {t('settings.selectedFile', { name: avatarFile.name })}
                  </p>
                )}
              </div>
            </div>

            <div className="grid max-w-lg gap-2">
              <Label htmlFor="profile-display-name">{t('settings.displayName')}</Label>
              <Input
                id="profile-display-name"
                value={effectiveDisplayName}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  setSuccessMessage(null);
                }}
                required
                minLength={1}
                maxLength={80}
                autoComplete="name"
              />
            </div>

            <div className="grid max-w-lg gap-2">
              <Label htmlFor="profile-email">{t('settings.email')}</Label>
              <Input
                id="profile-email"
                value={user?.email ?? ''}
                readOnly
                aria-readonly="true"
              />
              <p className="text-xs text-muted-foreground">
                {t('settings.emailHint')}
              </p>
            </div>

            {errorMessage && (
              <p
                className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
                role="alert"
              >
                {errorMessage}
              </p>
            )}
            {successMessage && (
              <p
                className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400"
                role="status"
              >
                {successMessage}
              </p>
            )}

            <div>
              <Button type="submit" disabled={saving || !profile}>
                {saving ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                ) : (
                  <Save aria-hidden="true" />
                )}
                {saving ? t('common.saving') : t('common.saveChanges')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default Settings;
