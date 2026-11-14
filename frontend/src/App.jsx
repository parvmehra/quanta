import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { AuthProvider } from './contexts/AuthContext';

import PublicLayout from './layouts/PublicLayout';
import AppShell from './layouts/AppShell';
import PhoneOnboardingModal from './components/PhoneOnboardingModal';
import AuthLayout from './components/authLayout';

import Home from './pages/Home';
import About from './pages/About';
const Login = lazy(() => import('./pages/login'));
const Signup = lazy(() => import('./pages/signup'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const MarketOverview = lazy(() => import('./pages/MarketOverview'));
const StockExplorer = lazy(() => import('./pages/StockExplorer'));
const StockDetails = lazy(() => import('./pages/StockDetails'));
const TradingTerminal = lazy(() => import('./pages/TradingTerminal'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
const Orders = lazy(() => import('./pages/Orders'));
const Wallet = lazy(() => import('./pages/Wallet'));
const Profile = lazy(() => import('./pages/Profile'));
const FAQ = lazy(() => import('./pages/FAQ'));
import NotFound from './pages/NotFound';

const Loading = () => (
  <div role="status" aria-label="Loading" style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
    <div className="animate-spin" style={{ width: 24, height: 24, border: '2px solid var(--q-border)', borderTopColor: 'var(--q-info)', borderRadius: '50%' }} />
  </div>
);

const guard = (el) => <AuthLayout>{el}</AuthLayout>;

function App() {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <Router>
          <AuthProvider>
            <Toaster
              position="bottom-right"
              toastOptions={{
                style: {
                  background: 'var(--q-surface-2)',
                  color: 'var(--q-text)',
                  border: '1px solid var(--q-border)',
                  fontFamily: 'var(--q-font)',
                },
              }}
            />
            <PhoneOnboardingModal />
            <Suspense fallback={<Loading />}>
            <Routes>
              <Route element={<PublicLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/about" element={<About />} />
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
              </Route>

              <Route element={<AppShell />}>
                <Route path="/dashboard" element={guard(<Dashboard />)} />
                <Route path="/markets" element={<MarketOverview />} />
                <Route path="/analyzer" element={<StockExplorer />} />
                <Route path="/stock/:symbol" element={<StockDetails />} />
                <Route path="/trade" element={guard(<TradingTerminal />)} />
                <Route path="/trade/:symbol" element={guard(<TradingTerminal />)} />
                <Route path="/portfolio" element={guard(<Portfolio />)} />
                <Route path="/orders" element={guard(<Orders />)} />
                <Route path="/wallet" element={guard(<Wallet />)} />
                <Route path="/profile" element={guard(<Profile />)} />
                <Route path="/faq" element={<FAQ />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
            </Suspense>
          </AuthProvider>
        </Router>
      </NotificationProvider>
    </ThemeProvider>
  );
}

export default App;
