"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/store/session";
import { ClassesPage } from "@/components/pages/ClassesPage";
import { SemestersPage } from "@/components/pages/SemestersPage";
import { PlannerPage } from "@/components/pages/PlannerPage";
import { StudentsPage } from "@/components/pages/StudentsPage";
import { AttendancePage } from "@/components/pages/AttendancePage";
import { TeachersPage } from "@/components/pages/TeachersPage";
import { AdministrationPage } from "@/components/pages/AdministrationPage";
import { IndependentPage } from "@/components/pages/IndependentPage";
import { ParentsPage } from "@/components/pages/ParentsPage";
import { AnnouncementsPage } from "@/components/pages/AnnouncementsPage";
import { ExpensesPage } from "@/components/pages/ExpensesPage";
import { AnalyticsPage } from "@/components/pages/AnalyticsPage";
import { CashPage } from "@/components/pages/CashPage";
import { SecondaryCashPage } from "@/components/pages/SecondaryCashPage";
import { HorseTradePage } from "@/components/pages/HorseTradePage";
import { StablePage } from "@/components/pages/StablePage";
import { StableReportsPage } from "@/components/pages/StableReportsPage";
import { OtherDebtsPage } from "@/components/pages/OtherDebtsPage";
import { ReportsPage } from "@/components/pages/ReportsPage";
import { SettingsPage } from "@/components/pages/SettingsPage";
import { WebsitePage } from "@/components/pages/WebsitePage";
import { WebsiteInscriptionsPage } from "@/components/pages/WebsiteInscriptionsPage";
import { StudentPages } from "@/components/pages/StudentPages";
import { TeacherPages } from "@/components/pages/TeacherPages";
import { ParentPages } from "@/components/pages/ParentPages";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";
import { AccessDenied } from "@/components/layout/AccessDenied";
import { useAccessRights } from "@/lib/usePermissions";
import { canSeePage } from "@/lib/permissions";

/** Client-side role+slug dispatch for every module route. Kept separate from
 *  the route file so the page itself can stay a server component and export
 *  `generateStaticParams` (prerendered shells -> instant sidebar navigation). */
/** Les adresses d'écrans supprimés — voir `RetiredModule`. */
const RETIRED_SLUGS = new Set(["subjects", "subscriptions"]);

/** Ce qu'on affiche à qui arrive sur l'adresse d'un écran retiré. */
function RetiredModule({ slug }: { slug: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);
  return (
    <p className="p-8 text-center text-sm text-muted">
      L&apos;écran « {slug} » a été retiré de l&apos;application. Retour au tableau de bord…
    </p>
  );
}

export function ModuleDispatcher({ slug }: { slug: string[] }) {
  const { user } = useSession();
  const rights = useAccessRights();
  const pageSlug = slug[0];

  const role = user?.role || "admin";

  // 1. Student Portal Routing
  if (role === "student") {
    return <StudentPages slug={pageSlug} />;
  }

  // 2. Teacher Portal Routing
  if (role === "teacher") {
    return <TeacherPages slug={pageSlug} />;
  }

  // 3. Parent Portal Routing
  if (role === "parent") {
    return <ParentPages slug={pageSlug} />;
  }

  // 4. Admin / Reception Portal Routing
  //
  // Un travailleur n'ouvre que les écrans qu'on lui a cochés. La barre latérale
  // ne lui montre déjà pas les autres, mais une adresse tapée à la main, un
  // signet ou un lien reçu contourneraient le menu : le garde-fou est ici, sur
  // la route elle-même.
  /**
   * LES ÉCRANS RETIRÉS.
   *
   * « Sujets & exercices » n'existe plus, et « Cartes & tarifs » non plus : le
   * tarif d'un emploi du temps se fixe désormais SUR l'emploi du temps, au
   * moment où on le crée, et les périodes offertes ont rejoint les Paramètres.
   *
   * Leurs adresses, elles, survivent dans des signets et des liens envoyés :
   * sans cette liste, elles tomberaient sur l'écran générique « bientôt
   * disponible », qui promettrait le retour d'un module supprimé. On renvoie à
   * l'accueil, ce qui est la vérité.
   */
  if (RETIRED_SLUGS.has(pageSlug)) {
    return <RetiredModule slug={pageSlug} />;
  }

  const guardKey = pageSlug === "administration" ? "workers" : pageSlug;
  if (guardKey && !canSeePage(rights, guardKey)) {
    return <AccessDenied />;
  }

  switch (pageSlug) {
    case "semesters":
      return <SemestersPage />;
    case "classes":
      return <ClassesPage />;
    case "planner":
      return <PlannerPage />;
    case "students":
      return <StudentsPage />;
    case "attendance":
      return <AttendancePage />;
    case "teachers":
      return <TeachersPage />;
    case "workers":
    case "administration": // legacy slug — kept so old bookmarks keep working
      return <AdministrationPage />;
    case "independent":
      return <IndependentPage />;
    case "parents":
      return <ParentsPage />;
    case "announcements":
      return <AnnouncementsPage />;
    case "expenses":
      return <ExpensesPage />;
    case "analytics":
      return <AnalyticsPage />;
    case "horses":
      return <HorseTradePage />;
    case "stable":
      return <StablePage />;
    case "stable-reports":
      return <StableReportsPage />;
    case "other-debts":
      return <OtherDebtsPage />;
    case "cash-secondary":
      return <SecondaryCashPage />;
    case "cash":
      return <CashPage />;
    case "reports":
      return <ReportsPage />;
    case "website":
      return <WebsitePage />;
    case "website-inscriptions":
      return <WebsiteInscriptionsPage />;
    case "settings":
      return <SettingsPage />;
    default:
      return <ModulePlaceholder href={`/${slug.join("/")}`} />;
  }
}
