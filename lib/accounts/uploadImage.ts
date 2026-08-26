"use client";

/**
 * LES IMAGES DE LA DÉMONSTRATION — le logo de l'école et les illustrations des
 * supports de cours.
 *
 * Il n'y a plus de dépôt de fichiers : l'image choisie est lue dans le
 * navigateur et rendue sous forme de `data:` URL. Cette chaîne est ce qui est
 * rangé sur la ligne, exactement comme l'URL publique l'était — donc l'image
 * s'affiche partout où elle s'affichait, et survit à un rechargement puisque
 * l'instantané la garde avec le reste.
 *
 * LA CONTREPARTIE, ET C'EST POURQUOI LA LIMITE EST BASSE : une `data:` URL pèse
 * un tiers de plus que le fichier d'origine et vit dans l'instantané, dont la
 * place est comptée. Deux mégaoctets suffisent largement à un logo ou à une
 * vignette, et laissent l'instantané respirer.
 */

const MAX_BYTES = 2 * 1024 * 1024; // 2 Mo

export async function uploadImage(
  _bucket: "logos" | "subjects",
  file: File,
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Le fichier choisi n'est pas une image.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Le fichier est trop volumineux (maximum 2 Mo en démonstration).");
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("La lecture du fichier a échoué."));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("La lecture du fichier a échoué."));
    };
    reader.readAsDataURL(file);
  });
}
