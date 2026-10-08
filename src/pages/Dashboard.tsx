import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, Settings } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { SubscriptionsProvider } from '@/context/SubscriptionsContext';
import { AppSidebar } from '@/components/design/sidebar';
import { UserAvatar } from '@/components/design/UserAvatar';
import { NotificationsBell } from '@/components/design/NotificationsBell';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';

function Dashboard() {
  const { t } = useTranslation();
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const pageTitle = pathname.startsWith('/dashboard/subscriptions')
    ? t('dashboard.subscriptions')
    : pathname.startsWith('/dashboard/friends')
      ? t('dashboard.friends')
    : pathname.startsWith('/dashboard/settings')
      ? t('dashboard.settings')
      : t('dashboard.overview');
  const userName =
    profile?.display_name ||
    profile?.username ||
    user?.email?.split('@')[0] ||
    t('nav.account');

  useEffect(() => {
    if (!accountMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !accountMenuRef.current?.contains(event.target)
      ) {
        setAccountMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [accountMenuOpen]);

  const handleLogout = async () => {
    setLoggingOut(true);
    setErrorMessage(null);
    setAccountMenuOpen(false);

    try {
      await signOut();
      navigate('/auth', { replace: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t('dashboard.logoutFailed'),
      );
      setLoggingOut(false);
    }
  };

  return (
    <SubscriptionsProvider userId={user?.id}>
      <SidebarProvider>
        <AppSidebar
          loggingOut={loggingOut}
          onLogout={handleLogout}
        />

        <SidebarInset className="min-h-svh">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <div className="h-4 w-px bg-border" aria-hidden="true" />
            <span className="text-sm font-medium">{pageTitle}</span>
            <div className="ml-auto flex items-center gap-2">
              {user && <NotificationsBell key={user.id} userId={user.id} />}
              <div className="relative" ref={accountMenuRef}>
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={accountMenuOpen}
                  aria-label={t('nav.accountMenu', { name: userName })}
                  onClick={() => setAccountMenuOpen((open) => !open)}
                  className="flex max-w-56 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <UserAvatar
                    name={userName}
                    imageUrl={profile?.avatar_url ?? null}
                    className="size-9"
                  />
                  <span className="truncate text-sm font-medium">{userName}</span>
                </button>

                {accountMenuOpen && (
                  <div
                    role="menu"
                    aria-label={t('nav.account')}
                    className="absolute right-0 top-full z-50 mt-2 w-48 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
                  >
                    <Link
                      to="/dashboard/settings"
                      role="menuitem"
                      onClick={() => setAccountMenuOpen(false)}
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                    >
                      <Settings aria-hidden="true" className="size-4" />
                      {t('common.settings')}
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={loggingOut}
                      onClick={() => void handleLogout()}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                    >
                      <LogOut aria-hidden="true" className="size-4" />
                      {loggingOut
                        ? t('common.signingOut')
                        : t('common.signOut')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <main className="flex flex-1 flex-col gap-6 p-5 md:p-8">
            {errorMessage && (
              <p
                className="rounded-lg bg-destructive/15 p-3 text-sm font-medium text-destructive"
                role="alert"
              >
                {errorMessage}
              </p>
            )}
            <Suspense
              fallback={
                <div
                  className="flex flex-1 items-center justify-center text-sm text-muted-foreground"
                  role="status"
                >
                  {t('common.loadingDashboard')}
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </SubscriptionsProvider>
  );
}

export default Dashboard;