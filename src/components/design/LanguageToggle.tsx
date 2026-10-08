import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';
import { Button } from '@/components/ui/button';

export function LanguageToggle({
  className,
  variant = 'outline',
}: {
  className?: string;
  variant?: 'outline' | 'ghost';
}) {
  const { t } = useTranslation();
  const nextLanguage = i18n.language.startsWith('es') ? 'en' : 'es';

  const changeLanguage = () => {
    localStorage.setItem('subtrack-language', nextLanguage);
    void i18n.changeLanguage(nextLanguage);
  };

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className={className}
      onClick={changeLanguage}
      aria-label={`${t('language.label')}: ${t(`language.${nextLanguage === 'en' ? 'english' : 'spanish'}`)}`}
      title={t(`language.${nextLanguage === 'en' ? 'english' : 'spanish'}`)}
    >
      {nextLanguage.toUpperCase()}
    </Button>
  );
}
