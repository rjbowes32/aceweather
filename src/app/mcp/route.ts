import { handleMcpRequest } from "@/mcp/http.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const POST = handleMcpRequest;
export const GET = handleMcpRequest;
export const DELETE = handleMcpRequest;
export const OPTIONS = handleMcpRequest;
