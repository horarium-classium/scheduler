# Local Supabase foundation

Այս պանակը Teacher-ի ապագա ամպային շերտի database source of truth-ն է։ Այս փուլում frontend-ը շարունակում է աշխատել browser-ի տեղային պահոցով և Supabase չի կարդում կամ գրում։

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

Seed-ը ստեղծում է երկու դպրոց, երկու դպրոցներում նույն անունով դասարան/առարկա, նույն անունով առանձին ուսուցիչներ, nullable teacher-ով դաս և վերարտադրվող UUID-ներ։ Սա production bootstrap չէ և remote միջավայր ինքնաբերաբար չի ուղարկվում։

## Կառուցվածք և անվտանգության սահմաններ

- `migrations/202609190001_school_schema.sql` — աղյուսակներ, UUID կապեր և indexes։
- `migrations/202609190002_constraints.sql` — database invariants, overlap/occupancy constraints և lifecycle triggers։
- `migrations/202609190003_access_policies.sql` — grants, RLS և membership helpers։
- `seed.sql` — միայն local Auth/data fixtures։
- `tests/` — pgTAP schema, constraint, RLS և երկու-connection concurrency ստուգումներ։

RLS-ը anonymous draft հասանելիություն չի տալիս։ Admin-ը կառավարում է դպրոցի կարգավորումներն ու դասաժամերը, scheduler-ը՝ դասարանները, առարկաները, ուսուցիչներն ու դասերը։ Membership-ի փոփոխությունը և publication write-ը client դերերին փակ են։ Service-role key repository-ում կամ frontend-ում չկա։

Հաջորդ փուլում առանձին պետք է կատարվեն hosted development project-ի վերահսկվող կապումը, Teacher Auth/data adapter-ը և browser-ի տեղային տվյալների ներմուծումը։ Publish RPC-ն ու Student public read contract-ը նույնպես այս հիմքի մաս չեն։
