import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CreditCard,
  UsersRound,
  LayoutDashboard,
  LogOut,
  PanelsTopLeft,
  Settings,
} from 'lucide-react';
import { LanguageToggle } from '@/components/design/LanguageToggle';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

type AppSidebarProps = {
  loggingOut: boolean;
  onLogout: () => void;
};

export function AppSidebar({
  loggingOut,
  onLogout,
}: AppSidebarProps) {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const { isMobile, setOpenMobile } = useSidebar();
  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="flex size-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
            <CreditCard aria-hidden="true" className="size-4" />
          </div>
          <span className="text-xl font-extrabold tracking-tight">Subtrack</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {t('nav.workspace')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<NavLink to="/dashboard" end />}
                  isActive={pathname === '/dashboard'}
                  tooltip={t('nav.overview')}
                  size="lg"
                  className="rounded-xl font-semibold"
                  onClick={closeMobileSidebar}
                >
                  <LayoutDashboard aria-hidden="true" />
                  <span>{t('nav.overview')}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<NavLink to="/dashboard/subscriptions" />}
                  isActive={pathname.startsWith('/dashboard/subscriptions')}
                  tooltip={t('nav.subscriptions')}
                  size="lg"
                  className="rounded-xl font-semibold"
                  onClick={closeMobileSidebar}
                >
                  <PanelsTopLeft aria-hidden="true" />
                  <span>{t('nav.subscriptions')}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<NavLink to="/dashboard/friends" />}
                  isActive={pathname.startsWith('/dashboard/friends')}
                  tooltip={t('nav.friends')}
                  size="lg"
                  className="rounded-xl font-semibold"
                  onClick={closeMobileSidebar}
                >
                  <UsersRound aria-hidden="true" />
                  <span>{t('nav.friends')}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-2">
          <LanguageToggle variant="ghost" className="w-full justify-start" />
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<NavLink to="/dashboard/settings" />}
              isActive={pathname.startsWith('/dashboard/settings')}
              tooltip={t('nav.settings')}
              size="lg"
              className="rounded-xl font-semibold"
              onClick={closeMobileSidebar}
            >
              <Settings aria-hidden="true" />
              <span>{t('nav.settings')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={onLogout}
              disabled={loggingOut}
              tooltip={loggingOut ? t('common.signingOut') : t('common.signOut')}
              size="lg"
              className="rounded-xl font-semibold"
            >
              <LogOut aria-hidden="true" />
              <span>{loggingOut ? t('common.signingOut') : t('common.signOut')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
