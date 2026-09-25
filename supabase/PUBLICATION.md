# Դասարանի հրապարակում

Նոր migration՝ `202609240001_publication.sql`։ Կիրառել այն նախքան նոր Teacher frontend-ը։ Հին migrations-ը չեն փոխվել։ Նոր migration-ը նաև authenticated դերին թույլ է տալիս կատարել դպրոցի CHECK constraint-ի `is_valid_timezone` ֆունկցիան. դպրոցի UPDATE-ը շարունակում է թույլատրվել միայն admin-ին՝ RLS-ով։ Այս փոփոխությունը տեղային կոդ է. hosted բազայում կիրառումը կատարվում է առանձին՝ `HOSTED-DEVELOPMENT.md`-ի ընթացքով։

## RPC-ներ

- `publish_schedule(p_school uuid, p_class uuid, p_version text)` — տվյալ դպրոցի admin/scheduler-ը հրապարակում է մեկ ակտիվ դասարանի պահպանված սևագիրը։ `p_class`-ը ներքին class UUID-ն է, `p_version`-ը՝ վերջին `teacher_workspace_read`/save-ի version-ը։ Պատասխանը՝ `{revision, publishedAt, workspace}`։
- `get_published_schedule(p_public_id uuid)` — anon/authenticated-ը կարող է կարդալ ակտիվ դասարանի վերջին հրապարակումը՝ միայն դրա հանրային UUID-ով։ Չհրապարակված, անհայտ կամ ոչ ակտիվ դասարանի դեպքում վերադարձնում է `null`։ Ցուցակագրում և պատմության հանրային ընթերցում չկան։
- `teacher_workspace_read`-ի պատասխանի նոր `publications` ցանկը յուրաքանչյուր դասարանի համար պարունակում է `class_id`, `public_id`, nullable `revision`/`published_at` և `is_current`։ Draft-ի version-ի հաշվարկը չի փոխվել։

Հրապարակման պատասխանը հանրային RPC-ից՝

```json
{
  "formatVersion": 1,
  "publicId": "դասարանի հանրային UUID",
  "revision": 1,
  "publishedAt": "2026-09-24T10:00:00Z",
  "schoolName": "Դպրոց",
  "className": "5Ա",
  "timezone": "Asia/Yerevan",
  "schedule": {
    "Երկուշաբթի": [{"start": "09:00", "end": "09:45", "lesson": "Մաթեմատիկա"}],
    "Երեքշաբթի": [], "Չորեքշաբթի": [], "Հինգշաբթի": [],
    "Ուրբաթ": [], "Շաբաթ": [], "Կիրակի": []
  }
}
```

Student-ի գործող parser-ը ընդունում է `schedule` դաշտը։ Envelope-ը ուղղակի parser-ին փոխանցել չի կարելի։ Student-ի աղբյուրը, cache-ը, timezone վարքն ու դասարանին կապվելու UX-ը այս փուլում չեն փոխվել։

## Պահպանվող երաշխիքներ

Հրապարակումը server-side transaction է։ Նույն դպրոցի workspace փոփոխություններն ու հրապարակումը օգտագործում են նույն advisory transaction lock-ը։ Իրավունքներն ու workspace version-ը ստուգվում են կողպումը ստանալուց հետո։ Հնացած version-ը մերժվում է `40001 workspace_conflict`-ով։ Դասաժամերի, կապերի ու դասատուի բախումների գործող database constraints-ը պահպանվում են, ոչ ակտիվ առարկայի/դասատուի կապով հրապարակումը մերժվում է։

Համընկնող սևագրի կրկնակի հրապարակումը վերադարձնում է վերջին revision-ը՝ առանց կրկնօրինակի։ Իրական փոփոխությունը ստեղծում է հաջորդ revision-ը։ Ձախողված գործողությունը չի փոխում վերջին հանրային տարբերակը։ Դատարկ դասացուցակը նույնպես վավեր հրապարակում է և կարող է մաքրել նախկին դասերը։

Դասարանի/դպրոցի անունը, timezone-ը և առարկաներից ու դասաժամերից հաշվարկված schedule-ը snapshot են. հետագա խմբագրումը չի փոխում դրանք։ Ներքին `draft_snapshot`-ը ներառում է նաև գույնը, դասատուի կապը/անունը և մեկնաբանությունը՝ չհրապարակված փոփոխությունները հաշվելու համար։ Այդ դաշտերը հանրային payload-ում չկան։ Չօգտագործվող տեղեկատուի կամ այլ դասարանի փոփոխությունը չի նշում այս դասարանը որպես փոխված։

Հանրային UUID-ն տարածվող ընթերցման հասցեատեր է, ոչ գաղտնաբառ։ Իմացողը կարող է կարդալ հրապարակված դասացուցակը։ Client դերերը չեն կարող անմիջապես INSERT/UPDATE/DELETE անել հրապարակումները։ Հրապարակում ունեցող դասարանի hard delete-ը արգելվում է FK-ով, Teacher-ը նույնպես բացատրում է արգելքը։ Class-ը ոչ ակտիվ դարձնելը դադարեցնում է հանրային ընթերցումը։ Հրապարակումների պատմությունը պահպանվում է. rollback/unpublish UI այս փուլում չկա։

## Ստուգումներ

```sh
npm ci
npm ci --prefix apps/teacher
npm run publication:test:embedded
npm test --prefix apps/teacher
npm run build --prefix apps/teacher
```

Embedded թեստը PGlite PostgreSQL-ով իրական migrations-ն ու RLS-ն է ստուգում՝ առանց սերվերի, ցանցային կապի կամ hosted տվյալների։ Auth-ը ներկայացված է թեստային `auth.uid()`/users/roles fixture-ով, իսկ գաղտնաբառերի seed-ին պետք եղած pgcrypto-ն բաց է թողնվում։ Այն ստուգում է նաև payload-ը Student-ի իրական parser-ով։ Սա GoTrue/PostgREST կամ բազմամիացում concurrency ստուգման փոխարինում չէ։

Գործող տեղային Supabase-ի վրա նոր migration-ը կիրառելուց հետո `npm run supabase:test`-ը գործարկում է նաև publication-ի pgTAP և երկու-connection concurrency թեստերը։ `npm run supabase:lint`-ը ստուգում է բազայի ֆունկցիաները։ Hosted բազայի դեմ թեստերը մի գործարկեք։

Ձեռքով՝ admin/scheduler-ով հրապարակել մեկ դասարան, փոխել անուն/ժամ/գույն/դասատու/մեկնաբանություն և տեսնել «Չհրապարակված փոփոխություններ», ստուգել որ public RPC-ն հին snapshot-ն է վերադարձնում, ապա նորից հրապարակել։ Փորձել դատարկ դասարան, պահպանման սխալ, կորած publication պատասխան և retry, երկրորդ ներդիրի հնացած version, այլ դպրոցի հաշիվ, anon draft read և հրապարակում ունեցող դասարանի ջնջում։
