import { env } from 'cloudflare:workers';
import { handle } from '../../../lib/household.mjs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return handle(request, env.DB, env); }
export async function POST(request: Request) { return handle(request, env.DB, env); }
