import { NextRequest } from 'next/server';
import { getConnPool } from '@/lib/connections';
import { generateDump } from '@/lib/dump';

export async function GET(req: NextRequest, { params }: { params: Promise<{ db: string }> }) {
  const { db } = await params;
  const connId = req.nextUrl.searchParams.get('conn') || 'default';

  let pool;
  try {
    pool = await getConnPool(connId);
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  const enc = new TextEncoder();
  const safeDb = db.replace(/[^A-Za-z0-9_\-]/g, '_');
  const filename = `${safeDb}-${new Date().toISOString().slice(0, 10)}.sql`;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generateDump(pool, db)) {
          controller.enqueue(enc.encode(chunk));
        }
      } catch (e: unknown) {
        controller.enqueue(enc.encode(`\n-- ERROR: ${(e as Error).message}\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Transfer-Encoding': 'chunked',
    },
  });
}
