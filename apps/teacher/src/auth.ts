import "./style.css";
import { createClient } from "@supabase/supabase-js";
import { CloudWorkspace, cloudError } from "./cloud-workspace";

const app = document.querySelector<HTMLDivElement>("#app")!;
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
if (!url || !key) {
  app.innerHTML = `<main class="auth-page"><section class="auth-card"><h1>Կարգավորումը բացակայում է</h1><p role="alert">Supabase-ի հանրային հասցեն կամ publishable key-ը չի փոխանցվել build-ին։</p></section></main>`;
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY");
}
const client = createClient(url, key, { auth: { detectSessionInUrl: false } });
let revision = 0;
let currentUser: string | null = null;
let disposeEditor: (() => void) | null = null;
let accountBar: HTMLElement | null = null;
let workspaceGeneration = 0;

function clearEditor(): void {
  ++workspaceGeneration;
  disposeEditor?.();
  disposeEditor = null;
  currentUser = null;
  accountBar?.remove();
  accountBar = null;
}

function login(message = ""): void {
  clearEditor();
  app.innerHTML = `<main class="auth-page"><section class="auth-card"><p class="auth-brand">ԴԱՍԱՑՈՒՑԱԿ · TEACHER</p><h1>Մուտք գործել</h1><p>Մուտք գործեք ձեր հաշվով՝ դասացուցակի խմբագրիչը բացելու համար։</p><form id="login-form"><label>Էլ․ փոստ<input name="email" type="email" autocomplete="username" required></label><label>Գաղտնաբառ<input name="password" type="password" autocomplete="current-password" required></label><p id="auth-error" role="alert"></p><button class="primary-button" type="submit">Մուտք գործել</button></form><p class="auth-help">Հաշիվ ստանալու կամ գաղտնաբառը վերականգնելու համար դիմեք ադմինիստրատորին։</p></section></main>`;
  const form = app.querySelector<HTMLFormElement>("form")!;
  const error = app.querySelector<HTMLElement>("#auth-error")!;
  const button = form.querySelector<HTMLButtonElement>("button")!;
  error.textContent = message;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = "Մուտք ենք գործում…";
    error.textContent = "";
    const data = new FormData(form);
    try {
      const { error: failure } = await client.auth.signInWithPassword({ email: String(data.get("email")).trim(), password: String(data.get("password")) });
      if (failure) error.textContent = failure.status === 400 ? "Էլ․ փոստը կամ գաղտնաբառը սխալ է, կամ հաշիվը դեռ հաստատված չէ։" : "Մուտքը չհաջողվեց։ Ստուգեք կապը և կրկին փորձեք։";
    } catch {
      error.textContent = "Սերվերի հետ կապը չհաջողվեց։ Կրկին փորձեք։";
    } finally {
      const password = form.elements.namedItem("password") as HTMLInputElement;
      password.value = "";
      button.disabled = false;
      button.textContent = "Մուտք գործել";
    }
  });
}

async function authenticate(ticket: number): Promise<void> {
  try {
    const { data, error } = await client.auth.getUser();
    if (ticket !== revision) return;
    if (error || !data.user) { login("Նույնականացումը չհաջողվեց։ Խնդրում ենք կրկին մուտք գործել։"); return; }
    if (currentUser === data.user.id) return;
    clearEditor();
    currentUser = data.user.id;
    accountBar = document.createElement("header");
    accountBar.className = "account-bar";
    const email = document.createElement("span"); email.textContent = data.user.email ?? "Մուտք գործած օգտատեր";
    const button = document.createElement("button"); button.className = "secondary-button"; button.textContent = "Ելք";
    const status = document.createElement("span"); status.setAttribute("role", "alert");
    accountBar.append(email, status, button); app.before(accountBar);
    button.addEventListener("click", async () => {
      if (!window.dispatchEvent(new Event("teacher-before-leave", { cancelable: true }))) return;
      button.disabled = true;
      try {
        const { error } = await client.auth.signOut({ scope: "local" });
        if (error) throw error;
        ++revision; login();
      } catch { status.textContent = "Ելքը չհաջողվեց։ Կրկին փորձեք։"; button.disabled = false; }
    });
    void loadSchools(data.user.id, workspaceGeneration);
  } catch {
    if (ticket === revision) login("Սերվերի հետ կապը չհաջողվեց։ Կրկին փորձեք։");
  }
}

