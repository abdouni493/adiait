"use client";

/**
 * LA GESTION DU SITE PUBLIC — tout ce que la vitrine montre, réglé d'ici.
 *
 * Un seul écran, trois quartiers, parce que c'est ainsi qu'on pense au site :
 *
 *   FORMATIONS & ÉVÈNEMENTS — ce qu'on publie, ce qu'on retire, ce qu'on
 *                             partage. La liste est la vitrine elle-même, vue
 *                             de derrière ;
 *   COORDONNÉES             — par où le public joint le club : les réseaux, le
 *                             plan, les deux numéros ;
 *   HABILLAGE               — le favicon, les deux présentations, l'image de
 *                             fond et la vidéo de la page d'accueil.
 *
 * OÙ TOUT CELA EST RANGÉ. Les formations ont leur table (`website_formations`),
 * lisible SANS COMPTE. Les coordonnées et l'habillage, eux, tiennent sur la
 * FICHE DE L'ÉTABLISSEMENT : c'est la seule ligne que le schéma laisse déjà lire
 * à un visiteur anonyme, et s'en servir évite d'ouvrir une table de plus au
 * dehors pour y ranger huit liens.
 */

import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  Edit,
  ExternalLink,
  Eye,
  EyeOff,
  Film,
  Ghost,
  Globe,
  ImageIcon,
  Link2,
  MapPin,
  Megaphone,
  MessageCircle,
  Phone,
  Plus,
  Save,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, SearchInput } from "@/components/ui/SearchInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { AccessDenied } from "@/components/layout/AccessDenied";
import { FormationDeleteModal, FormationFormModal } from "@/components/website/FormationFormModal";
import { FacebookMark, InstagramMark, TiktokMark } from "@/components/website/BrandIcons";
import { FormationDetailsModal } from "@/components/website/FormationDetailsModal";
import { useData } from "@/lib/store/data";
import { useToast } from "@/lib/store/toast";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/usePermissions";
import { uploadImage } from "@/lib/accounts/uploadImage";
import { todayIso } from "@/lib/helpers";
import { formatDA } from "@/lib/utils";
import { formationStatus, periodLabel } from "@/lib/site/formations";
import { formationUrl } from "@/lib/site/public";
import type { Formation } from "@/lib/types";

type Section = "formations" | "contacts" | "appearance";

const STATUS_TONE = { upcoming: "primary", running: "success", past: "neutral" } as const;
const STATUS_LABEL = { upcoming: "À venir", running: "En cours", past: "Terminée" } as const;

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const { tr } = useT();
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-muted">{tr(label)}</label>
      {children}
      {hint && <p className="mt-1 text-[10px] leading-relaxed text-muted">{tr(hint)}</p>}
    </div>
  );
}

