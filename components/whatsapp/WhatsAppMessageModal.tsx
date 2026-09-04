"use client";

/**
 * =============================================================================
 *  LA FENÊTRE D'ENVOI WHATSAPP — un chevalier, ou tout un groupe
 * =============================================================================
 *
 *  Elle sert deux usages avec le même dessin :
 *
 *   • UN SEUL CHEVALIER (fiche chevalier, fiche parent) — on coche les
 *     destinataires, on relit le texte, on envoie ;
 *   • TOUT UN GROUPE (écran Semestres) — on coche les chevaliers endettés et
 *     chacun reçoit SON message, composé avec SA situation.
 *
 *  QUATRE RÈGLES, ET ELLES VIENNENT TOUTES DE L'USAGE :
 *
 *  1. ON NE PROPOSE JAMAIS D'ENVOYER SANS AVOIR MONTRÉ LE TEXTE. En envoi
 *     groupé, chaque message est dépliable : ce n'est pas un aperçu du premier,
 *     c'est celui de chacun.
 *
 *  2. L'APPLICATION ÉCRIT LE PREMIER JET. Devant un champ vide on écrit vite et
 *     mal — pas de salutation, pas de nom de club, pas de moyen de répondre. Une
 *     famille qui reçoit un rappel sec d'un numéro inconnu BLOQUE le numéro, et
 *     un numéro bloqué par plusieurs personnes finit banni.
 *
 *  3. LE CHEVALIER ET SON PARENT SONT VISÉS ENSEMBLE. Le mineur ne porte pas
 *     toujours de téléphone, le parent n'est pas toujours joignable la journée.
 *     Si le chevalier n'a pas de numéro, le message part au parent seul ; si
 *     PERSONNE n'est joignable, l'écran le DIT — un envoi silencieusement perdu
 *     est pire qu'un refus visible.
 *
 *  4. TROIS ISSUES, JAMAIS CONFONDUES : envoyé, EN ATTENTE (la passerelle était
 *     éteinte — ce n'est pas un échec et cela ne s'affiche pas en rouge), échec.
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  MessageCircle,
  Send,
  Users,
  X,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useData } from "@/lib/store/data";
import { useSettings } from "@/lib/store/settings";
import { useToast } from "@/lib/store/toast";
import { normalizePhone } from "@/lib/whatsapp/phone";
import { sendMessages } from "@/lib/whatsapp/client";
import { MAX_MESSAGE_LENGTH, fillTokens } from "@/lib/whatsapp/core";
import type { OutgoingRecipient, SendResult } from "@/lib/whatsapp/core";
import {
  WHATSAPP_TEMPLATES,
  getTemplate,
  suggestTemplate,
  type MessageLanguage,
  type SituationDetail,
  type WhatsAppTemplateId,
} from "@/lib/whatsapp/templates";
import {
  contextFor,
  recipientsFor,
  unreachableReason,
  type AlertParent,
  type AlertStudent,
} from "@/lib/whatsapp/alert";
import { formatDA } from "@/lib/utils";

/**
 * UN CHEVALIER À QUI L'ON ÉCRIT, avec tout ce qui sert à composer son message.
 *
 * `detail` est facultatif : la fiche du chevalier n'en fournit pas, l'écran des
 * semestres oui. Les lignes absentes disparaissent du message plutôt que de
 * s'afficher vides.
 */
export interface WhatsAppTarget {
  student: AlertStudent;
  parent?: AlertParent | null;
  detail?: SituationDetail;
}

