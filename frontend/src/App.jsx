import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { AuthProvider } from './contexts/AuthContext';

import Header from './components/Header';
import Footer from './components/Footer';
import PhoneOnboardingModal from './components/PhoneOnboardingModal';
import Home from './pages/Home';
import StockAnalyzer from './pages/StockAnalyzer';
import StockDetails from './pages/StockDetails';
import TradingTerminal from './pages/TradingTerminal';
import Portfolio from './pages/Portfolio';
import About from './pages/About';
import Login from './pages/login';
import Signup from './pages/signup';
import Profile from './pages/Profile';
import FAQ from './pages/FAQ';
import AuthLayout from './components/authLayout';

function App() {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <Router>
          <AuthProvider>
            <div className="app">
              <Toaster 
                 position="bottom-right"
                 toastOptions={{
                   style: {
                     background: 'var(--bg-elevated)',
                     color: 'var(--text-1)',
                     border: '1px solid var(--border)',
                     fontFamily: 'var(--font-body)'
                   }
                 }}
              />
              <PhoneOnboardingModal />
              <Header />
              <main>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route 
                    path="/analyzer" 
                    element={<StockAnalyzer />} 
                  />
                  <Route 
                    path="/stock/:symbol" 
                    element={<StockDetails />} 
                  />
                  {/* Protected trading and portfolio routes */}
                  <Route
                    path="/trade/:symbol"
                    element={
                      <AuthLayout>
                        <TradingTerminal />
                      </AuthLayout>
                    }
                  />
                  <Route
                    path="/trade"
                    element={
                      <AuthLayout>
                        <TradingTerminal />
                      </AuthLayout>
                    }
                  />

                  <Route
                    path="/portfolio"
                    element={
                      <AuthLayout>
                        <Portfolio />
                      </AuthLayout>
                    }
                  />

                  <Route
                    path="/profile"
                    element={
                      <AuthLayout>
                        <Profile />
                      </AuthLayout>
                    }
                  />

                  <Route
                    path="/faq"
                    element={
                      <AuthLayout>
                        <FAQ />
                      </AuthLayout>
                    }
                  />
                  <Route path="/about" element={<About />} />
                  <Route path='/login' element={<Login />} />
                  <Route path='/signup' element={<Signup />} />
                </Routes>
              </main>
              <Footer />
            </div>
          </AuthProvider>
        </Router>
      </NotificationProvider>
    </ThemeProvider>
  );
}

export default App;

