import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

export const useEmergencyProtocol = () => {
  const [isSOSFullscreen, setIsSOSFullscreen] = useState(false);

  useEffect(() => {
    const handleSystemNotification = (e: any) => {
      const { title, body } = (e as CustomEvent).detail;
      const shortBody = body.length > 70 ? `${body.slice(0, 70)}…` : body;
      toast.error(`${title}: ${shortBody}`, {
        duration: 4000,
        icon: '⚠️',
        style: {
          borderRadius: '14px',
          background: '#dc2626',
          color: '#fff',
          fontSize: '9px',
          fontWeight: '900',
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
          border: '2px solid rgba(255,255,255,0.2)',
          maxWidth: '280px',
          padding: '8px 10px',
          lineHeight: '1.3'
        }
      });
    };

    const handleSOSActivated = () => {
      setIsSOSFullscreen(true);
    };

    window.addEventListener('sos-activated', handleSOSActivated);
    window.addEventListener('emergency-notification-sent', handleSystemNotification);
    
    return () => {
      window.removeEventListener('sos-activated', handleSOSActivated);
      window.removeEventListener('emergency-notification-sent', handleSystemNotification);
    };
  }, []);

  return {
    isSOSFullscreen,
    setIsSOSFullscreen
  };
};
