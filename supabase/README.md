# Local Supabase foundation

Այս պանակը Teacher-ի ապագա ամպային շերտի database source of truth-ն է։ Teacher frontend-ը նույնականացված օգտատիրոջ դպրոցի տվյալները կարդում և գրում է ամպային workspace RPC-ներով։

## Պահանջներ

- Node.js 20 կամ ավելի նոր (նախագծում CLI-ն pin արված է `2.117.0`)։
- Աշխատող Docker-compatible runtime։
- Առնվազն մոտ 7 GB ազատ RAM ամբողջ local stack-ի համար։

Local stack-ը development-only է և չպետք է հասանելի դարձնել անվստահելի ցանցից։ Repository-ն remote Supabase project-ի հետ link անել այս փուլում պետք չէ։

## Հրամաններ

Repository-ի root-ից՝

```sh
npm install
npm run supabase:start
npm run supabase:verify
npm run supabase:stop
```

Առանձին գործողությունները՝

```sh
npm run supabase:reset
npm run supabase:test
npm run supabase:lint
```

`supabase:reset`-ը **ջնջում է այս նախագծի տեղային database-ի բոլոր տվյալները**, նորից կիրառում migrations-ը և `seed.sql`-ը։ Script-ը միշտ փոխանցում է `--local`; մի ավելացրեք `--linked` կամ `--db-url`, եթե հստակ չեք ցանկանում թիրախավորել այլ բազա։ Database tests-ը նույնպես աշխատում է միայն local stack-ի վրա։

`supabase:test`-ը pgTAP-ը գործարկում է տեղային superuser-ով (`supabase_admin`), որպեսզի concurrency թեստի dblink-միացումները կարողանան գաղտնաբառով կապ հաստատել (plain `dblink_connect`-ը ոչ superuser-ի համար գաղտնաբառ չի ընդունում)։ Դերերի/RlS/anon/authenticated ստուգումները մնում են իրական — rls թեստերը դրերը սահմանում են `set role`-ով, իսկ constraint-ների թեստերը privileged SQL-ով են։

## Local փորձնական հաշիվներ

Բոլոր հաշիվների գաղտնաբառն է `local-password` և այն նախատեսված է միայն տեղային մշակման համար։

| Email | Անդամակցություն |
| --- | --- |
| `admin-a@local.test` | Դպրոց Ա — admin |
| `scheduler-a@local.test` | Դպրոց Ա — scheduler |
| `admin-b@local.test` | Դպրոց Բ — admin |
| `no-school@local.test` | դպրոց չունի |

Seed-ը ստեղծում է երկու դպրոց, երկու դպրոցներում նույն անունով դասարան/առարկա, նույն անունով առանձին դասատուներ, nullable teacher-ով դաս և վերարտադրվող UUID-ներ։ Սա production bootstrap չէ և remote միջավայր ինքնաբերաբար չի ուղարկվում։

## Կառուցվածք և անվտանգության սահմաններ

- `migrations/202609190001_school_schema.sql` — աղյուսակներ, UUID կապեր և indexes։
- `migrations/202609190002_constraints.sql` — database invariants, overlap/occupancy constraints և lifecycle triggers։
- `migrations/202609190003_access_policies.sql` — grants, RLS և membership helpers։
- `migrations/202609230001_teacher_workspace.sql` — ամբողջական snapshot read և atomic change-set save՝ RLS-ով, դպրոցի գրառումների serialization-ով և stale-version ստուգմամբ։
- `seed.sql` — միայն local Auth/data fixtures։
- `tests/` — pgTAP schema, constraint, RLS և երկու-connection concurrency ստուգումներ։

RLS-ը anonymous draft հասանելիություն չի տալիս։ Admin-ը կառավարում է դպրոցի կարգավորումներն ու դասաժամերը, scheduler-ը՝ դասարանները, առարկաները, դասատուներն ու դասերը։ Membership-ի փոփոխությունը և publication write-ը client դերերին փակ են։ Service-role key repository-ում կամ frontend-ում չկա։

Hosted կապը և Teacher Auth/data adapter-ը իրականացված են։ Browser-ի տեղային տվյալների ներմուծումն առանձին հաջորդ աշխատանք է։ Publication RPC-ն ու public read contract-ը լրացված են `202609240001_publication.sql` և `202609260001_class_join_codes.sql` migration-ներով. տես [PUBLICATION.md](PUBLICATION.md)։ Student-ը միանում է 4 տառանոց դասարանի կոդով. տեղային ամբողջ հոսքի քայլերը՝ [PUBLICATION.md](PUBLICATION.md)-ում։

- `migrations/202609260004_stable_join_code_allocation.sql` — առկա կոդերի պահպանում, անփոփոխ կոդեր և ատոմային ամրագրում/կրկնափորձ՝ առանց ջնջված կոդերի վերօգտագործման։
