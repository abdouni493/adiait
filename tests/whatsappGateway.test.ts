import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { routeOf } from "@/lib/whatsapp/server/router";
import { hostOf, maskInstance, webhookTarget } from "@/lib/whatsapp/server/env";
import {
  MAX_MESSAGE_LENGTH,
  PACING_MAX_MS,
  PACING_MIN_MS,
  fillTokens,
  nextPacingDelay,
} from "@/lib/whatsapp/core";

/**
 * ⚠️ LE CHEMIN EST LU SUR L'URL, PAS SUR LE PARAMÈTRE DE ROUTAGE.
 *
 * Avec une route attrape-tout, le segment arrive parfois VIDE en production
 * chez certains hébergeurs : la fonction est bien invoquée, mais le paramètre
 * n'est jamais injecté, et TOUTES les routes tombent sur « Route inconnue ».
 * L'adaptateur garde donc le paramètre en repli — et ce test fige les DEUX
 * conventions, parce que la panne ne se voit qu'en production.
 */
describe("routeOf — les deux conventions de lecture du chemin", () => {
  it("chemin complet, tel que l'URL le porte", () => {
    expect(routeOf("/api/whatsapp/send")).toBe("send");
    expect(routeOf("/api/whatsapp/status")).toBe("status");
    expect(routeOf("/api/whatsapp/outbox/flush")).toBe("outbox/flush");
  });

  it("segment nu, tel qu'un paramètre de routage le donnerait", () => {
    expect(routeOf("send")).toBe("send");
    expect(routeOf("/outbox/flush")).toBe("outbox/flush");
  });

  it("un slash final ou une chaîne de requête ne change rien", () => {
    expect(routeOf("/api/whatsapp/send/")).toBe("send");
    expect(routeOf("/api/whatsapp/status?x=1")).toBe("status");
  });

  it("un préfixe de déploiement ne trompe pas la lecture", () => {
    expect(routeOf("/club/api/whatsapp/webhook")).toBe("webhook");
  });
});

/**
 * L'ADRESSE DU WEBHOOK SE DÉDUIT DU DOMAINE COURANT — jamais d'une variable.
 * Le webhook est stocké SUR la passerelle : il survit à un déménagement et
 * continue de pointer vers l'ancienne adresse, sans qu'aucune erreur ne le dise.
 */
describe("webhookTarget — la dérivation, et ce qu'elle écarte", () => {
  it("déduit l'adresse du domaine sur lequel l'application répond", () => {
    const t = webhookTarget("mon-club.vercel.app", "https");
    expect(t.url).toBe("https://mon-club.vercel.app/api/whatsapp/webhook");
  });

  it("accepte l'adresse locale en développement — c'est la seule qui existe", () => {
    const t = webhookTarget("localhost:3000", "http");
    expect(t.url).toBe("http://localhost:3000/api/whatsapp/webhook");
  });

  it("NOMME la variable écartée quand EVOLUTION_WEBHOOK_URL est posée", () => {
    const previous = process.env.EVOLUTION_WEBHOOK_URL;
    process.env.EVOLUTION_WEBHOOK_URL = "http://host.docker.internal:3000/api/whatsapp/webhook";
    try {
      const t = webhookTarget("mon-club.vercel.app", "https");
      // Elle n'est PAS utilisée…
      expect(t.url).toBe("https://mon-club.vercel.app/api/whatsapp/webhook");
      // …mais celui qui l'a posée croit qu'elle sert : on le lui dit.
      expect(t.ignored).toContain("EVOLUTION_WEBHOOK_URL");
      expect(t.ignored).toContain("host.docker.internal");
    } finally {
      if (previous === undefined) delete process.env.EVOLUTION_WEBHOOK_URL;
      else process.env.EVOLUTION_WEBHOOK_URL = previous;
    }
  });
});

describe("env — ce que l'écran a le droit d'afficher", () => {
  it("l'hôte SEUL, jamais le chemin ni la clé", () => {
    expect(hostOf("https://adiyet-wa.tail1234.ts.net/instance/create?apikey=secret")).toBe(
      "adiyet-wa.tail1234.ts.net",
    );
    expect(hostOf(undefined)).toBeNull();
    expect(hostOf("pas une adresse")).toBeNull();
  });

  it("le nom d'instance est masqué", () => {
    const masked = maskInstance("adiyet");
    expect(masked!.startsWith("ad")).toBe(true);
    expect(masked).not.toContain("iyet");
  });
});

