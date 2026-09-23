import "./style.css";
import { createClient } from "@supabase/supabase-js";

// Public browser configuration, also used by the existing invitation page.
const url = import.meta.env.VITE_SUPABASE_URL || "https://soqjiqvapluubkibzrut.supabase.co";
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_dsVeNj0g2m2ww_gWMosO4g_5_jk6Tzy";
const app = document.querySelector<HTMLDivElement>("#app")!;
const client = createClient(url, key, { auth: { detectSessionInUrl: false } });
let revision = 0;
let currentUser: string | null = null;
let disposeEditor: (() => void) | null = null;
let accountBar: HTMLElement | null = null;

function clearEditor(): void {
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
    const { mountEditor } = await import("./main");
    if (ticket !== revision) return;
    disposeEditor = mountEditor(data.user.id);
    currentUser = data.user.id;
    accountBar = document.createElement("header");
    accountBar.className = "account-bar";
    const email = document.createElement("span"); email.textContent = data.user.email ?? "Մուտք գործած օգտատեր";
    const button = document.createElement("button"); button.className = "secondary-button"; button.textContent = "Ելք";
    const status = document.createElement("span"); status.setAttribute("role", "alert");
    accountBar.append(email, status, button); app.before(accountBar);
    if (window.localStorage.getItem("horarium-teacher-workspace")) {
      status.textContent = "Նախկին տեղային տվյալները պահպանված են առանձին․ ներմուծումը դեռ հասանելի չէ։";
    }
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const { error } = await client.auth.signOut({ scope: "local" });
        if (error) throw error;
        ++revision; login();
      } catch { status.textContent = "Ելքը չհաջողվեց։ Կրկին փորձեք։"; button.disabled = false; }
    });
  } catch {
    if (ticket === revision) login("Սերվերի հետ կապը չհաջողվեց։ Կրկին փորձեք։");
  }
}

app.innerHTML = `<main class="auth-page"><p role="status">Ստուգում ենք մուտքը…</p></main>`;
client.auth.onAuthStateChange((_event, session) => {
  const ticket = ++revision;
  if (!session) { login(); return; }
  // Supabase callbacks run under an auth lock; check the user after it is released.
  setTimeout(() => { if (ticket === revision) void authenticate(ticket); }, 0);
});
