'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// Mensajes de error legibles según el código que NextAuth agrega a la URL.
const ERROR_MESSAGES: Record<string, string> = {
  google: 'No se pudo iniciar sesión con Google. Intenta de nuevo.',
  OAuthSignin: 'No se pudo iniciar el flujo de Google. Intenta de nuevo.',
  OAuthCallback: 'Google rechazó la respuesta de autenticación. Intenta de nuevo.',
  AccessDenied: 'Acceso denegado. Tu cuenta no está autorizada para este portal.',
  Configuration: 'Error de configuración del servidor. Contacta al administrador.',
};

function LoginContent() {
  const params = useSearchParams();
  const error = params.get('error');
  const callbackUrl = params.get('callbackUrl') || '/admin';
  const [loading, setLoading] = useState(false);

  // Import dinámico: next-auth/react solo se carga en el navegador al hacer
  // clic, así NO se evalúa durante el prerender del build (evita el
  // "TypeError: Invalid URL" de parseUrl cuando NEXTAUTH_URL llega vacío).
  async function handleGoogle() {
    setLoading(true);
    const { signIn } = await import('next-auth/react');
    signIn('google', { callbackUrl });
  }

  return (
    <main className="min-h-screen bg-navy flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Marca GNO */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full border-2 border-gold mb-4">
            <span className="font-serif text-gold text-2xl font-bold tracking-wide">GNO</span>
          </div>
          <h1 className="text-white font-serif text-2xl">Informe Mensual</h1>
          <p className="text-[#7FA3C4] mt-1 text-sm">Portal de administración</p>
        </div>

        {/* Tarjeta de acceso */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 backdrop-blur">
          {error && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
            >
              {ERROR_MESSAGES[error] ?? 'Ocurrió un error al iniciar sesión. Intenta de nuevo.'}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 text-sm font-medium text-gray-800 transition hover:bg-gray-100 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-navy"
          >
            <GoogleIcon />
            {loading ? 'Conectando…' : 'Continuar con Google'}
          </button>

          <p className="mt-4 text-center text-xs text-[#7FA3C4]">
            Solo personal autorizado de GNO Tax &amp; Business Center.
          </p>
        </div>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

export default function LoginPage() {
  // useSearchParams requiere un límite de Suspense en el App Router.
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
