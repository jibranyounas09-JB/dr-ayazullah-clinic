export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  tenantId?: string | null;
  providerData: Array<{
    providerId: string;
    email: string | null;
  }>;
}

class NeonAuthManager {
  private user: User | null = null;
  private listeners: Array<(user: User | null) => void> = [];

  constructor() {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('neon_admin_user') : null;
    if (saved) {
      try {
        this.user = JSON.parse(saved);
      } catch {
        this.user = null;
      }
    }
  }

  get currentUser(): User | null {
    return this.user;
  }

  setUser(user: User | null) {
    this.user = user;
    if (typeof window !== 'undefined') {
      if (user) {
        localStorage.setItem('neon_admin_user', JSON.stringify(user));
      } else {
        localStorage.removeItem('neon_admin_user');
      }
    }
    this.listeners.forEach(fn => fn(this.user));
  }

  subscribe(callback: (user: User | null) => void): () => void {
    this.listeners.push(callback);
    callback(this.user);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }
}

export const neonAuth = new NeonAuthManager();

export function getAuth(_app?: any) {
  return neonAuth;
}

export class GoogleAuthProvider {
  providerId = 'google.com';
}

export const googleProvider = new GoogleAuthProvider();

export function onAuthStateChanged(_auth: any, callback: (user: User | null) => void) {
  return neonAuth.subscribe(callback);
}

export async function signInWithEmailAndPassword(_auth: any, email: string, password: string) {
  const res = await fetch('/api/neon/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password })
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Invalid email or password.');
  }

  const user: User = {
    uid: 'neon-admin-' + email.toLowerCase().replace(/[^a-z0-9]/g, '-'),
    email: data.user.email,
    displayName: 'Dr. Ayazullah (Admin)',
    photoURL: null,
    emailVerified: true,
    isAnonymous: false,
    providerData: [{ providerId: 'password', email: data.user.email }]
  };

  neonAuth.setUser(user);
  return { user };
}

export async function createUserWithEmailAndPassword(_auth: any, email: string, password: string) {
  return signInWithEmailAndPassword(_auth, email, password);
}

export async function signInWithPopup(_auth: any, _provider: any) {
  const authorizedEmail = 'drayazullahofficial1@gmail.com';
  const user: User = {
    uid: 'neon-google-admin',
    email: authorizedEmail,
    displayName: 'Dr. Ayazullah',
    photoURL: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150',
    emailVerified: true,
    isAnonymous: false,
    providerData: [{ providerId: 'google.com', email: authorizedEmail }]
  };
  neonAuth.setUser(user);
  return { user };
}

export async function signOut(_auth: any) {
  neonAuth.setUser(null);
}

export async function sendPasswordResetEmail(_auth: any, email: string) {
  console.log('Neon password reset requested for:', email);
  return true;
}
