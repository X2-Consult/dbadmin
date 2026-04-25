import { NextResponse } from 'next/server';
import { removeConnection } from '@/lib/connections';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === 'default') return NextResponse.json({ error: 'Cannot delete the default connection' }, { status: 400 });
  removeConnection(id);
  return NextResponse.json({ ok: true });
}
