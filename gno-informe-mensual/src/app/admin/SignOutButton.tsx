'use client';

import { signOut } from 'next-auth/react';

export default function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-[#7FA3C4] transition hover:bg-white/10 hover:text-white"
    >
      Cerrar sesión
    </button>
  );
}
