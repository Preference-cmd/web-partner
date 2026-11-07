import type { APIRoute } from 'astro';
import { handleChat } from '../../lib/chat/proxy';

export const prerender = false;

export const POST: APIRoute = ({ request }) => handleChat(request);
