import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GNO Informe Mensual',
  description: 'Portal de reportes financieros mensuales',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        {process.env.GNO_DEMO_MODE === '1' && (
          <div className="sticky top-0 z-50 bg-gold px-4 py-1.5 text-center text-xs font-medium text-navy">
            DEMO · Datos ficticios · Solo lectura
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
