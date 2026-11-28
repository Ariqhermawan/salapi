import { getMarketPrices } from "@/lib/server/marketPrices";

// GET Route Handlers are uncached by default. Only the upstream public quote
// uses Next's shared 60-second fetch cache; browsers must recheck timestamps.
export async function GET(request: Request) {
  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";
  return Response.json(await getMarketPrices({ forceRefresh }), {
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
