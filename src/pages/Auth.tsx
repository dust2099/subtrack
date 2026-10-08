// src/pages/Auth.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Wallet, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { LanguageToggle } from '@/components/design/LanguageToggle';

export function Auth() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Estados del formulario de Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Estados del formulario de Registro
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');

  // Manejar Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) {
        setErrorMessage(error.message);
      } else {
        navigate('/dashboard');
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t('auth.loginFailed'),
      );
    } finally {
      setLoading(false);
    }
  };

  // Manejar Registro
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: registerEmail,
        password: registerPassword,
        options: {
          data: {
            username: registerUsername.toLowerCase().trim(),
            display_name: registerUsername.trim(),
          },
        },
      });

      if (error) {
        setErrorMessage(error.message);
      } else if (data.session) {
        navigate('/dashboard');
      } else {
        setSuccessMessage(
          t('auth.accountCreated'),
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t('auth.registerFailed'),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="absolute right-4 top-4">
        <LanguageToggle />
      </div>
      {/* Logotipo SubTrack */}
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
          <Wallet className="h-6 w-6" />
        </div>
        <span className="text-3xl font-extrabold tracking-tight">
          Sub<span className="text-primary">Track</span>
        </span>
      </div>

      {/* Contenedor con Tabs */}
      <Card className="w-full max-w-md border-border/50 shadow-xl">
        <Tabs defaultValue="login" className="w-full">
          <CardHeader className="space-y-1 pb-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">{t('auth.login')}</TabsTrigger>
              <TabsTrigger value="register">{t('auth.register')}</TabsTrigger>
            </TabsList>
          </CardHeader>

          <CardContent className="pt-2">
            {errorMessage && (
              <div className="mb-4 rounded-lg bg-destructive/15 p-3 text-sm font-medium text-destructive">
                {errorMessage}
              </div>
            )}
            {successMessage && (
              <div
                className="mb-4 rounded-lg bg-primary/10 p-3 text-sm font-medium text-primary"
                role="status"
              >
                {successMessage}
              </div>
            )}

            {/* TAB 1: LOGIN */}
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">{t('auth.email')}</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder={t('auth.emailPlaceholder')}
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">{t('auth.password')}</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full gap-2" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('auth.signingIn')}
                    </>
                  ) : (
                    <>
                      {t('auth.signInTo')}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>

            {/* TAB 2: REGISTRO */}
            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reg-username">{t('auth.username')}</Label>
                  <Input
                    id="reg-username"
                    type="text"
                    placeholder={t('auth.usernamePlaceholder')}
                    value={registerUsername}
                    onChange={(e) => setRegisterUsername(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-email">{t('auth.email')}</Label>
                  <Input
                    id="reg-email"
                    type="email"
                    placeholder={t('auth.emailPlaceholder')}
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password">{t('auth.password')}</Label>
                  <Input
                    id="reg-password"
                    type="password"
                    placeholder="••••••••"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <Button type="submit" className="w-full gap-2" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('auth.createAccount')}
                    </>
                  ) : (
                    <>
                      {t('auth.registerButton')}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>
          </CardContent>

          <CardFooter className="flex justify-center border-t border-border/40 py-4">
            <p className="text-xs text-muted-foreground">
              {t('auth.description')}
            </p>
          </CardFooter>
        </Tabs>
      </Card>
    </div>
  );
}

export default Auth;