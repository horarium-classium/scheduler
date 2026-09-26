import type { PublicationStatus } from "./cloud-workspace";

export async function copyClassCode(publication: PublicationStatus | undefined, write: (text: string) => Promise<void>): Promise<string> {
  if (!publication?.revision) return "Student-ին միանալու համար նախ հրապարակեք դասարանը։";
  try {
    await write(publication.public_id);
    return "Դասարանի կոդը պատճենված է։ Տեղադրեք այն Student-ի «Միանալ դասարանին» դաշտում։";
  } catch {
    return "Չհաջողվեց պատճենել դասարանի կոդը։ Ստուգեք clipboard-ի թույլտվությունը և կրկին փորձեք։";
  }
}