export function WebsitePage() {
  const { tr } = useT();
  const can = useCan("website");
  const { addToast } = useToast();

  const formations = useData((s) => s.formations);
  const formationEnrollments = useData((s) => s.formationEnrollments);
  const updateItem = useData((s) => s.updateItem);
  const loaded = useData((s) => s.loaded);

  const [section, setSection] = useState<Section>("formations");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Formation | null>(null);
  const [viewing, setViewing] = useState<Formation | null>(null);
  const [deleting, setDeleting] = useState<Formation | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const today = todayIso();

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return formations
      .filter((f) =>
        !q
          ? true
          : `${f.name} ${f.description} ${f.trainerName ?? ""}`.toLowerCase().includes(q),
      )
      .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
  }, [formations, search]);

  const published = formations.filter((f) => !f.hidden).length;
  const upcoming = formations.filter((f) => formationStatus(f, today) !== "past").length;

  /**
   * COPIER LE LIEN D'UNE FORMATION.
   *
   * Le lien est ABSOLU : il part par message, par courriel, sur un groupe — il
   * doit pouvoir être cliqué de n'importe où. `navigator.clipboard` n'existe pas
   * partout (vieux navigateur, page servie sans HTTPS) : on retombe alors sur la
   * vieille méthode, plutôt que de laisser le bouton ne rien faire.
   */
  const copyLink = async (formation: Formation) => {
    const url = formationUrl(formation.id);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const field = document.createElement("textarea");
        field.value = url;
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        document.execCommand("copy");
        document.body.removeChild(field);
      }
      setCopied(formation.id);
      setTimeout(() => setCopied((c) => (c === formation.id ? null : c)), 2500);
      addToast({ type: "success", title: "Lien copié", message: url });
    } catch {
      addToast({
        type: "warning",
        title: "Copie impossible",
        message: url,
      });
    }
  };

  const toggleHidden = (formation: Formation) => {
    updateItem("formations", formation.id, { hidden: !formation.hidden });
    addToast({
      type: "success",
      title: formation.hidden ? "Formation réaffichée" : "Formation masquée",
      message: formation.hidden
        ? `${formation.name} est de nouveau visible sur le site.`
        : `${formation.name} n'apparaît plus sur le site — rien n'est perdu.`,
    });
  };

  const sections: { id: Section; label: string; icon: React.ComponentType<{ className?: string }> }[] =
    [
      { id: "formations", label: "Formations & évènements", icon: Megaphone },
      { id: "contacts", label: "Coordonnées", icon: Phone },
      { id: "appearance", label: "Habillage du site", icon: ImageIcon },
    ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <PageHeader
          icon={Globe}
          title="Site web"
          subtitle="La vitrine du club : ce qu'elle publie, comment on la joint, et de quoi elle a l'air"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => window.open("/site", "_blank", "noopener")}
          >
            <ExternalLink className="h-4 w-4 text-primary" /> Voir le site
          </Button>
          {section === "formations" && can("create") && (
            <Button className="gap-2" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Publier une formation
            </Button>
          )}
        </div>
      </div>

      {/* ---- LES TROIS QUARTIERS DE L'ÉCRAN --------------------------- */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-canvas p-1">
        {sections.map((s) => {
          const on = section === s.id;
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                on ? "bg-gradient-primary text-white" : "text-muted hover:text-ink"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tr(s.label)}
            </button>
          );
        })}
      </div>

      {section === "formations" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Megaphone} label="Publiées sur le site" value={published} index={0} />
            <StatCard
              icon={Globe}
              label="À venir ou en cours"
              value={upcoming}
              tone="accent"
              index={1}
            />
            <StatCard
              icon={Users}
              label="Inscrits, toutes formations"
              value={formationEnrollments.length}
              tone="success"
              index={2}
            />
            <StatCard
              icon={EyeOff}
              label="Masquées"
              value={formations.length - published}
              tone="warning"
              index={3}
            />
          </div>

          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Chercher une formation, un évènement, un encadrant…"
          />

          {rows.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              message="Aucune formation publiée"
              hint="Publiez une formation ou un évènement : il apparaîtra aussitôt sur le site du club, avec son calendrier, son encadrant et son bouton d'inscription."
              action={
                can("create") ? (
                  <Button className="gap-2" onClick={() => setCreating(true)}>
                    <Plus className="h-4 w-4" /> Publier une formation
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {rows.map((f) => {
                const status = formationStatus(f, today);
                const enrolled = formationEnrollments.filter(
                  (e) => e.formationId === f.id,
                ).length;
                return (
                  <Card key={f.id} className="overflow-hidden">
                    <div className="relative h-36 w-full bg-primary-50">
                      {f.images[0] ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={f.images[0]}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Megaphone className="h-10 w-10 text-accent-ink opacity-30" />
                        </div>
                      )}
                      <div className="absolute end-2 top-2 flex flex-wrap justify-end gap-1">
                        <Badge
                          tone={f.kind === "event" ? "accent" : "primary"}
                          className="text-[9px]"
                        >
                          {tr(f.kind === "event" ? "Évènement" : "Formation")}
                        </Badge>
                        <Badge tone={STATUS_TONE[status]} className="text-[9px]">
                          {tr(STATUS_LABEL[status])}
                        </Badge>
                        {f.hidden && (
                          <Badge tone="warning" className="text-[9px]">
                            <EyeOff className="h-3 w-3" /> {tr("Masquée")}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <CardBody className="space-y-2 p-4">
                      <h3 className="font-display truncate text-sm font-bold text-ink" title={f.name}>
                        {f.name}
                      </h3>
                      <p className="line-clamp-2 min-h-8 text-[11px] leading-relaxed text-muted">
                        {f.description || tr("Aucune description.")}
                      </p>

                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted">
                        <span>{periodLabel(f)}</span>
                        {f.trainerName && <span>· {f.trainerName}</span>}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
                        <Badge tone="accent" className="text-[9px]">
                          {f.price > 0 ? formatDA(f.price) : tr("Offerte")}
                        </Badge>
                        {f.seances > 0 && (
                          <Badge tone="neutral" className="text-[9px]">
                            {f.seances} {tr("séance(s)")}
                          </Badge>
                        )}
                        <Badge
                          tone={enrolled > 0 ? "success" : "neutral"}
                          className="text-[9px]"
                        >
                          <Users className="h-3 w-3" /> {enrolled}
                        </Badge>
                      </div>

                      {/* ---- LES CINQ ACTIONS ---- */}
                      <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
                        {can("view") && (
                          <button
                            onClick={() => setViewing(f)}
                            className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface py-2 font-semibold text-ink transition-colors hover:bg-primary-50"
                          >
                            <Eye className="h-3.5 w-3.5" /> {tr("Détails")}
                          </button>
                        )}
                        {can("edit") && (
                          <button
                            onClick={() => setEditing(f)}
                            className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface py-2 font-semibold text-ink transition-colors hover:bg-primary-50"
                          >
                            <Edit className="h-3.5 w-3.5" /> {tr("Modifier")}
                          </button>
                        )}
                        {can("hide") && (
                          <button
                            onClick={() => toggleHidden(f)}
                            title={tr(
                              f.hidden
                                ? "La remettre sur le site"
                                : "La retirer du site sans la supprimer",
                            )}
                            className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface py-2 font-semibold text-ink transition-colors hover:bg-primary-50"
                          >
                            {f.hidden ? (
                              <>
                                <Eye className="h-3.5 w-3.5" /> {tr("Afficher")}
                              </>
                            ) : (
                              <>
                                <EyeOff className="h-3.5 w-3.5" /> {tr("Masquer")}
                              </>
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => void copyLink(f)}
                          title={tr("Copier le lien public de cette formation")}
                          className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface py-2 font-semibold text-ink transition-colors hover:bg-primary-50"
                        >
                          {copied === f.id ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-success" /> {tr("Copié")}
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" /> {tr("Copier le lien")}
                            </>
                          )}
                        </button>
                        {can("delete") && (
                          <button
                            onClick={() => setDeleting(f)}
                            className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl border border-danger/30 bg-danger/5 py-2 font-semibold text-danger transition-colors hover:bg-danger/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> {tr("Supprimer")}
                          </button>
                        )}
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/*
        LES DEUX PANNEAUX N'EXISTENT QU'UNE FOIS LA FICHE DU CLUB LUE.

        Ils recopient la fiche dans des champs de saisie. Montés AVANT sa
        lecture — qui se fait au chargement, après la connexion — ils
        recopieraient des chaînes vides et n'auraient plus jamais l'occasion de
        se recaler : la première sauvegarde effacerait alors la vitrine entière
        avec des champs vides. Attendre est ici la seule façon d'être juste, et
        l'attente ne dure que le temps d'un aller-retour.
      */}
      {section === "contacts" &&
        (!can("contacts") ? (
          <AccessDenied />
        ) : loaded ? (
          <ContactsPanel />
        ) : (
          <SectionLoading />
        ))}

      {section === "appearance" &&
        (!can("appearance") ? (
          <AccessDenied />
        ) : loaded ? (
          <AppearancePanel />
        ) : (
          <SectionLoading />
        ))}

      {creating && <FormationFormModal onClose={() => setCreating(false)} />}
      {editing && (
        <FormationFormModal formation={editing} onClose={() => setEditing(null)} />
      )}
      {viewing && (
        <FormationDetailsModal formation={viewing} onClose={() => setViewing(null)} />
      )}
      {deleting && (
        <FormationDeleteModal formation={deleting} onClose={() => setDeleting(null)} />
      )}
    </div>
  );
}

/** L'attente d'un aller-retour — voir le commentaire ci-dessus. */
function SectionLoading() {
  const { tr } = useT();
  return (
    <Card>
      <CardBody className="py-16 text-center text-sm text-muted">{tr("Chargement…")}</CardBody>
    </Card>
  );
}

// ===========================================================================
//  2. LES COORDONNÉES — par où le public joint le club
// ===========================================================================

/**
 * Les réseaux, le plan et les deux numéros.
 *
 * Ils sont VOLONTAIREMENT distincts du téléphone et de l'adresse des
 * Paramètres : ceux-là sont ceux de l'administration — le fixe du bureau, le
 * siège fiscal — et ne sont pas toujours ce qu'on donne au public.
 */
function ContactsPanel() {
  const { tr } = useT();
  const school = useData((s) => s.school);
  const updateSchool = useData((s) => s.updateSchool);
  const { addToast } = useToast();

  // Le panneau n'est monté qu'une fois la fiche lue (voir `WebsitePage`) : ces
  // valeurs de départ sont donc les VRAIES, et aucun recalage n'est nécessaire.
  const [form, setForm] = useState({
    siteFacebook: school.siteFacebook ?? "",
    siteInstagram: school.siteInstagram ?? "",
    siteTiktok: school.siteTiktok ?? "",
    siteSnapchat: school.siteSnapchat ?? "",
    siteWhatsapp: school.siteWhatsapp ?? "",
    siteMapsUrl: school.siteMapsUrl ?? "",
    sitePhone: school.sitePhone ?? "",
    sitePhone2: school.sitePhone2 ?? "",
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const save = () => {
    updateSchool(form);
    addToast({
      type: "success",
      title: "Coordonnées enregistrées",
      message: "Le site les affiche déjà sur sa page « Nous contacter ».",
    });
  };

  const lines: {
    key: keyof typeof form;
    label: string;
    hint: string;
    placeholder: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      key: "siteFacebook",
      label: "Facebook",
      hint: "L'adresse complète de la page du club.",
      placeholder: "https://facebook.com/…",
      icon: FacebookMark,
    },
    {
      key: "siteInstagram",
      label: "Instagram",
      hint: "L'adresse du compte, ou le nom d'utilisateur.",
      placeholder: "https://instagram.com/…",
      icon: InstagramMark,
    },
    {
      key: "siteTiktok",
      label: "TikTok",
      hint: "L'adresse du compte.",
      placeholder: "https://tiktok.com/@…",
      icon: TiktokMark,
    },
    {
      key: "siteSnapchat",
      label: "Snapchat",
      hint: "L'adresse du compte, ou le pseudonyme.",
      placeholder: "https://snapchat.com/add/…",
      icon: Ghost,
    },
    {
      key: "siteWhatsapp",
      label: "WhatsApp",
      hint: "Le numéro au format international — le site en fera un lien de conversation.",
      placeholder: "+213 555 12 34 56",
      icon: MessageCircle,
    },
    {
      key: "siteMapsUrl",
      label: "Lien Google Maps",
      hint: "Le plan que le bouton « Nous trouver » ouvrira.",
      placeholder: "https://maps.google.com/…",
      icon: MapPin,
    },
    {
      key: "sitePhone",
      label: "Téléphone",
      hint: "Le numéro que le public appelle.",
      placeholder: "0555 12 34 56",
      icon: Phone,
    },
    {
      key: "sitePhone2",
      label: "Second téléphone",
      hint: "Un second numéro, quand il y en a un.",
      placeholder: "0661 98 76 54",
      icon: Phone,
    },
  ];

  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <h2 className="font-display text-base font-bold text-ink">{tr("Coordonnées")}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {tr("Ce que le site publie sur sa page « Nous contacter », et dans le bas de chacune de ses pages. Un champ laissé vide n'affiche simplement rien — aucun lien mort.")}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {lines.map(({ key, label, hint, placeholder, icon: Icon }) => (
            <Field key={key} label={label} hint={hint}>
              <div className="relative">
                <Icon className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input
                  value={form[key]}
                  onChange={set(key)}
                  placeholder={placeholder}
                  className="ps-9"
                />
              </div>
            </Field>
          ))}
        </div>

        <div className="flex justify-end border-t border-line pt-4">
          <Button className="gap-2" onClick={save}>
            <Save className="h-4 w-4" /> Enregistrer les coordonnées
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

// ===========================================================================
//  3. L'HABILLAGE — de quoi la page d'accueil a l'air
// ===========================================================================

function AppearancePanel() {
  const { tr } = useT();
  const school = useData((s) => s.school);
  const updateSchool = useData((s) => s.updateSchool);
  const { addToast } = useToast();

  // Comme pour les coordonnées : monté après la lecture, donc initialisé juste.
  const [favicon, setFavicon] = useState(school.siteFavicon ?? "");
  const [description, setDescription] = useState(school.siteDescription ?? "");
  const [description2, setDescription2] = useState(school.siteDescription2 ?? "");
  const [heroImage, setHeroImage] = useState(school.siteHeroImage ?? "");
  const [videoUrl, setVideoUrl] = useState(school.siteVideoUrl ?? "");
  const [uploading, setUploading] = useState<"favicon" | "hero" | null>(null);

  const upload = async (slot: "favicon" | "hero", file?: File) => {
    if (!file) return;
    setUploading(slot);
    try {
      const url = await uploadImage("logos", file);
      if (slot === "favicon") setFavicon(url);
      else setHeroImage(url);
    } catch (err) {
      addToast({
        type: "danger",
        title: "Image refusée",
        message: err instanceof Error ? err.message : "L'envoi de l'image a échoué.",
      });
    } finally {
      setUploading(null);
    }
  };

  const save = () => {
    updateSchool({
      siteFavicon: favicon,
      siteDescription: description,
      siteDescription2: description2,
      siteHeroImage: heroImage,
      siteVideoUrl: videoUrl,
    });
    addToast({
      type: "success",
      title: "Habillage enregistré",
      message: "La page d'accueil du site vient de changer.",
    });
  };

  return (
    <Card>
      <CardBody className="space-y-5">
        <div>
          <h2 className="font-display text-base font-bold text-ink">{tr("Habillage du site")}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {tr("L'icône de l'onglet, les deux textes de présentation, la photographie de fond et la vidéo de la page d'accueil. Tout est facultatif : ce qui manque laisse simplement place au blason et au nom du club.")}
          </p>
        </div>

        {/* ---- LE FAVICON ---- */}
        <div className="space-y-2 rounded-2xl border border-line bg-canvas/40 p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
            🔖 {tr("L'icône de l'onglet (favicon)")}
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface">
              {favicon ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={favicon} alt="" className="h-full w-full object-cover" />
              ) : (
                <Globe className="h-6 w-6 text-muted" />
              )}
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-primary-50">
              <Upload className="h-4 w-4" />
              {tr(uploading === "favicon" ? "Envoi…" : "Importer une icône")}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading !== null}
                onChange={(e) => {
                  void upload("favicon", e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {favicon && (
              <Button variant="ghost" className="gap-1.5 text-danger" onClick={() => setFavicon("")}>
                <Trash2 className="h-4 w-4" /> Retirer
              </Button>
            )}
          </div>
          <p className="text-[10px] leading-relaxed text-muted">
            {tr("Une image carrée, la plus simple possible : elle sera lue à seize pixels de côté. Sans icône, le site reprend le blason du club.")}
          </p>
        </div>

        {/* ---- LES DEUX PRÉSENTATIONS ---- */}
        <div className="space-y-3 rounded-2xl border border-line bg-canvas/40 p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
            ✍️ {tr("Les présentations du club")}
          </span>
          <Field
            label="Présentation principale"
            hint="Les deux ou trois phrases qui s'affichent sous le nom du club, sur l'image d'accueil. C'est ce qu'un visiteur lit en premier."
          >
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={tr("Un club de chevalerie qui forme au sabre, à l'épée et à la discipline, de 8 à 60 ans.")}
              className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-primary"
            />
          </Field>
          <Field
            label="Seconde présentation"
            hint="Le texte plus long, affiché en dessous : l'histoire du club, ses valeurs, ce qui s'y passe une semaine ordinaire."
          >
            <textarea
              value={description2}
              onChange={(e) => setDescription2(e.target.value)}
              rows={5}
              placeholder={tr("Fondé en 2016, le club accueille aujourd'hui plus de deux cents chevaliers…")}
              className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-primary"
            />
          </Field>
        </div>

        {/* ---- LE FOND ET LA VIDÉO ---- */}
        <div className="space-y-3 rounded-2xl border border-line bg-canvas/40 p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
            🎬 {tr("L'image de fond et la vidéo")}
          </span>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-muted">
              {tr("Photographie de fond de la page d'accueil")}
            </label>
            <div className="relative h-40 w-full overflow-hidden rounded-xl border border-line bg-primary-50">
              {heroImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={heroImage} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-accent-ink opacity-30" />
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-primary-50">
                <Upload className="h-4 w-4" />
                {tr(uploading === "hero" ? "Envoi…" : "Importer une image")}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading !== null}
                  onChange={(e) => {
                    void upload("hero", e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {heroImage && (
                <Button
                  variant="ghost"
                  className="gap-1.5 text-danger"
                  onClick={() => setHeroImage("")}
                >
                  <Trash2 className="h-4 w-4" /> Retirer l&apos;image
                </Button>
              )}
            </div>
          </div>

          <Field
            label="Vidéo de la page d'accueil"
            hint="L'adresse d'un fichier vidéo (MP4) ou d'une vidéo YouTube. Le site la joue dans un cadre sous la présentation ; sans adresse, il n'affiche pas de cadre du tout."
          >
            <div className="relative">
              <Film className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                className="ps-9"
              />
            </div>
          </Field>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => window.open("/site", "_blank", "noopener")}
          >
            <Link2 className="h-4 w-4" /> Voir le résultat
          </Button>
          <Button className="gap-2" onClick={save}>
            <Save className="h-4 w-4" /> Enregistrer l&apos;habillage
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
