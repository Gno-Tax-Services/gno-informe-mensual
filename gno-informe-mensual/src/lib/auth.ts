import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { DEMO_EMAIL, demoCredentialsOk, isDemoDatabase, isDemoMode } from '@/lib/demo';

// Correos autorizados a entrar al portal de administración.
// Configurable en Vercel con GNO_ALLOWED_EMAILS (separados por coma).
// Por defecto, solo el personal conocido de GNO.
const ALLOWED_EMAILS = (
  process.env.GNO_ALLOWED_EMAILS ??
  'gnotbc@gmail.com,jgonzalez@gnotbc.com,jeiver@gnotax.com'
)
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const authOptions: NextAuthOptions = {
  // En modo DEMO solo existe el login demo (sin Google); en producción, solo Google.
  providers: isDemoMode()
    ? [
        CredentialsProvider({
          id: 'demo',
          name: 'Demo',
          credentials: { username: { label: 'Usuario' }, password: { label: 'Contraseña', type: 'password' } },
          async authorize(c) {
            if (!c?.username || !c?.password) return null;
            if (!demoCredentialsOk(c.username, c.password)) return null;
            if (!(await isDemoDatabase())) return null; // nunca contra la base real
            return { id: 'demo', name: 'Invitado Demo', email: DEMO_EMAIL };
          },
        }),
      ]
    : [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Solo scopes básicos (no sensibles): evita el muro de verificación de
      // Google. El envío por Gmail NO usa el token del usuario que inicia
      // sesión, sino una credencial dedicada (ver src/lib/gmail.ts).
      authorization: {
        params: { scope: 'openid email profile' },
      },
    }),
  ],
  callbacks: {
    // Restringe el acceso a la allowlist de correos GNO.
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (isDemoMode()) return email === DEMO_EMAIL;
      return !!email && ALLOWED_EMAILS.includes(email);
    },
    // Expone el correo en la sesión (ya viene por defecto).
    async session({ session }) {
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  // Sesión de 8 horas (una jornada); se renueva con actividad cada hora.
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60, updateAge: 60 * 60 },
};

