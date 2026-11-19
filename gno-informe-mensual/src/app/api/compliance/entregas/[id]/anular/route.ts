import { NextRequest, NextResponse } from 'next/server';
import { currentStaff, puede } from '@/lib/compliance/staff';
import { anularEntrega } from '@/lib/compliance/entregas';

export const runtime = 'nodejs';

/** Anula una entrega (no se borra). Solo admin. Body: { motivo } */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await currentStaff();
  if (!puede(staff, 'admin')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { motivo } = await req.json().catch(() => ({ motivo: '' }));
  try {
    return NextResponse.json(await anularEntrega(params.id, staff.email, motivo));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
