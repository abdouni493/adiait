"use client";

/**
 * =============================================================================
 *  RÉGLAGES → WHATSAPP — connecter le téléphone SANS terminal
 * =============================================================================
 *
 *  C'est la pièce qui rend le montage utilisable. Sans elle, lier le téléphone
 *  imposerait d'appeler l'API de la passerelle à la main, jeton compris.
 *
 *  CE QU'IL N'AFFICHE JAMAIS : la clé d'API, le jeton du webhook, l'URL
 *  complète de la passerelle. Hôte seul, nom d'instance masqué. Cet écran est
 *  ouvert devant du personnel administratif, et tout ce qu'il affiche est aussi
 *  visible dans l'onglet réseau du navigateur.
 *
 *  DEUX RÈGLES DE DESSIN VIENNENT DE PANNES RÉELLES :
 *
 *  1. « RÉENREGISTRER LE WEBHOOK » EST DISPONIBLE SESSION OUVERTE. C'est
 *     exactement le cas qui en a besoin — webhook périmé, session saine — et
 *     c'est celui où le bouton avait été oublié. Le seul contournement était de
 *     délier le téléphone : casser une session valide pour corriger une URL.
 *
 *  2. ON N'ANNONCE « PRÊTE » QUE SI LE WEBHOOK EST RÉELLEMENT VÉRIFIÉ.
 *     Constater qu'une variable existe côté serveur ne dit rien de ce que la
 *     passerelle, elle, enverra. L'application RELIT donc le webhook enregistré
 *     et distingue quatre états : non configuré, adresse périmée, jeton
 *     divergent, jeton vérifié.
 *
 *  LE SONDAGE EST COURT UNIQUEMENT TANT QU'UN QR EST AFFICHÉ. Un QR expire en
 *  moins d'une minute, et cet écran reste parfois ouvert des heures : sonder en
 *  permanence réveillerait la passerelle pour rien toute la journée.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  CheckCircle2,
  Inbox,
  Link2,
  Loader2,
  LogOut,
  MessageCircle,
  QrCode,
  RefreshCw,
  RotateCw,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/lib/store/toast";
import { ApiError, fetchStatus, flushOutbox, sessionAction } from "@/lib/whatsapp/client";
import type { GatewayStatus, WebhookState } from "@/lib/whatsapp/core";

/** Sondage court : uniquement tant qu'un QR est affiché (il expire vite). */
const QR_POLL_MS = 4000;

const WEBHOOK_LABEL: Record<WebhookState, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  missing: { label: "Non configuré", tone: "danger" },
  stale: { label: "Adresse périmée", tone: "warning" },
  "token-mismatch": { label: "Jeton divergent", tone: "warning" },
  verified: { label: "Jeton vérifié", tone: "success" },
};