/**
 * LA TEMPORISATION PROTÈGE LE NUMÉRO. WhatsApp bannit les comptes qui écrivent
 * vite et à beaucoup de monde, et un numéro banni l'est SANS RECOURS.
 */
describe("core — la cadence et les jetons", () => {
  it("l'attente entre deux envois reste dans la fenêtre 3–7 s", () => {
    for (let i = 0; i < 200; i++) {
      const delay = nextPacingDelay();
      expect(delay).toBeGreaterThanOrEqual(PACING_MIN_MS);
      expect(delay).toBeLessThanOrEqual(PACING_MAX_MS);
    }
  });

  it("elle est TIRÉE AU HASARD — un intervalle régulier fait robot", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 50; i++) seen.add(nextPacingDelay());
    expect(seen.size).toBeGreaterThan(5);
  });

  it("un jeton connu est remplacé", () => {
    expect(fillTokens("Bonjour {chevalier}, vous devez {dette}.", {
      chevalier: "Yacine",
      dette: "1 200 DA",
    })).toBe("Bonjour Yacine, vous devez 1 200 DA.");
  });

  it("UN JETON INCONNU RESTE TEL QUEL — mieux vaut le voir que d'envoyer une phrase amputée", () => {
    expect(fillTokens("Bonjour {truc}.", { chevalier: "Yacine" })).toBe("Bonjour {truc}.");
  });

  it("la longueur maximale d'un message est celle de WhatsApp", () => {
    expect(MAX_MESSAGE_LENGTH).toBe(4096);
  });
});

/**
 * ⚠️ LE GARDE-FOU QUI COMPTE : rien de `lib/whatsapp/server/` ne doit être
 * importé par du code client.
 *
 * Ces fichiers lisent `EVOLUTION_API_KEY` et `SUPABASE_SERVICE_ROLE_KEY`. Un
 * seul import depuis un composant marqué `"use client"` les ferait entrer dans
 * le paquet JavaScript téléchargé par chaque visiteur — c'est-à-dire le numéro
 * WhatsApp du club, et la base entière, offerts à qui sait ouvrir l'onglet
 * réseau. La fuite serait TOTALEMENT SILENCIEUSE : rien ne casse, tout marche.
 */
describe("cloisonnement — la clé de la passerelle ne quitte jamais le serveur", () => {
  const CODE_EXT = new Set([".ts", ".tsx"]);

  function walk(dir: string, acc: string[]): void {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next") continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, acc);
      else if (CODE_EXT.has(path.extname(full))) acc.push(full);
    }
  }

  const files: string[] = [];
  for (const root of ["lib", "app", "components"]) {
    try {
      walk(path.join(process.cwd(), root), files);
    } catch {
      /* dossier absent */
    }
  }

  it("aucun composant client n'importe lib/whatsapp/server", () => {
    const offenders = files.filter((f) => {
      // Le dossier serveur lui-même a le droit de s'importer.
      if (f.includes(path.join("lib", "whatsapp", "server"))) return false;
      const src = readFileSync(f, "utf8");
      if (!/from\s+["']@\/lib\/whatsapp\/server/.test(src)) return false;
      // Une route serveur (app/api/**) n'est jamais un composant client.
      if (f.includes(path.join("app", "api"))) return false;
      return true;
    });
    expect(offenders).toEqual([]);
  });

  it("aucun fichier serveur ne porte la directive « use client »", () => {
    const serverDir = path.join(process.cwd(), "lib", "whatsapp", "server");
    const serverFiles: string[] = [];
    walk(serverDir, serverFiles);
    expect(serverFiles.length).toBeGreaterThan(0);
    const offenders = serverFiles.filter((f) => /^\s*["']use client["']/m.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("aucune variable de la passerelle n'est préfixée NEXT_PUBLIC_", () => {
    const offenders = files.filter((f) =>
      /NEXT_PUBLIC_(EVOLUTION|SUPABASE_SERVICE)/.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
