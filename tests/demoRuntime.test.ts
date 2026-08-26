/**
 * LA PLOMBERIE DE LA DÉMONSTRATION.
 *
 * Se connecter, être encore connecté après un rechargement, retrouver ce qu'on
 * a modifié, et pouvoir tout remettre à zéro : ce sont les quatre gestes sur
 * lesquels repose une démonstration sans base de données. Ils passent par le
 * stockage du navigateur, donc ce fichier lui en fabrique un.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Un `localStorage` minimal, suffisant pour ce que la démonstration lui demande. */
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

const storage = new MemoryStorage();
vi.stubGlobal("window", { localStorage: storage });

const {
  FAMILY_ACCOUNTS,
  QUICK_ACCOUNTS,
  findByLogin,
  listAccounts,
  rememberedSession,
  resetAccounts,
} = await import("@/lib/demo/accounts");
const { useSession } = await import("@/lib/store/session");
const { createRoleUser, resetUserPassword, updateUserEmail, deleteRoleUser } = await import(
  "@/lib/accounts/users"
);
const { clearSnapshot, loadDatabase, loadSchool, readSnapshot, writeSnapshot } = await import(
  "@/lib/demo/db"
);

beforeEach(() => {
  storage.clear();
  resetAccounts();
  useSession.setState({ user: null, hydrated: false });
});

describe("les accès rapides de la page de connexion", () => {
  it("ouvrent tous une vraie session, avec le bon rôle et la bonne fiche", async () => {
    for (const account of [...QUICK_ACCOUNTS, ...FAMILY_ACCOUNTS]) {
      const user = await useSession.getState().signIn(account.email, account.password);
      expect(user.role).toBe(account.role);
      // Un portail ne sait afficher que la fiche que son compte désigne.
      expect(user.entityId).toBeTruthy();
    }
  });

  it("mènent chacun vers une fiche qui existe vraiment", async () => {
    const db = await loadDatabase();
    const teacher = await useSession
      .getState()
      .signIn("enseignant@altech-school.dz", "demo1234");
    expect(db.teachers.some((t) => t.id === teacher.entityId)).toBe(true);

    const worker = await useSession
      .getState()
      .signIn("travailleur@altech-school.dz", "demo1234");
    expect(db.reception.some((w) => w.id === worker.entityId)).toBe(true);

    const student = await useSession.getState().signIn("eleve@altech-school.dz", "demo1234");
    expect(db.students.some((s) => s.id === student.entityId)).toBe(true);

    const parent = await useSession.getState().signIn("parent@altech-school.dz", "demo1234");
    expect(db.parents.some((p) => p.id === parent.entityId)).toBe(true);
  });

  it("refusent un mot de passe faux", async () => {
    await expect(
      useSession.getState().signIn("admin@altech-school.dz", "pas-le-bon"),
    ).rejects.toThrow();
    expect(useSession.getState().user).toBeNull();
  });
});

describe("la session", () => {
  it("survit à un rechargement, et disparaît à la déconnexion", async () => {
    await useSession.getState().signIn("admin@altech-school.dz", "demo1234");
    expect(rememberedSession()?.role).toBe("admin");

    // Le rechargement : le magasin repart de zéro et relit le navigateur.
    useSession.setState({ user: null, hydrated: false });
    await useSession.getState().initSession();
    expect(useSession.getState().user?.role).toBe("admin");
    expect(useSession.getState().hydrated).toBe(true);

    await useSession.getState().logout();
    expect(useSession.getState().user).toBeNull();
    expect(rememberedSession()).toBeNull();
  });

  it("accepte le nom d'utilisateur aussi bien que l'email", async () => {
    const user = await useSession.getState().signIn("yasmine", "demo1234");
    expect(user.role).toBe("reception");
    expect(user.entityId).toBe("rec-1");
  });
});

describe("les comptes créés depuis l'application", () => {
  it("se connectent, changent d'email et de mot de passe, puis disparaissent", async () => {
    const { id } = await createRoleUser({
      role: "teacher",
      email: "Nouvel.Enseignant@altech-school.dz",
      password: "motdepasse",
      firstName: "Nouvel",
      lastName: "Enseignant",
    });

    // L'email est normalisé, et le compte porte l'identifiant de sa fiche.
    const created = findByLogin("nouvel.enseignant@altech-school.dz");
    expect(created?.id).toBe(id);
    expect(created?.entityId).toBe(id);

    const user = await useSession
      .getState()
      .signIn("nouvel.enseignant@altech-school.dz", "motdepasse");
    expect(user.role).toBe("teacher");

    await updateUserEmail(id, "autre@altech-school.dz");
    await resetUserPassword(id, "nouveau-mot");
    await expect(
      useSession.getState().signIn("autre@altech-school.dz", "nouveau-mot"),
    ).resolves.toBeTruthy();

    await deleteRoleUser(id);
    expect(findByLogin("autre@altech-school.dz")).toBeUndefined();
  });

  it("refusent un email déjà pris et un mot de passe trop court", async () => {
    await expect(
      createRoleUser({
        role: "parent",
        email: "admin@altech-school.dz",
        password: "motdepasse",
      }),
    ).rejects.toThrow(/déjà utilisé/);

    await expect(
      createRoleUser({ role: "parent", email: "libre@altech-school.dz", password: "court" }),
    ).rejects.toThrow(/6 caractères/);
  });

  it("laissent le registre d'origine intact tant qu'on n'y touche pas", () => {
    const before = listAccounts().length;
    expect(before).toBeGreaterThanOrEqual(QUICK_ACCOUNTS.length + FAMILY_ACCOUNTS.length);
  });
});

describe("l'instantané du navigateur", () => {
  it("est relu au démarrage, et jeté à la réinitialisation", async () => {
    const db = await loadDatabase();
    const count = db.students.length;

    // Ce que la réception vient de faire.
    db.students = db.students.slice(0, count - 1);
    writeSnapshot(db);
    expect((await loadDatabase()).students.length).toBe(count - 1);
    // Le nom de l'école affiché sur la page de connexion sort du même endroit.
    expect((await loadSchool()).name).toBe(db.school.name);

    clearSnapshot();
    expect(readSnapshot()).toBeNull();
    expect((await loadDatabase()).students.length).toBe(count);
  });

  it("ignore un instantané illisible plutôt que de bloquer la démonstration", async () => {
    storage.setItem("altech-demo-db-v1", "{ ceci n'est pas du JSON");
    expect(readSnapshot()).toBeNull();
    expect((await loadDatabase()).students.length).toBeGreaterThan(0);

    // Un instantané sans établissement n'en est pas un.
    storage.setItem("altech-demo-db-v1", JSON.stringify({ students: [] }));
    expect(readSnapshot()).toBeNull();
  });

  it("complète les collections qu'un ancien instantané ne connaissait pas", async () => {
    const db = await loadDatabase();
    const partial = JSON.parse(JSON.stringify(db)) as Record<string, unknown>;
    delete partial.workerPayments;
    storage.setItem("altech-demo-db-v1", JSON.stringify(partial));

    const restored = readSnapshot();
    expect(restored).not.toBeNull();
    expect(restored!.workerPayments).toEqual([]);
    expect(restored!.students.length).toBe(db.students.length);
  });
});