async function loadSchools(userId: string, generation: number): Promise<void> {
  app.innerHTML = `<main class="auth-page"><p role="status">Բեռնում ենք դպրոցը…</p></main>`;
  try {
    const { data, error } = await client.from("school_members").select("school_id, role, schools(id, name)").eq("user_id", userId);
    if (generation !== workspaceGeneration) return;
    if (error) throw error;
    if (!data?.length) {
      workspaceMessage("Ձեր հաշիվը դեռ կապված չէ դպրոցի հետ։ Դիմեք ադմինիստրատորին։", () => void loadSchools(userId, generation));
      return;
    }
    const schools = data.map(member => {
      const school = member.schools as unknown as { id: string; name: string } | null;
      if (!school || school.id !== member.school_id || !["admin", "scheduler"].includes(member.role)) throw new Error("Դպրոցի անդամակցության տվյալներն անվավեր են։");
      return { id: school.id, name: school.name, role: member.role as "admin" | "scheduler" };
    });
    const open = async (school: typeof schools[number]): Promise<void> => {
      app.innerHTML = `<main class="auth-page"><p role="status">Բեռնում ենք դասացուցակը…</p></main>`;
      try {
        const read = async (): Promise<unknown> => {
          const result = await client.rpc("teacher_workspace_read", { p_school: school.id });
          if (result.error) throw result.error; return result.data;
        };
        const workspace = new CloudWorkspace(school.id, await read(), {
          read,
          save: async (version, changes) => {
            const result = await client.rpc("teacher_workspace_save", { p_school: school.id, p_version: version, p_changes: changes });
            if (result.error) throw result.error; return result.data;
          },
        });
        const initial = workspace.decode();
        const { mountEditor } = await import("./main");
        if (generation !== workspaceGeneration) return;
        disposeEditor = mountEditor(workspace, initial, school.role);
      } catch (error) {
        if (generation === workspaceGeneration) workspaceMessage(cloudError(error), () => void loadSchools(userId, generation));
      }
    };
    if (schools.length === 1) { await open(schools[0]!); return; }
    app.innerHTML = `<main class="auth-page"><section class="auth-card"><h1>Ընտրեք դպրոցը</h1><div class="school-choices"></div></section></main>`;
    for (const school of schools) {
      const button = document.createElement("button"); button.className = "secondary-button"; button.textContent = school.name;
      button.addEventListener("click", () => void open(school)); app.querySelector(".school-choices")!.append(button);
    }
  } catch (error) {
    if (generation === workspaceGeneration) workspaceMessage(cloudError(error), () => void loadSchools(userId, generation));
  }
}
function workspaceMessage(message: string, retry: () => void): void {
  app.innerHTML = `<main class="auth-page"><section class="auth-card"><h1>Դպրոցի տվյալները հասանելի չեն</h1><p role="alert"></p><button class="primary-button">Կրկին փորձել</button></section></main>`;
  app.querySelector("p")!.textContent = message;
  app.querySelector("button")!.addEventListener("click", retry);
}

app.innerHTML = `<main class="auth-page"><p role="status">Ստուգում ենք մուտքը…</p></main>`;
client.auth.onAuthStateChange((_event, session) => {
  const ticket = ++revision;
  if (!session) { login(); return; }
  // Supabase callbacks run under an auth lock; check the user after it is released.
  setTimeout(() => { if (ticket === revision) void authenticate(ticket); }, 0);
});
