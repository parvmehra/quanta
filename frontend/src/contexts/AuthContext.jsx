import React, { createContext, useContext, useState, useEffect } from 'react';
import axiosInstance from '../utils/axiosInstance';
import toast from 'react-hot-toast';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPhonePrompt, setShowPhonePrompt] = useState(false);

  // Check current session
  const checkAuth = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      setIsAuthenticated(false);
      setUser(null);
      return;
    }

    try {
      const res = await axiosInstance.get('/api/auth/me');
      if (res.data?.user) {
        setUser(res.data.user);
        setIsAuthenticated(true);
        localStorage.setItem('userId', res.data.user.id);
        localStorage.setItem('isAuthenticated', 'true');

        // Check if phone onboarding needed
        if (!res.data.user.isPhoneVerified && !res.data.user.phonePromptDismissed) {
          setShowPhonePrompt(true);
        }
      }
    } catch (err) {
      console.warn('Session check failed:', err.response?.data?.message || err.message);
      localStorage.removeItem('token');
      localStorage.removeItem('isAuthenticated');
      localStorage.removeItem('userId');
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();

    const handleAuthChange = () => checkAuth();
    window.addEventListener('authChange', handleAuthChange);
    return () => window.removeEventListener('authChange', handleAuthChange);
  }, []);

  // Standard Login
  const login = async (email, password) => {
    const res = await axiosInstance.post('/api/auth/login', { email, password });
    if (res.data.token) {
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('isAuthenticated', 'true');
      localStorage.setItem('userId', res.data.user.id);
      setUser(res.data.user);
      setIsAuthenticated(true);
      window.dispatchEvent(new Event('authChange'));
    }
    return res.data;
  };

  // Verify Login 2FA OTP
  const verifyLoginOtp = async (email, otp) => {
    const res = await axiosInstance.post('/api/auth/verify-login-otp', { email, otp });
    if (res.data.token) {
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('isAuthenticated', 'true');
      localStorage.setItem('userId', res.data.user.id);
      setUser(res.data.user);
      setIsAuthenticated(true);
      window.dispatchEvent(new Event('authChange'));
    }
    return res.data;
  };

  // Resend Login OTP
  const resendLoginOtp = async (email) => {
    const res = await axiosInstance.post('/api/auth/resend-login-otp', { email });
    return res.data;
  };

  // Standard Registration
  const signup = async (name, email, password) => {
    const res = await axiosInstance.post('/api/auth/signup', { name, email, password });
    return res.data;
  };

  // Verify Email Code
  const verifyEmail = async (email, token) => {
    const res = await axiosInstance.post('/api/auth/verify-email', { email, token });
    if (res.data.token) {
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('isAuthenticated', 'true');
      localStorage.setItem('userId', res.data.user.id);
      setUser(res.data.user);
      setIsAuthenticated(true);
      window.dispatchEvent(new Event('authChange'));
    }
    return res.data;
  };

  // Resend Email Verification
  const resendVerification = async (email) => {
    const res = await axiosInstance.post('/api/auth/resend-verification', { email });
    return res.data;
  };

  // Google OAuth Login
  const googleLogin = async (googleUser) => {
    const res = await axiosInstance.post('/api/auth/google', googleUser);
    if (res.data.token) {
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('isAuthenticated', 'true');
      localStorage.setItem('userId', res.data.user.id);
      setUser(res.data.user);
      setIsAuthenticated(true);
      window.dispatchEvent(new Event('authChange'));

      if (res.data.requiresPhoneOnboarding) {
        setShowPhonePrompt(true);
      }
    }
    return res.data;
  };

  // Send Phone OTP
  const sendPhoneOtp = async (phone) => {
    const res = await axiosInstance.post('/api/auth/phone/send-otp', { phone });
    return res.data;
  };

  // Verify Phone OTP
  const verifyPhoneOtp = async (otp) => {
    const res = await axiosInstance.post('/api/auth/phone/verify-otp', { otp });
    if (res.data.user) {
      setUser(res.data.user);
      setShowPhonePrompt(false);
    }
    return res.data;
  };

  // Dismiss Phone Onboarding Prompt
  const dismissPhonePrompt = async () => {
    setShowPhonePrompt(false);
    try {
      await axiosInstance.post('/api/auth/phone/dismiss-prompt');
      if (user) {
        setUser({ ...user, phonePromptDismissed: true });
      }
    } catch (err) {
      console.warn('Failed to persist dismissal:', err.message);
    }
  };

  // Update Notification Preferences
  const updatePreferences = async (preferences) => {
    const res = await axiosInstance.put('/api/auth/preferences', { preferences });
    if (res.data.preferences && user) {
      setUser({ ...user, notificationPreferences: res.data.preferences });
    }
    return res.data;
  };

  // Logout
  const logout = async () => {
    try {
      await axiosInstance.post('/api/auth/logout');
    } catch (e) {}
    localStorage.removeItem('token');
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('userId');
    setUser(null);
    setIsAuthenticated(false);
    setShowPhonePrompt(false);
    window.dispatchEvent(new Event('authChange'));
    toast.success('Logged out successfully');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        isAuthenticated,
        loading,
        showPhonePrompt,
        setShowPhonePrompt,
        login,
        verifyLoginOtp,
        resendLoginOtp,
        signup,
        verifyEmail,
        resendVerification,
        googleLogin,
        sendPhoneOtp,
        verifyPhoneOtp,
        dismissPhonePrompt,
        updatePreferences,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
