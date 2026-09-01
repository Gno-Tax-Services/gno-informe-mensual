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
      <body>{children}</body>
    </html>
  );
}
