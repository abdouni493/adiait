"use client";

/**
 * LES IMAGES — le logo du club et les illustrations des supports de cours.
 *
 * Le fichier part dans le dépôt Supabase Storage `logos`, et
 * c'est son URL PUBLIQUE qui est rangée sur la ligne (`school.logo`,
 * `subject.image`). Deux conséquences voulues :
 *
 *  - l'image s'affiche pour TOUT LE MONDE, y compris sur la page de connexion
 *    avant qu'un compte soit ouvert, et dans un document imprimé ;
 *  - la ligne ne porte qu'une adresse, pas l'image elle-même : la base reste
 *    légère, et deux écrans qui affichent le même logo le chargent une fois.
 *
 * LE NOM DU FICHIER EST TIRÉ AU SORT plutôt que repris du fichier d'origine :
 * deux « logo.png » déposés le même jour ne doivent pas s'écraser l'un l'autre,
 * et une image remplacée ne doit pas rester en cache sous l'ancienne adresse.
 */

import { supabase, errorMessage } from "@/lib/supabase/client";

/** Cinq mégaoctets : largement de quoi loger un logo ou une vignette. */
const MAX_BYTES = 5 * 1024 * 1024;

export type ImageBucket = "logos";

export async function uploadImage(bucket: ImageBucket, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Le fichier choisi n'est pas une image.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Le fichier est trop volumineux (maximum 5 Mo).");
  }

  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  const path = `${Date.now().toString(36)}-${random}.${extension}`;

  const { error } = await supabase()
    .storage.from(bucket)
    .upload(path, file, { cacheControl: "31536000", contentType: file.type, upsert: false });

  if (error) throw new Error(errorMessage(error, "L'envoi de l'image a échoué."));

  const { data } = supabase().storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
