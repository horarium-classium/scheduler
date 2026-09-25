import { activationApi, activationError, invalidInvite, readCallback, validatePassword } from "./invite";

const callback = readCallback(location.hash, location.search);
history.replaceState(null, "", location.pathname);
const status = document.querySelector<HTMLElement>("#status")!;
const form = document.querySelector<HTMLFormElement>("form")!;
const button = form.querySelector<HTMLButtonElement>("button")!;
const retry = document.querySelector<HTMLButtonElement>("#retry")!;
const base = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
let auth: ReturnType<typeof activationApi> | null = null;
if (base && key && callback.token) auth = activationApi(base, key, callback.token);
callback.token = null;
if (callback.type === "recovery") document.querySelector("h1")!.textContent = "Վերականգնել գաղտնաբառը";

async function verify(): Promise<void> {
  if (!auth) return;
  retry.hidden = true;
  status.textContent = "Ստուգում ենք հղումը…";
  try {
    const email = await auth();
    status.textContent = email + " — սահմանեք առնվազն 12 նիշ ունեցող գաղտնաբառ։";
    form.hidden = false;
  } catch (error) {
    status.textContent = activationError(error);
    retry.hidden = false;
  }
}
retry.addEventListener("click", () => void verify());
if (!base || !key) status.textContent = "Supabase-ի կարգավորումը բացակայում է։ Դիմեք ադմինիստրատորին։";
else if (!auth) status.textContent = invalidInvite;
else void verify();

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (button.disabled || !auth) return;
  const password = form.elements.namedItem("password") as HTMLInputElement;
  const confirmation = form.elements.namedItem("confirmation") as HTMLInputElement;
  const failure = validatePassword(password.value, confirmation.value);
  if (failure) { status.textContent = failure; return; }
  button.disabled = true;
  try {
    await auth(password.value);
    auth = null;
    form.reset(); form.hidden = true;
    status.textContent = "Գաղտնաբառը պահպանված է։";
    document.querySelector<HTMLElement>("#done")!.hidden = false;
  } catch (error) {
    status.textContent = activationError(error);
  } finally { button.disabled = false; }
});
