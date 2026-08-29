import { SiteFormationDetail } from "@/components/site/SiteFormationDetail";

/**
 * LE DÉTAIL D'UNE FORMATION — l'adresse que « Copier le lien » distribue.
 *
 * Aucune génération statique : les formations naissent et disparaissent depuis
 * la gestion, bien après la construction du site. La page est donc rendue à la
 * demande, et son contenu lu dans le navigateur par le magasin du site.
 */
export default async function SiteFormationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SiteFormationDetail id={id} />;
}