export function WhatsAppSettingsPanel() {
  const { addToast } = useToast();
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchStatus();
      setStatus(next);
      setFatal(null);
      // La session s'est ouverte pendant qu'on regardait le QR : il n'a plus
      // lieu d'être, et le badge passe au vert TOUT SEUL.
      if (next.connected) {
        setQr(null);
        setPairingCode(null);
      }
    } catch (err) {
      if (err instanceof ApiError && err.notDeployed) {
        setFatal(
          "Les routes /api/whatsapp ne sont pas déployées sur ce site. Redéployez l'application, puis rouvrez cet écran.",
        );
      } else {
        setFatal(err instanceof Error ? err.message : "Impossible de lire l'état de la passerelle.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // La première lecture est DIFFÉRÉE d'un tour de boucle : un effet ne doit pas
  // poser d'état en synchrone, sous peine de rendus en cascade.
  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(first);
  }, [refresh]);

  /** Le sondage n'existe QUE tant qu'un QR est à l'écran. */
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!qr) {
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
      return;
    }
    timer.current = setInterval(() => void refresh(), QR_POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [qr, refresh]);

  const run = async (
    action: "setup" | "connect" | "restart" | "logout",
    label: string,
  ) => {
    setBusy(action);
    try {
      const res = await sessionAction(action);
      if (action === "connect") {
        setQr(res.qr ?? null);
        setPairingCode(res.pairingCode ?? null);
        if (!res.qr && !res.pairingCode) {
          addToast({
            type: "info",
            title: "Aucun QR à afficher",
            message: "La session est peut-être déjà ouverte — actualisez l'état.",
          });
        }
      }
      if (action === "logout") {
        setQr(null);
        setPairingCode(null);
      }
      addToast({ type: "success", title: label, message: "Opération effectuée." });
      await refresh();
    } catch (err) {
      const api = err instanceof ApiError ? err : null;
      addToast({
        type: "danger",
        title: label,
        message: [api?.message ?? "Échec de l'opération.", api?.hint].filter(Boolean).join(" "),
      });
    } finally {
      setBusy(null);
    }
  };

  const doFlush = async () => {
    setBusy("flush");
    try {
      const res = await flushOutbox();
      addToast({
        type: res.sent > 0 ? "success" : "info",
        title: "File d'attente",
        message: `${res.sent} message(s) repartis, ${res.remaining} encore en attente.`,
      });
      await refresh();
    } catch (err) {
      addToast({
        type: "danger",
        title: "File d'attente",
        message: err instanceof Error ? err.message : "Le vidage a échoué.",
      });
    } finally {
      setBusy(null);
    }
  };

  /** « Prête » exige TOUT : configurée, joignable, session ouverte, ET webhook
   *  réellement vérifié. Trois sur quatre ne suffisent pas. */
  const ready =
    !!status &&
    status.configured &&
    status.reachable &&
    status.connected &&
    status.webhook === "verified";

  return (
    <div className="space-y-5">
      <Card className="border border-line rounded-2xl card-shadow">
        <CardBody className="space-y-5 p-6">
          {/* ---- L'en-tête et le verdict ---- */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
                <MessageCircle className="h-5 w-5 text-primary" /> Passerelle WhatsApp du club
              </h3>
              <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted">
                Les messages partent du <strong>numéro WhatsApp du club</strong>, depuis une
                passerelle hébergée sur un poste de l&apos;écurie. Aucun modèle à faire approuver,
                aucun frais par message —{" "}
                <strong className="text-warning">
                  mais poste éteint = aucun message ne part
                </strong>{" "}
                : ils attendent en file et repartent tout seuls au rallumage.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {loading ? (
                <Badge tone="neutral">
                  <Loader2 className="h-3 w-3 animate-spin" /> Lecture…
                </Badge>
              ) : ready ? (
                <Badge tone="success">
                  <CheckCircle2 className="h-3 w-3" /> La passerelle est prête
                </Badge>
              ) : (
                <Badge tone="warning">
                  <AlertTriangle className="h-3 w-3" /> Configuration incomplète
                </Badge>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => void refresh()}
                disabled={loading}
                className="gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Actualiser
              </Button>
            </div>
          </div>

          {fatal && (
            <p className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{fatal}</span>
            </p>
          )}

          {status && (
            <>
              {/* ---- Ce que la passerelle dit d'elle-même ---- */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                <Fact
                  label="Passerelle"
                  value={status.gatewayHost ?? "non configurée"}
                  tone={status.reachable ? "success" : status.configured ? "danger" : "neutral"}
                  hint={status.reachable ? "joignable" : "injoignable"}
                />
                <Fact
                  label="Instance"
                  value={status.instanceMasked ?? "—"}
                  tone={status.instanceExists ? "success" : "warning"}
                  hint={status.instanceExists ? "déclarée" : "à initialiser"}
                />
                <Fact
                  label="Téléphone lié"
                  value={status.phoneNumber ?? "aucun"}
                  tone={status.connected ? "success" : "warning"}
                  hint={status.profileName ?? (status.connected ? "session ouverte" : "session fermée")}
                />
                <Fact
                  label="Webhook"
                  value={WEBHOOK_LABEL[status.webhook].label}
                  tone={WEBHOOK_LABEL[status.webhook].tone}
                  hint={
                    status.webhookHost
                      ? `vers ${status.webhookHost}`
                      : `attendu : ${status.expectedWebhookHost ?? "—"}`
                  }
                />
              </div>

              {/* ---- Ce qu'il faut faire, en une phrase ---- */}
              {status.hint && (
                <p className="flex items-start gap-2 rounded-xl border border-warning/35 bg-warning/10 p-3 text-xs leading-relaxed text-ink">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <span>{status.hint}</span>
                </p>
              )}

              {status.error && (
                <p className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs leading-relaxed text-danger">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{status.error}</span>
                </p>
              )}

              {/* ---- La variable écartée, NOMMÉE ---- */}
              {status.ignoredEnv && (
                <p className="flex items-start gap-2 rounded-xl border border-warning/35 bg-warning/5 p-3 text-[11px] leading-relaxed text-muted">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <span>{status.ignoredEnv}</span>
                </p>
              )}

              {/* ---- La persistance ---- */}
              {!status.persistence && (
                <p className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-[11px] leading-relaxed text-danger">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <strong>La file d&apos;attente est indisponible</strong> :{" "}
                    <code>SUPABASE_SERVICE_ROLE_KEY</code> n&apos;est pas posée côté serveur. Les
                    envois fonctionnent, mais tout message émis passerelle éteinte serait{" "}
                    <strong>perdu</strong>, et aucun accusé de remise ne pourrait être enregistré.
                  </span>
                </p>
              )}

              {/* ---- La prévisualisation ---- */}
              {status.preview && (
                <p className="flex items-start gap-2 rounded-xl border border-primary/25 bg-primary-50/40 p-3 text-[11px] leading-relaxed text-muted">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    Ce site est un <strong>déploiement de prévisualisation</strong>. Il parle à la
                    MÊME passerelle que la production : « Initialiser » et « Délier le téléphone » y
                    sont refusés, pour ne pas détourner les accusés de remise de la production.
                  </span>
                </p>
              )}

              {/* ---- Les actions ---- */}
              <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                <Button
                  onClick={() => void run("setup", "Initialisation de l'instance")}
                  disabled={busy !== null || !status.configured}
                  className="gap-1.5"
                >
                  {busy === "setup" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                  Initialiser l&apos;instance
                </Button>

                {/*
                  « RÉENREGISTRER LE WEBHOOK » EST LE MÊME APPEL QUE
                  « INITIALISER », ET IL EST DISPONIBLE SESSION OUVERTE. C'est
                  précisément le cas qui en a besoin.
                */}
                {status.connected && status.webhook !== "verified" && (
                  <Button
                    variant="outline"
                    onClick={() => void run("setup", "Réenregistrement du webhook")}
                    disabled={busy !== null}
                    className="gap-1.5"
                  >
                    <ShieldCheck className="h-4 w-4" /> Réenregistrer le webhook
                  </Button>
                )}

                {!status.connected && (
                  <Button
                    variant="accent"
                    onClick={() => void run("connect", "Demande du QR")}
                    disabled={busy !== null || !status.configured}
                    className="gap-1.5"
                  >
                    {busy === "connect" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <QrCode className="h-4 w-4" />
                    )}
                    Afficher le QR
                  </Button>
                )}

                <Button
                  variant="outline"
                  onClick={() => void run("restart", "Redémarrage de l'instance")}
                  disabled={busy !== null || !status.configured}
                  className="gap-1.5"
                >
                  <RotateCw className="h-4 w-4" /> Redémarrer
                </Button>

                {status.connected && (
                  <Button
                    variant="danger"
                    onClick={() => {
                      if (
                        confirm(
                          "Délier le téléphone de la passerelle ?\n\nPlus aucun message ne partira tant qu'un nouveau QR n'aura pas été scanné.",
                        )
                      )
                        void run("logout", "Téléphone délié");
                    }}
                    disabled={busy !== null}
                    className="gap-1.5"
                  >
                    <LogOut className="h-4 w-4" /> Délier le téléphone
                  </Button>
                )}
              </div>

              {/* ---- Le QR ---- */}
              {(qr || pairingCode) && !status.connected && (
                <div className="rounded-2xl border-2 border-dashed border-accent/40 bg-canvas/50 p-5 text-center">
                  <p className="mb-3 text-xs font-semibold text-ink">
                    WhatsApp → <strong>Appareils connectés</strong> →{" "}
                    <strong>Connecter un appareil</strong>, puis scannez ce code.
                  </p>
                  {qr && (
                    <Image
                      src={qr}
                      alt="QR de connexion WhatsApp"
                      width={260}
                      height={260}
                      unoptimized
                      className="mx-auto rounded-xl border border-line bg-white p-2"
                    />
                  )}
                  {pairingCode && (
                    <p className="mt-3 text-sm text-ink">
                      Code de couplage :{" "}
                      <strong className="font-mono tracking-widest">{pairingCode}</strong>
                    </p>
                  )}
                  <p className="mt-3 text-[10px] text-muted">
                    Un QR expire en moins d&apos;une minute. L&apos;écran se met à jour tout seul
                    dès que la session s&apos;ouvre — inutile de recharger la page.
                  </p>
                </div>
              )}

              {/* ---- La file d'attente ---- */}
              {status.pending > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/35 bg-warning/10 p-3">
                  <span className="flex items-center gap-2 text-xs text-ink">
                    <Inbox className="h-4 w-4 shrink-0 text-warning" />
                    <strong>{status.pending}</strong> message(s) en attente : la passerelle
                    n&apos;était pas joignable. Ils repartiront <strong>tout seuls</strong> dès
                    qu&apos;elle le sera.
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void doFlush()}
                    disabled={busy !== null}
                    className="gap-1.5"
                  >
                    {busy === "flush" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Vider maintenant
                  </Button>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>

      {/* ---- Le bloc pédagogique ---- */}
      <Card className="border border-line rounded-2xl">
        <CardBody className="space-y-2 p-5 text-[11px] leading-relaxed text-muted">
          <h4 className="text-xs font-bold text-ink">À savoir</h4>
          <p>
            • <strong className="text-ink">Le poste doit rester allumé.</strong> C&apos;est le prix
            de la gratuité : une session WhatsApp Web maintient une connexion ouverte en
            permanence, ce qu&apos;un hébergeur sans serveur ne sait pas faire. Poste éteint, les
            messages ne sont pas perdus — ils attendent en file — mais ils ne partent pas, et rien
            ne vous prévient.
          </p>
          <p>
            • <strong className="text-ink">La cadence est volontairement lente</strong> : 3 à 7
            secondes entre deux destinataires, tirées au hasard. WhatsApp bannit les comptes qui
            écrivent vite et à beaucoup de monde, et un numéro banni l&apos;est{" "}
            <strong>sans recours</strong>.
          </p>
          <p>
            • <strong className="text-ink">Aucun secret ne s&apos;affiche ici</strong> : ni clé
            d&apos;API, ni jeton de webhook, ni adresse complète de la passerelle.
          </p>
          <p>
            • Après un déménagement du poste,{" "}
            <strong className="text-ink">réenregistrez le webhook</strong> : il est stocké SUR la
            passerelle et continuerait sinon de pointer vers l&apos;ancienne adresse — les messages
            partiraient, aucun accusé ne reviendrait, et aucune erreur ne le signalerait.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function Fact({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  const ring = {
    success: "border-success/30 bg-success/8",
    warning: "border-warning/35 bg-warning/8",
    danger: "border-danger/35 bg-danger/8",
    neutral: "border-line bg-canvas/50",
  }[tone];
  return (
    <div className={`rounded-xl border p-3 ${ring}`}>
      <span className="block text-[9px] font-bold uppercase tracking-wide text-muted">{label}</span>
      <strong className="mt-0.5 block truncate text-xs font-bold text-ink">{value}</strong>
      {hint && <span className="block truncate text-[10px] text-muted">{hint}</span>}
    </div>
  );
}
