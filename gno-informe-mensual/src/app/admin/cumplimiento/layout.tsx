import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { currentStaff } from '@/lib/compliance/staff';
import SignOutButton from '../SignOutButton';

export const dynamic = 'force-dynamic';

const TABS = [
  { href: '/admin/cumplimiento', label: 'Resumen' },
  { href: '/admin/cumplimiento/auditorias', label: 'Auditorías' },
  { href: '/admin/cumplimiento/sales-tax', label: 'Sales Tax' },
  { href: '/admin/cumplimiento/nomina', label: 'Nómina' },
  { href: '/admin/cumplimiento/entregas', label: 'Entregas' },
  { href: '/admin', label: 'Informe Mensual' },
];

export default async function CumplimientoLayout({ children }: { children: ReactNode }) {
  const staff = await currentStaff();
  if (!staff) redirect('/login');
  return (
    <main className="min-h-screen bg-navy text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/gno-logo.png" alt="GNO" className="h-10 w-10 object-contain" />
            <div>
              <h1 className="font-serif text-lg leading-tight">Centro de Cumplimiento</h1>
              <p className="text-xs text-[#7FA3C4]">GNO Tax &amp; Business Center</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-xs text-[#7FA3C4] sm:inline">{staff.nombre} · {staff.rol}</span>
            <SignOutButton />
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-6">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className="whitespace-nowrap rounded-t-md px-3 py-2 text-sm text-[#B9CBDD] hover:bg-white/5 hover:text-white">
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </main>
  );
}
