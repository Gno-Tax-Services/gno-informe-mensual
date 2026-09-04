export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[#0B1F3A] flex items-center justify-center">
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-10 w-full max-w-md text-center">
        <h1 className="text-white text-2xl font-serif mb-2">
          GNO Tax &amp; Business Center
        </h1>
        <p className="text-[#7FA3C4] text-sm mb-8">
          Portal de Informes Financieros
        </p>
        
          href="/api/auth/signin/google?callbackUrl=%2Fadmin"
          className="block w-full bg-white text-[#0B1F3A] font-semibold py-3 px-6 rounded-lg hover:bg-gray-100 transition text-center"
        >
          Iniciar sesión con Google
        </a>
        <p className="text-[#7FA3C4] text-xs mt-6">
          Acceso exclusivo para el equipo de GNO Tax
        </p>
      </div>
    </main>
  )
}
