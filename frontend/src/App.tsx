import { useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useTelegramInitData } from './hooks/useTelegramInitData';
import { useUserStore } from './store/userStore';

export default function App() {
  const { initData, loaded } = useTelegramInitData();
  const { setInitData, loadProfile, profile, isLoading } = useUserStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loaded && initData) {
      setInitData(initData);
      loadProfile();
    }
  }, [loaded, initData]);

  // Redirect logic
  useEffect(() => {
    if (!profile) return;

    // If not confirmed age and not already on onboarding
    if (!profile.isAdultConfirmed && location.pathname !== '/onboarding') {
      navigate('/onboarding');
    }
  }, [profile, location.pathname]);

  if (!loaded || isLoading) {
    return <div className="loader">Загрузка inny...</div>;
  }

  if (!initData) {
    return <div className="error-screen">Пожалуйста, откройте приложение через Telegram.</div>;
  }

  // Hide nav on Chat and Onboarding pages
  const showNav = !location.pathname.startsWith('/chat') && location.pathname !== '/onboarding';

  return (
    <div className="app-layout">
      <main className="content">
        <Outlet />
      </main>

      {showNav && (
        <nav className="bottom-nav">
          <Link to="/characters" className={location.pathname.includes('/characters') ? 'active' : ''}>
            <span className="text-lg">👥</span>
            <span>Персонажи</span>
          </Link>
          <Link to="/profile" className={location.pathname.includes('/profile') ? 'active' : ''}>
            <span className="text-lg">👤</span>
            <span>Профиль</span>
          </Link>
          {profile?.isAdmin && (
            <Link to="/admin" className={location.pathname.includes('/admin') ? 'active' : ''}>
              <span className="text-lg">⚙️</span>
              <span>Админ</span>
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
