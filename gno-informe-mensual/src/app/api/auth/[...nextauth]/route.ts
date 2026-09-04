import NextAuth, { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

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
  providers: [
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
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
