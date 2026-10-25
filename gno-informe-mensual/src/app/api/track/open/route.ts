import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);


export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');

  if (id) {
    const now = new Date().toISOString();
    const { data: log } = await supabaseAdmin()
      .from('email_logs')
      .select('id, open_count')
      .eq('id', id)
      .single();

    if (log) {
      await supabaseAdmin()
        .from('email_logs')
        .update({
          opened_at: now,
          open_count: (log.open_count || 0) + 1,
        })
        .eq('id', id);
    }
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
