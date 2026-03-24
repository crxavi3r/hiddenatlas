import { Routes, Route, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import './index.css';
import { useUserSync } from './hooks/useUserSync';
import { useTrack } from './hooks/useTrack';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ErrorBoundary from './components/ErrorBoundary';

import HomePage from './pages/HomePage';
import ItinerariesPage from './pages/ItinerariesPage';
import ItineraryDetailPage from './pages/ItineraryDetailPage';
import CustomPlanningPage from './pages/CustomPlanningPage';
import PricingPage from './pages/PricingPage';
import AboutPage from './pages/AboutPage';
import FAQPage from './pages/FAQPage';
import { JournalListPage, JournalPostPage } from './pages/JournalPage';
import AIPlannerPage from './pages/AIPlannerPage';
import MyTrips from './pages/MyTrips';
import TripDetailPage from './pages/TripDetailPage';
import CustomItineraryPage from './pages/CustomItineraryPage';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsOfServicePage from './pages/TermsOfServicePage';
import RefundPolicyPage from './pages/RefundPolicyPage';

import AdminPage from './pages/AdminPage';
import DashboardPage from './pages/admin/DashboardPage';
import UsersPage from './pages/admin/UsersPage';
import UserDetailPage from './pages/admin/UserDetailPage';
import SalesPage from './pages/admin/SalesPage';
import DownloadsPage from './pages/admin/DownloadsPage';
import CustomRequestsPage from './pages/admin/CustomRequestsPage';
import ItinerariesCMSPage from './pages/admin/ItinerariesCMSPage';
import ItineraryCMSEditorPage from './pages/admin/ItineraryCMSEditorPage';

// ── Scroll to top on route change ────────────────────────────────────────────
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

// ── Fire PAGE_VIEW event on every route change ────────────────────────────────
function PageViewTracker() {
  const { pathname } = useLocation();
  const { track } = useTrack();
  useEffect(() => {
    // Skip admin pages — we don't want admin activity polluting analytics
    if (!pathname.startsWith('/admin')) {
      track('PAGE_VIEW', { pagePath: pathname });
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// ── Public layout — Navbar + Footer ─────────────────────────────────────────
function PublicLayout() {
  return (
    <>
      <Navbar />
      <main style={{ minHeight: '60vh' }}>
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      <Footer />
    </>
  );
}

export default function App() {
  useUserSync();
  return (
    <>
      <ScrollToTop />
      <PageViewTracker />
      <Routes>

        {/* ── Admin area — own layout, no public navbar/footer ── */}
        <Route path="/admin" element={<AdminPage />}>
          <Route index element={<DashboardPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="users/:id" element={<UserDetailPage />} />
          <Route path="sales" element={<SalesPage />} />
          <Route path="downloads" element={<DownloadsPage />} />
          <Route path="custom-requests" element={<CustomRequestsPage />} />
          <Route path="itineraries" element={<ItinerariesCMSPage />} />
          <Route path="itineraries/:id" element={<ItineraryCMSEditorPage />} />
        </Route>

        {/* ── Public pages — shared Navbar + Footer ── */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/itineraries" element={<ItinerariesPage />} />
          <Route path="/itineraries/:id" element={<ItineraryDetailPage />} />
          <Route path="/custom" element={<CustomPlanningPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/faq" element={<FAQPage />} />
          <Route path="/journal" element={<JournalListPage />} />
          <Route path="/journal/:id" element={<JournalPostPage />} />
          <Route path="/ai-planner" element={<AIPlannerPage />} />
          <Route path="/my-trips" element={<MyTrips />} />
          <Route path="/my-trips/:id" element={<TripDetailPage />} />
          <Route path="/itinerary/custom/:slug" element={<CustomItineraryPage />} />
          <Route path="/sign-in/*" element={<SignInPage />} />
          <Route path="/sign-up/*" element={<SignUpPage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsOfServicePage />} />
          <Route path="/refunds" element={<RefundPolicyPage />} />
        </Route>

      </Routes>
    </>
  );
}
