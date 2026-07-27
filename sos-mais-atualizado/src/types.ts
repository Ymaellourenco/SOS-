export interface UserProfileData {
  fullName: string;
  bloodType: string;
  medications: string;
  allergies: string;
  chronicConditions: string;
  weight: string;
  height: string;
  birthDate: string;
  notificationSound?: string;
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  type: 'family' | 'service';
}

export interface EmergencyGuide {
  id: string;
  title: string;
  description: string;
  steps: string[];
  category: 'heart' | 'fire' | 'quake' | 'flood' | 'drowning';
}

export interface Alert {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  type: 'weather' | 'seismic' | 'fire';
  location: {
    lat: number;
    lng: number;
  };
  timestamp: Date;
  /** Verdadeiramente em curso agora (não apenas "recente") — nunca deve perder severidade nem expirar por idade. */
  isActive?: boolean;
}
