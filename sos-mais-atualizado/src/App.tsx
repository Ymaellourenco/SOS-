/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, lazy, Suspense } from 'react';
import { Shell } from './components/Shell';
import { AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { EmergencyGuide } from './types';
import { Toaster } from 'react-hot-toast';
import { useAppInitialization } from './hooks/useAppInitialization';
import { useEmergencyProtocol } from './hooks/useEmergencyProtocol';
import type { OnboardingData } from './components/onboarding/OnboardingFlow';
import type { PrivacySettings } from './components/onboarding/PrivacyCenter';

// Main Tabs (Lazy)
const EmergencyGuides = lazy(() => import('./components/emergency/EmergencyGuides').then(m => ({ default: m.EmergencyGuides })));
const Preparation = lazy(() => import('./components/emergency/Preparation').then(m => ({ default: m.Preparation })));
const IAAssistant = lazy(() => import('./components/emergency/IAAssistant').then(m => ({ default: m.IAAssistant })));
const AlertList = lazy(() => import('./components/alerts/AlertList').then(m => ({ default: m.AlertList })));
const ContactList = lazy(() => import('./components/emergency/ContactList').then(m => ({ default: m.ContactList })));
// Dynamic UI Elements (Lazy)
const HomeView = lazy(() => import('./components/home/HomeView').then(m => ({ default: m.HomeView })));
const OnboardingFlow = lazy(() => import('./components/onboarding/OnboardingFlow').then(m => ({ default: m.OnboardingFlow })));
const JobMonitoring = lazy(() => import('./components/monitoring/JobMonitoring').then(m => ({ default: m.JobMonitoring })));
const CookieBanner = lazy(() => import('./components/onboarding/PrivacyCenter').then(m => ({ default: m.CookieBanner })));
const PrivacyCenter = lazy(() => import('./components/onboarding/PrivacyCenter').then(m => ({ default: m.PrivacyCenter })));
const GuideDetail = lazy(() => import('./components/emergency/GuideDetail').then(m => ({ default: m.GuideDetail })));
const UserProfileModal = lazy(() => import('./components/profile/UserProfileModal').then(m => ({ default: m.UserProfileModal })));
const LegalTerms = lazy(() => import('./components/legal/LegalTerms').then(m => ({ default: m.LegalTerms })));
const SOSFullscreen = lazy(() => import('./components/emergency/SOSFullscreen').then(m => ({ default: m.SOSFullscreen })));

function TabLoader() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
      <Loader2 className="w-6 h-6 animate-spin text-red-500" />
      <p className="text-[10px] font-black uppercase tracking-widest">A carregar sistema...</p>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [selectedGuide, setSelectedGuide] = useState<EmergencyGuide | null>(null);
  const [isPrivacyCenterOpen, setIsPrivacyCenterOpen] = useState(false);
  const [showLegal, setShowLegal] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const { 
    showOnboarding, 
    setShowOnboarding, 
    privacySettings, 
    setPrivacySettings 
  } = useAppInitialization(activeTab);

  const { isSOSFullscreen, setIsSOSFullscreen } = useEmergencyProtocol();

  const handleOnboardingComplete = React.useCallback((data: OnboardingData) => {
    localStorage.setItem('onboarding_complete', 'true');
    setShowOnboarding(false);
  }, [setShowOnboarding]);

  const handlePrivacySave = React.useCallback((settings: PrivacySettings) => {
    setPrivacySettings(settings);
    localStorage.setItem('privacy_accepted', JSON.stringify(settings));
    setIsPrivacyCenterOpen(false);
  }, [setPrivacySettings]);

  const handleSelectGuide = React.useCallback((guide: EmergencyGuide | null) => {
    setSelectedGuide(guide);
  }, []);

  const handleTriggerAI = React.useCallback(() => {
    setActiveTab('chat');
  }, []);

  const handleSeeAllGuides = React.useCallback(() => {
    setActiveTab('guides');
  }, []);

  const handleProfileClick = React.useCallback(() => {
    setIsProfileOpen(true);
  }, []);

  const handleShowLegal = React.useCallback(() => {
    setShowLegal(true);
  }, []);

  const handleBackFromLegal = React.useCallback(() => {
    setShowLegal(false);
  }, []);

  const handleCloseProfile = React.useCallback(() => {
    setIsProfileOpen(false);
  }, []);

  const handleCloseGuide = React.useCallback(() => {
    setSelectedGuide(null);
  }, []);

  const handleClosePrivacy = React.useCallback(() => {
    setIsPrivacyCenterOpen(false);
  }, []);

  const handleAcceptAllPrivacy = React.useCallback(() => {
    handlePrivacySave({ strictlyNecessary: true, performance: true, marketing: false });
  }, [handlePrivacySave]);

  const handleOpenPrivacy = React.useCallback(() => {
    setIsPrivacyCenterOpen(true);
  }, []);

  if (showOnboarding) {
    return (
      <Suspense fallback={<TabLoader />}>
        <OnboardingFlow onComplete={handleOnboardingComplete} />
      </Suspense>
    );
  }

  if (showLegal) {
    return (
      <Suspense fallback={<TabLoader />}>
        <LegalTerms onBack={handleBackFromLegal} />
      </Suspense>
    );
  }

  return (
    <>
      <Shell activeTab={activeTab} onTabChange={setActiveTab} onProfileClick={handleProfileClick}>
        <Suspense fallback={<TabLoader />}>
          {activeTab === 'home' && (
            <HomeView 
              onTriggerAI={handleTriggerAI}
              onSelectGuide={handleSelectGuide}
              onSeeAllGuides={handleSeeAllGuides}
              onShowLegal={handleShowLegal}
            />
          )}

          {activeTab === 'alerts' && (
            <AlertList />
          )}

          {activeTab === 'chat' && (
            <IAAssistant onTabChange={setActiveTab} onSelectGuide={handleSelectGuide} />
          )}

          {activeTab === 'prepare' && (
            <Preparation />
          )}

          {activeTab === 'guides' && (
            <div className="bg-slate-50 pb-40">
              <EmergencyGuides onSelect={handleSelectGuide} />
            </div>
          )}

          {activeTab === 'contacts' && (
            <ContactList />
          )}

          {activeTab === 'monitoring' && (
            <JobMonitoring />
          )}
        </Suspense>
      </Shell>

      <AnimatePresence>
        {!privacySettings && !showOnboarding && (
          <Suspense fallback={null}>
            <CookieBanner 
              onOpenSettings={handleOpenPrivacy}
              onAcceptAll={handleAcceptAllPrivacy}
            />
          </Suspense>
        )}
      </AnimatePresence>

      <Suspense fallback={null}>
        <PrivacyCenter 
          isOpen={isPrivacyCenterOpen}
          onClose={handleClosePrivacy}
          onSave={handlePrivacySave}
        />
      </Suspense>

      <Suspense fallback={null}>
        <GuideDetail 
          guide={selectedGuide} 
          onClose={handleCloseGuide} 
        />
      </Suspense>

      <Suspense fallback={null}>
        <UserProfileModal 
          isOpen={isProfileOpen}
          onClose={handleCloseProfile}
        />
      </Suspense>
      <Toaster position="top-center" />

      <AnimatePresence>
        {isSOSFullscreen && (
          <Suspense fallback={null}>
            <SOSFullscreen onClose={() => setIsSOSFullscreen(false)} />
          </Suspense>
        )}
      </AnimatePresence>
    </>
  );
}