export function WhatsAppMessageModal({
  onClose,
  targets,
  title,
  origin,
}: {
  onClose: () => void;
  targets: WhatsAppTarget[];
  title?: string;
  /** d'où part le message — journalisé, pour retrouver l'origine d'un envoi */
  origin?: string;
}) {
  const school = useData((s) => s.school);
  const language = useSettings((s) => s.language);
  const { addToast } = useToast();

  const bulk = targets.length > 1;

  /** Qui est joignable, et qui ne l'est pas. Résolu une fois. */
  const rows = useMemo(
    () =>
      targets.map((t) => ({
        target: t,
        key: t.student.id ?? `${t.student.firstName}-${t.student.lastName}`,
        name: `${t.student.firstName} ${t.student.lastName}`.trim(),
        recipients: recipientsFor(t.student, t.parent),
        reason: unreachableReason(t.student, t.parent),
      })),
    [targets],
  );

  const reachable = rows.filter((r) => r.recipients.length > 0);
  const unreachable = rows.filter((r) => r.recipients.length === 0);

  const initialTemplate: WhatsAppTemplateId = bulk
    ? "situation"
    : suggestTemplate(targets[0]?.student ?? { remainingSeances: 0, debt: 0 });
  const initialLang: MessageLanguage = language === "ar" ? "ar" : "fr";

  const [templateId, setTemplateId] = useState<WhatsAppTemplateId>(initialTemplate);
  const [lang, setLang] = useState<MessageLanguage>(initialLang);
  const [selectedStudents, setSelectedStudents] = useState<string[]>(
    reachable.map((r) => r.key),
  );
  /** En envoi UNITAIRE, les destinataires se cochent un par un. */
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>(
    reachable[0]?.recipients.map((r) => r.key) ?? [],
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[] | null>(null);

  /**
   * LE TEXTE COMPOSÉ POUR UN DESTINATAIRE PRÉCIS.
   *
   * Il est recomposé pour CHACUN : la formule d'adresse d'un parent n'est pas
   * celle d'un chevalier, et un message qui commence par « cher parent » envoyé
   * au chevalier lui-même se remarque tout de suite.
   */
  const compose = (
    row: (typeof rows)[number],
    audience: "student" | "parent",
    id: WhatsAppTemplateId,
    l: MessageLanguage,
  ): string =>
    getTemplate(id).build(
      contextFor({
        student: row.target.student,
        school: { name: school?.name, phone: school?.phone },
        audience,
        detail: row.target.detail,
      }),
      l,
    );

  /** Le message libre, partagé par tous — avec ses jetons. */
  const [freeText, setFreeText] = useState(
    () =>
      initialLang === "ar"
        ? `السلام عليكم،\n\n\n\n${school?.name ?? "النادي"}`
        : `Bonjour,\n\n\n\n${school?.name ?? "Le club"}`,
  );
  /** Le texte du modèle en envoi UNITAIRE, modifiable avant de partir. */
  const [singleText, setSingleText] = useState(() =>
    reachable[0] ? compose(reachable[0], reachable[0].recipients[0]?.role ?? "student", initialTemplate, initialLang) : "",
  );

  const isCustom = templateId === "custom";

  const selectTemplate = (id: WhatsAppTemplateId) => {
    setTemplateId(id);
    if (!bulk && id !== "custom" && reachable[0]) {
      setSingleText(compose(reachable[0], reachable[0].recipients[0]?.role ?? "student", id, lang));
    }
  };

  const selectLang = (next: MessageLanguage) => {
    setLang(next);
    if (!bulk && templateId !== "custom" && reachable[0]) {
      setSingleText(compose(reachable[0], reachable[0].recipients[0]?.role ?? "student", templateId, next));
    }
  };

  /**
   * TOUT CE QUI VA PARTIR, destinataire par destinataire.
   *
   * C'est la MÊME fonction qui alimente l'aperçu et l'envoi : impossible
   * d'envoyer autre chose que ce qui a été montré.
   */
  const buildOutgoing = (): OutgoingRecipient[] => {
    const out: OutgoingRecipient[] = [];
    for (const row of reachable) {
      if (bulk && !selectedStudents.includes(row.key)) continue;
      for (const r of row.recipients) {
        if (!bulk && !selectedRecipients.includes(r.key)) continue;
        const text = isCustom
          ? fillTokens(freeText, {
              chevalier: row.name,
              parent: row.target.parent
                ? `${row.target.parent.firstName} ${row.target.parent.lastName}`.trim()
                : "",
              club: school?.name ?? "",
              dette: formatDA(row.target.student.debt),
              seances: row.target.student.remainingSeances,
              groupe: row.target.detail?.groupName ?? "",
              categorie: row.target.detail?.categoryName ?? "",
              semestre: row.target.detail?.semesterName ?? "",
            })
          : bulk
            ? compose(row, r.role, templateId, lang)
            : singleText;
        out.push({
          phone: r.phone,
          name: r.name,
          text,
          studentId: r.studentId,
          parentId: r.parentId,
          origin,
        });
      }
    }
    return out;
  };

  const outgoing = buildOutgoing();

  const handleSend = async () => {
    if (outgoing.length === 0) return;
    setSending(true);
    setResults(null);
    try {
      const res = await sendMessages(outgoing);
      setResults(res.results);
      // TROIS ISSUES, JAMAIS CONFONDUES.
      if (res.sent > 0 && res.queued === 0 && res.failed === 0) {
        addToast({
          type: "success",
          title: "Messages envoyés",
          message: `${res.sent} message(s) remis à la passerelle.`,
        });
      } else if (res.queued > 0) {
        addToast({
          type: "warning",
          title: "Messages en attente",
          message: `${res.queued} message(s) attendent : la passerelle n'était pas joignable. Ils repartiront tout seuls dès que le poste sera allumé.`,
        });
      } else {
        addToast({
          type: "danger",
          title: "Envoi refusé",
          message: `${res.failed} message(s) n'ont pas pu partir.`,
        });
      }
    } catch (err) {
      addToast({
        type: "danger",
        title: "Envoi impossible",
        message: err instanceof Error ? err.message : "La passerelle n'a pas répondu.",
      });
    } finally {
      setSending(false);
    }
  };

  const tooLong = isCustom && freeText.length > MAX_MESSAGE_LENGTH;

  return (
    <Modal
      open
      onClose={onClose}
      title={title ?? (bulk ? "Envoyer un message à plusieurs chevaliers" : "Envoyer un message WhatsApp")}
      wide
    >
      <div className="space-y-5">
        {/* ---- L'ALERTE : personne n'est joignable ---- */}
        {unreachable.length > 0 && (
          <div className="space-y-1.5 rounded-xl border border-danger/35 bg-danger/10 p-3">
            <p className="flex items-center gap-2 text-xs font-bold text-danger">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {unreachable.length} chevalier(s) ne peuvent pas être joints
            </p>
            <ul className="space-y-0.5 ps-6 text-[11px] leading-relaxed text-danger">
              {unreachable.map((r) => (
                <li key={r.key} className="list-disc">
                  {r.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {reachable.length === 0 ? (
          <p className="py-6 text-center text-xs italic text-muted">
            Aucun destinataire joignable : rien ne peut partir.
          </p>
        ) : (
          <>
            {/* ---- Les destinataires ---- */}
            {bulk ? (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted">
                    Chevaliers concernés ({selectedStudents.length}/{reachable.length})
                  </label>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedStudents(reachable.map((r) => r.key))}
                    >
                      Tout cocher
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedStudents([])}>
                      Tout décocher
                    </Button>
                  </div>
                </div>
                <div className="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-line p-1.5">
                  {reachable.map((row) => {
                    const checked = selectedStudents.includes(row.key);
                    const open = expanded === row.key;
                    return (
                      <div key={row.key} className="rounded-lg border border-line/70">
                        <div
                          className={`flex items-center justify-between gap-2 p-2 transition-colors ${
                            checked ? "bg-primary/8" : ""
                          }`}
                        >
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setSelectedStudents((prev) =>
                                  prev.includes(row.key)
                                    ? prev.filter((x) => x !== row.key)
                                    : [...prev, row.key],
                                )
                              }
                              className="h-4 w-4 shrink-0 rounded border-line bg-surface text-primary focus:ring-primary"
                            />
                            <span className="min-w-0">
                              <strong className="block truncate text-xs text-ink">{row.name}</strong>
                              <span className="block truncate text-[10px] text-muted">
                                {row.recipients.map((r) => `${r.name} · ${normalizePhone(r.phone)?.display ?? r.phone}`).join("  |  ")}
                              </span>
                            </span>
                          </label>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {row.target.student.debt > 0 && (
                              <Badge tone="danger" className="text-[9px]">
                                {formatDA(row.target.student.debt)}
                              </Badge>
                            )}
                            <button
                              type="button"
                              onClick={() => setExpanded(open ? null : row.key)}
                              className="rounded-md p-1 text-muted transition-colors hover:bg-primary-50 hover:text-ink"
                              aria-label={`Aperçu du message de ${row.name}`}
                            >
                              {open ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </div>
                        {/* ON NE PROPOSE JAMAIS D'ENVOYER SANS AVOIR MONTRÉ LE
                            TEXTE : voici CELUI de ce chevalier, pas un exemple. */}
                        {open && (
                          <pre
                            dir={lang === "ar" ? "rtl" : "ltr"}
                            className="max-h-56 overflow-y-auto whitespace-pre-wrap border-t border-line bg-canvas/50 p-2.5 text-[11px] leading-relaxed text-ink"
                          >
                            {isCustom
                              ? fillTokens(freeText, {
                                  chevalier: row.name,
                                  club: school?.name ?? "",
                                  dette: formatDA(row.target.student.debt),
                                })
                              : compose(row, row.recipients[0]?.role ?? "student", templateId, lang)}
                          </pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted">
                  Destinataires — le chevalier ET son parent reçoivent le message en même temps
                </label>
                <div className="space-y-1.5">
                  {reachable[0].recipients.map((r) => {
                    const checked = selectedRecipients.includes(r.key);
                    const normalized = normalizePhone(r.phone);
                    return (
                      <label
                        key={r.key}
                        className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-2.5 transition-colors ${
                          checked ? "border-primary/30 bg-primary/10" : "border-line hover:bg-primary-50/40"
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setSelectedRecipients((prev) =>
                                prev.includes(r.key)
                                  ? prev.filter((x) => x !== r.key)
                                  : [...prev, r.key],
                              )
                            }
                            className="h-4 w-4 rounded border-line bg-surface text-primary focus:ring-primary"
                          />
                          <div className="min-w-0">
                            <strong className="block truncate text-xs text-ink">{r.name}</strong>
                            <span className="block truncate text-[10px] text-muted">
                              {normalized?.display ?? r.phone}
                            </span>
                          </div>
                        </div>
                        <Badge tone="neutral" className="shrink-0 text-[9px]">
                          {r.role === "parent" ? "Parent" : "Chevalier"}
                        </Badge>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ---- Le modèle ---- */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">
                Contenu du message
              </label>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {WHATSAPP_TEMPLATES.map((t) => {
                  const active = templateId === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => selectTemplate(t.id)}
                      className={`rounded-xl border p-2.5 text-start transition-colors ${
                        active ? "border-primary/40 bg-primary/10" : "border-line hover:bg-primary-50/40"
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-xs font-bold text-ink">
                        {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                        {t.labelFr}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-muted">
                        {t.hintFr}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ---- La langue et le texte ---- */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-semibold text-muted">
                  {isCustom ? "Votre message" : bulk ? "Aperçu — chaque chevalier reçoit le sien" : "Message"}
                </label>
                <div className="flex items-center gap-1 rounded-lg border border-line p-0.5">
                  {(["fr", "ar"] as MessageLanguage[]).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => selectLang(l)}
                      className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition-colors ${
                        lang === l ? "bg-primary text-white" : "text-muted hover:text-ink"
                      }`}
                    >
                      {l === "fr" ? "Français" : "العربية"}
                    </button>
                  ))}
                </div>
              </div>

              {isCustom || !bulk ? (
                <textarea
                  value={isCustom ? freeText : singleText}
                  onChange={(e) => (isCustom ? setFreeText(e.target.value) : setSingleText(e.target.value))}
                  rows={10}
                  dir={lang === "ar" ? "rtl" : "ltr"}
                  placeholder="Saisissez votre message…"
                  className="w-full rounded-xl border border-line bg-surface p-3 text-sm leading-relaxed text-ink outline-none focus:border-primary"
                />
              ) : (
                <pre
                  dir={lang === "ar" ? "rtl" : "ltr"}
                  className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-line bg-canvas/40 p-3 text-[11px] leading-relaxed text-ink"
                >
                  {reachable[0]
                    ? compose(reachable[0], reachable[0].recipients[0]?.role ?? "student", templateId, lang)
                    : ""}
                </pre>
              )}

              <div className="mt-1 flex flex-wrap justify-between gap-2 text-[10px]">
                <span className="text-muted">
                  {isCustom ? (
                    <>
                      Jetons disponibles : <code>{"{chevalier}"}</code> <code>{"{parent}"}</code>{" "}
                      <code>{"{club}"}</code> <code>{"{dette}"}</code> <code>{"{seances}"}</code>{" "}
                      <code>{"{groupe}"}</code> <code>{"{categorie}"}</code>{" "}
                      <code>{"{semestre}"}</code> — un jeton inconnu reste tel quel.
                    </>
                  ) : bulk ? (
                    "Chaque chevalier reçoit un message composé avec SA situation. Dépliez une ligne ci-dessus pour lire le sien."
                  ) : (
                    "Le texte est modifiable avant l'envoi. Il part tel qu'il s'affiche ici."
                  )}
                </span>
                {isCustom && (
                  <span className={tooLong ? "shrink-0 font-bold text-danger" : "shrink-0 text-muted"}>
                    {freeText.length} / {MAX_MESSAGE_LENGTH}
                  </span>
                )}
              </div>
            </div>

            {/* ---- Le compte rendu ---- */}
            {results && (
              <div className="max-h-52 space-y-1.5 overflow-y-auto">
                {results.map((r, i) => {
                  const queued = r.status === "queued";
                  const ok = r.status === "sent" || r.status === "delivered" || r.status === "read";
                  return (
                    <div
                      key={`${r.phone}-${i}`}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                        ok
                          ? "border-success/30 bg-success/10"
                          : queued
                            ? "border-warning/35 bg-warning/10"
                            : "border-danger/30 bg-danger/10"
                      }`}
                    >
                      <span className="truncate text-ink">
                        {r.name} — {r.phone}
                      </span>
                      <span
                        className={`flex shrink-0 items-center gap-1 font-semibold ${
                          ok ? "text-success" : queued ? "text-warning" : "text-danger"
                        }`}
                      >
                        {ok ? (
                          <>
                            <Check className="h-3.5 w-3.5" /> Envoyé
                          </>
                        ) : queued ? (
                          <>
                            <Clock className="h-3.5 w-3.5" /> En attente
                          </>
                        ) : (
                          <>
                            <X className="h-3.5 w-3.5" /> {r.error ?? "Échec"}
                          </>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <span className="flex items-center gap-1.5 text-[10px] text-muted">
            {bulk ? <Users className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
            {outgoing.length} message{outgoing.length > 1 ? "s" : ""} à envoyer
            {outgoing.length > 1 && " — 3 à 7 s entre chacun, pour protéger le numéro du club"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={sending}>
              Fermer
            </Button>
            <Button
              onClick={() => void handleSend()}
              disabled={sending || outgoing.length === 0 || tooLong}
              className="gap-2"
            >
              <Send className="h-4 w-4" />
              {sending ? "Envoi en cours…" : "Envoyer"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
