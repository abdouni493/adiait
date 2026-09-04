/**
 * =============================================================================
 *  L'ADAPTATEUR — il TRADUIT, il ne décide rien
 * =============================================================================
 *
 *  Les six routes WhatsApp sont écrites une seule fois, dans
 *  `lib/whatsapp/server/router.ts`. Ce fichier ne fait que convertir une
 *  `Request` du Web en `RouterRequest`, et la réponse dans l'autre sens.
 *
 *  ⚠️ LE CHEMIN EST LU SUR L'URL, ET LE PARAMÈTRE DE ROUTAGE N'EST QU'UN REPLI.
 *  Avec une route attrape-tout, le segment arrive parfois VIDE en production :
 *  la fonction est bien invoquée, mais le paramètre n'est jamais injecté, et
 *  TOUTES les routes tomberaient sur « Route inconnue ». L'URL, elle, est
 *  toujours là. Ce n'est pas une précaution théorique : c'est une panne vécue,
 *  et elle ne se voit qu'en production.
 *
 *  ⚠️ `dynamic = "force-dynamic"` — ces routes lisent des en-têtes, écrivent en
 *  base et parlent au réseau. Une mise en cache, fût-elle d'une seconde, rendrait
 *  un état de session périmé et ferait scanner un QR déjà expiré.
 */

import { handleWhatsApp, type RouterRequest } from "@/lib/whatsapp/server/router";

export const dynamic = "force-dynamic";

/**
 * LA TEMPORISATION A BESOIN DE CE TEMPS.
 *
 * Trois à sept secondes entre deux destinataires, quarante destinataires au
 * maximum : le budget interne est de 45 s, et l'hébergeur doit laisser un peu
 * plus. En dessous, la fonction serait coupée EN PLEIN VOL — et un message
 * coupé en plein vol n'est ni parti, ni en file.
 */
export const maxDuration = 60;

/** L'hôte et le protocole RÉELS sur lesquels l'application répond. Derrière un
 *  proxy (c'est le cas de tout hébergeur), seuls les en-têtes `x-forwarded-*`
 *  disent la vérité : `request.url` porte l'hôte interne. */
function origin(request: Request): { host: string; proto: string } {
  const h = request.headers;
  const url = new URL(request.url);
  return {
    host: h.get("x-forwarded-host") ?? h.get("host") ?? url.host,
    proto: h.get("x-forwarded-proto") ?? url.protocol.replace(":", ""),
  };
}

function headersOf(request: Request): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  request.headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

async function bodyOf(request: Request): Promise<unknown> {
  if (request.method === "GET" || request.method === "HEAD") return null;
  try {
    const text = await request.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function run(
  request: Request,
  ctx: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const url = new URL(request.url);
  // L'URL d'abord ; le paramètre de routage seulement si elle ne portait rien.
  let path = url.pathname;
  if (!path || path === "/") {
    const params = await ctx.params;
    path = `/api/whatsapp/${(params.path ?? []).join("/")}`;
  }

  const { host, proto } = origin(request);
  const req: RouterRequest = {
    path,
    method: request.method,
    body: await bodyOf(request),
    headers: headersOf(request),
    host,
    proto,
  };

  const res = await handleWhatsApp(req);
  return Response.json(res.body, { status: res.status });
}

export const GET = run;
export const POST = run;
export const PUT = run;
export const DELETE = run;
