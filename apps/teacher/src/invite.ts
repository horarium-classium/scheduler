export const invalidInvite = "Հրավերի հղումը բացակայում է կամ ժամկետանց է։ Խնդրեք նոր հրավեր։";

export function readCallback(hash: string, search = "") {
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const query = new URLSearchParams(search.replace(/^\?/, ""));
  const get = (name: string) => fragment.get(name) ?? query.get(name);
  const type = get("type");
  const error = ["error", "error_code", "error_description"].some(name => get(name) !== null);
  const token = fragment.get("access_token");
  return { type, error, token: !error && (type === "invite" || type === "recovery") ? token : null,
    present: error || type !== null || token !== null || get("code") !== null };
}

export function activationTarget(href: string): string | null {
  const url = new URL(href);
  const callback = readCallback(url.hash, url.search);
  if (!callback.present) return null;
  const target = new URL("activate.html", url);
  target.hash = url.hash;
  target.search = url.search;
  return target.href;
}

export function validatePassword(password: string, confirmation: string): string | null {
  if (password.length < 12) return "Գաղտնաբառը պետք է ունենա առնվազն 12 նիշ։";
  if (password !== confirmation) return "Գաղտնաբառերը չեն համընկնում։";
  return null;
}

export class ActivationError extends Error {
  status: number;
  constructor(status: number) { super("Activation request failed"); this.status = status; }
}

export function activationError(error: unknown): string {
  if (error instanceof ActivationError) {
    if (error.status === 401 || error.status === 403) return invalidInvite;
    if (error.status === 400 || error.status === 422) return "Գաղտնաբառը մերժվել է։ Ընտրեք այլ, ավելի ուժեղ գաղտնաբառ և կրկին փորձեք։";
    if (error.status === 429) return "Չափազանց շատ փորձեր։ Մի փոքր սպասեք և կրկին փորձեք։";
  }
  return "Սերվերի հետ կապը չհաջողվեց։ Կրկին փորձեք։";
}

export function activationApi(base: string, key: string, token: string, request: typeof fetch = fetch) {
  return async (password?: string): Promise<string> => {
    const response = await request(base.replace(/\/$/, "") + "/auth/v1/user", {
      method: password === undefined ? "GET" : "PUT",
      headers: { apikey: key, Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: password === undefined ? undefined : JSON.stringify({ password }),
      cache: "no-store", referrerPolicy: "no-referrer",
    });
    if (!response.ok) throw new ActivationError(response.status);
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("id" in body) || typeof body.id !== "string" || !("email" in body) || typeof body.email !== "string") throw new Error("Invalid user response");
    return body.email;
  };
}
