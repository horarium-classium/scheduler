# Supabase — փուլ 1. տեղային հիմք, schema, RLS և թեստեր

Ամսաթիվ՝ 2026-09-19։ Repository՝ https://github.com/armenbadal/horarium-classium

## Հանձնարարություն Codex-ին

Նախագծում կառուցիր վերարտադրվող տեղային Supabase հիմք՝ schema migrations, հասանելիության կանոններ, database սահմանափակումներ, փորձնական տվյալներ և ավտոմատ թեստեր։ Նախ կարդա կիրառելի AGENTS.md հրահանգները, git վիճակը, Teacher-ի model/storage մոդուլներն ու առկա թեստերը։ Պահպանիր օգտատիրոջ փոփոխությունները։

Այս փուլի ավարտը աշխատող և ստուգված տեղային database-ն է։ Teacher-ը դեռ չտեղափոխել Supabase, Student-ը չփոխել, hosted project չստեղծել և remote database-ի վրա migration/reset չգործարկել։ Login UI-ն, տեղային տվյալների ներմուծումը, Publish RPC-ն և Student-ի կապը հաջորդ փուլերն են։ Այստեղ Auth-ը պետք է աշխատի տեղային թեստային հաշիվներով, իսկ RLS-ը՝ սկզբից։

Նախնական ստուգման պահին Docker CLI-ն տեղադրված էր, daemon-ը չէր աշխատում, Supabase CLI և migrations չկային։ Նորից ստուգիր՝ վիճակը կարող է փոխված լինել։ Docker-ի անհասանելիությունը չի խանգարում գրել migrations-ը և թեստերը, բայց առանց իրական գործարկման փուլը ամբողջությամբ ստուգված չհամարել։

## 1. Գործիքներ և արդյունքի կառուցվածք

- Օգտագործել Supabase CLI՝ նախագծի development dependency-ով և lockfile-ով։ Հարգել գործող package կառուցվածքը. root package-ի ավելացումը չպետք է վերակազմավորի apps/student կամ apps/teacher-ը։
- Ստուգել CLI-ի Node/runtime պահանջները պաշտոնական փաստաթղթերով։
- Տեղային stack-ի համար օգտագործել Docker-compatible runtime։ Եթե պետք է Docker Desktop-ը բացել կամ ներբեռնել dependency-ներ, օգտագործել միջավայրի նախատեսված թույլտվության մեխանիզմը։
- Պահել local config-ը Git-ում, գաղտնի environment արժեքները՝ Git-ից դուրս։
- Գոյություն ունեցող տեղային database reset անելուց առաջ համոզվել, որ այն այս նախագծի disposable փորձնական բազան է. օգտատիրոջ տվյալներով բազան չմաքրել։

Նախատեսվող արդյունքները՝

```text
supabase/
  config.toml
  migrations/
    <timestamp>_school_schema.sql
    <timestamp>_constraints.sql
    <timestamp>_access_policies.sql
  seed.sql
  tests/
    schema.test.sql
    constraints.test.sql
    rls.test.sql
  README.md
```

Ֆայլերի բաժանումը կարելի է հարմարեցնել, բայց migrations-ի հերթականությունը պետք է լինի հստակ։ Schema-ի միակ աղբյուրը repository-ն է։ Dashboard-ում արված և ֆայլերում չարտացոլված փոփոխություններ չթողնել։

Տրամադրել scripts՝ start, stop, local reset, database tests և lint գործողությունների համար։ Փաստաթղթավորել reset-ի տվյալներ ջնջող բնույթը։ Թեստերի reset-ը երբեք չուղղել remote project-ին։

## 2. Schema

Օգտագործել UUID հիմնական ID-ներ, `timestamptz` audit ժամկետներ։ Browser-ի ներկայիս թվային ID-ները դեռ չփոխել. դրանք առանձին ներմուծման փուլում կմապվեն։

| Աղյուսակ | Պարտադիր կառուցվածք |
| --- | --- |
| `schools` | `id`, `name`, `timezone`, `created_at`, `updated_at` |
| `profiles` | `id` → `auth.users.id`, `display_name`, audit ժամկետներ |
| `school_members` | `school_id`, `user_id` → `auth.users.id`, `role`, `created_at`; եզակի school/user զույգ |
| `classes` | `id`, `school_id`, `name`, `sort_order`, կայուն եզակի `public_id`, `active`, audit ժամկետներ |
| `time_slots` | `id`, `school_id`, `start_time`, `end_time`, `sort_order`, audit ժամկետներ |
| `subjects` | `id`, `school_id`, `name`, `color`, `active`, audit ժամկետներ |
| `teachers` | `id`, `school_id`, `name`, `active`, audit ժամկետներ |
| `lessons` | `id`, `school_id`, `class_id`, `weekday`, `time_slot_id`, `subject_id`, nullable `teacher_id`, `comment`, audit ժամկետներ |
| `schedule_publications` | `id`, `school_id`, `class_id`, `revision`, `format_version`, `payload` jsonb, `published_at`, nullable `published_by` → `auth.users.id` |

Հստակեցումներ՝

- `teachers`-ը դասավանդողների տեղեկատու է, ոչ Auth օգտատերերի պատճեն։ Դասատուն հաշիվ ունենալու պարտավորություն չունի։
- Դերերը այս փուլում միայն `admin` և `scheduler` են։ Դերը չպահել ինքնախմբագրվող profile դաշտում։
- Timezone-ի լռելյայն արժեքը `Asia/Yerevan` է։ Վավերացնել database-ի ճանաչած timezone-ների ցանկով՝ համապատասխան trigger/function-ով։
- `weekday`-ը v1-ում 1..6 է՝ ընթացիկ Teacher-ին համապատասխան։ Student-ի կիրակիի աջակցությունը Teacher-ին այս փուլում չի ավելացվում։
- `start_time`/`end_time`-ը դպրոցի տեղային ժամեր են, առանց timezone փոխակերպման, րոպեի ճշգրտությամբ։ Չընդունել վայրկյաններ կամ `24:00`։
- `comment`-ը default դատարկ տեքստ է, առարկան պարտադիր, դասատուն՝ ոչ։
- Դասում չկան առանձին start/end/color դաշտեր։
- `public_id`-ը պատահական կայուն արտաքին նույնացուցիչ է, ոչ authentication-ի փոխարինող։ Այս փուլում դրանով public endpoint չկա։
- Publication-ի `payload`-ը հետագա փուլում կպարունակի Student-ի անուն/սկիզբ/ավարտ snapshot-ը։ Այստեղ պահանջել JSON object, դրական revision/format_version և եզակի `(class_id, revision)`։ Publish generator-ը դեռ չգրել։

## 3. Database-ի պարտադիր կանոններ

1. `classes`-ի անունը եզակի է դպրոցի ներսում՝ trim և մեծատառ/փոքրատառ տարբերությունն անտեսելով։ Նույնը՝ subjects-ի համար։ Ստուգել նաև հայերեն անուններով։
2. Դասատուի անունը եզակի չէ. համանուն մարդկանց թույլատրել։
3. Անունները trim-ից հետո դատարկ չեն։ Գույնը վավեր `#RRGGBB` է։
4. Մեկ `(school_id, class_id, weekday, time_slot_id)` համակցությանը համապատասխանում է առավելագույնը մեկ դաս։
5. Ոչ դատարկ դասատուի համար `(school_id, teacher_id, weekday, time_slot_id)` եզակի է։ Nullable teacher-ը չի սահմանափակում տարբեր դասարանների դասերը։
6. `start_time < end_time`։ Նույն դպրոցում դասաժամերը չեն համընկնում, իսկ կից միջակայքերը թույլատրվում են։
7. Lesson-ի բոլոր կապերը նույն դպրոցի ներսում են։ Publication-ի class-ը նույնպես նույն դպրոցինն է։

Կիրառել UNIQUE/partial unique indexes և դպրոցը ներառող composite foreign keys։ Parent աղյուսակներում ունենալ համապատասխան `(school_id, id)` եզակի բանալիներ։ RLS-ը միայնակ չի փոխարինում կապերի այս սահմանափակմանը։

Ժամային համընկնումների համար նախընտրել database exclusion constraint՝ դպրոցի ID + րոպեների `[start, end)` միջակայք։ Անհրաժեշտ extension-ը ներառել migration-ում։ Մի կիրառել միայն «SELECT-ով ստուգել, հետո INSERT» եղանակ. այն միաժամանակյա գործողությունների դեպքում կարող է բաց թողնել բախումը։

Անվանել constraint-ները այնպես, որ հաջորդ փուլում դրանց սխալները հնարավոր լինի վերածել հասկանալի հայերեն հաղորդագրությունների։ Foreign key և membership որոնումների համար ավելացնել անհրաժեշտ indexes։

## 4. Ակտիվություն, ջնջում և կապերի պահպանում

Այս փուլի պահպանողական քաղաքականությունը՝

- Class/Subject/Teacher-ի `active=false`-ը նշանակում է արխիվացված, ոչ ջնջված։ Գոյություն ունեցող դասերն ու կապերը պահպանվում են։
- Նոր դասը կամ փոխված կապը չի կարող նշանակվել inactive դասարանին/առարկային/դասատուին։ Անփոփոխ հին կապերով մեկնաբանության ուղղումը կամ դասի հեռացումը թույլատրելի է։ Պետք եղած trigger-ը ստուգի իրական կապի փոփոխությունը։
- Արխիվացումը չի ազատում դասատուի զբաղվածությունը. գոյություն ունեցող lessons-ը շարունակում են մասնակցել unique կանոնին։
- Օգտագործվող դասարանի, առարկայի, դասատուի կամ դասաժամի hard delete-ը RESTRICT է։ Չօգտագործվողի ջնջումը կարող է թույլատրվել դերերի սահմաններում։
- Publication ունեցող class-ի hard delete-ը արգելել։ Դպրոցի hard delete-ը browser-ի API-ով այս փուլում չթույլատրել։
- Անունների եզակիությունը ներառում է նաև inactive գրառումները՝ պատահական կրկնօրինակների փոխարեն վերաակտիվացում խրախուսելու համար։
- Auth user-ի հեռացումը չջնջի դպրոցը կամ հրապարակումները։ Profile/member կապերը կարող են մաքրվել, publication-ի հեղինակն անհրաժեշտության դեպքում դառնալ null։

Սա նախորդ տեղային UI-ի cascade delete-ի փոփոխություն է ապագա ամպային ինտեգրման համար։ Այս փուլում տեղային UI-ի վարքը չփոխել։

## 5. Auth և հասանելիության մատրից

RLS-ը միացնել browser-facing բոլոր աղյուսակների վրա նույն migration փաթեթում՝ մինչև որևէ client կապ։ Բաց anonymous draft policies չստեղծել։

| Տվյալ / գործողություն | Admin | Scheduler | Առանց անդամակցության / anon |
| --- | --- | --- | --- |
| Սեփական դպրոցի տվյալների ընթերցում | Այո | Այո | Ոչ |
| Classes, subjects, teachers, lessons կառավարում | Այո | Այո | Ոչ |
| Դպրոցի անուն/timezone փոփոխում | Այո | Ոչ | Ոչ |
| Time slots փոփոխում | Այո | Ոչ | Ոչ |
| Սեփական դպրոցի անդամների ցանկի ընթերցում | Այո | Միայն սեփական անդամակցությունը | Ոչ |
| Անդամների կամ դերերի փոփոխում browser-ից | Ոչ այս փուլում | Ոչ | Ոչ |
| Publications ընթերցում | Սեփական դպրոց | Սեփական դպրոց | Ոչ այս փուլում |
| Publications ուղղակի INSERT/UPDATE/DELETE | Ոչ | Ոչ | Ոչ |

Անդամակցության սկզբնական ստեղծումն ու կառավարումն այս փուլում կատարվում է միայն վստահելի տեղային seed/admin գործողությամբ։ Անդամների կառավարման API-ն և վերջին admin-ի պաշտպանության ամբողջական հոսքը հաջորդ փուլն են. հապճեպ broad policy չավելացնել։

Profiles-ի համար authenticated օգտատերը կարող է կարդալ/փոխել իր display_name-ը։ Այլ profiles-ի ընթերցումը այս փուլում պետք չէ։ Օգտագործել auth user-ից նվազագույն profile ստեղծող trigger՝ առանց user metadata-ից դեր կամ դպրոց վստահելու։

Կանոնների իրականացման պահանջներ՝

- SELECT/INSERT/UPDATE/DELETE-ի grants և policies-ը սահմանել առանձին և հստակ։ UPDATE-ի համար ստուգել նաև նոր row-ի school scope-ը։
- Պաշտպանել `id`, `school_id`, `public_id` և ստեղծման audit դաշտերը սովորական update-ից՝ column grants կամ trigger-ով։
- Membership policy-ներում չստեղծել ինքնահղվող RLS recursion։ Անհրաժեշտ membership helper-ները տեղադրել չարտաքինացված schema-ում։
- SECURITY DEFINER օգտագործել միայն հիմնավորված helper/trigger-ի համար՝ ֆիքսված դատարկ search_path-ով, schema-qualified անուններով և նվազագույն EXECUTE grants-ով։
- Սովորական օգտատերը չի կարող role բարձրացնել, դպրոց ստեղծել/փոխարինել կամ իրեն այլ դպրոցի անդամ դարձնել։
- Service-role key-ը frontend-ին, committed env-ին կամ README-ի օրինակին չավելացնել։

Publication-ի տվյալները application API-ի համար անփոփոխ են. միայն ապագա հատուկ Publish գործողությունն է ունենալու insert իրավունք։ Դրա բացակայությամբ deny-write-ը ճիշտ ավարտված արդյունք է, ոչ բաց թողնված CRUD։

## 6. Տեղային փորձնական տվյալներ

`seed.sql` կամ դրան կից տեղային setup script-ը ստեղծում է՝

- Երկու դպրոց՝ տարբեր ID-ներով։
- Առաջին դպրոցի admin և scheduler։
- Երկրորդ դպրոցի admin։
- Մուտք գործող օգտատեր առանց որևէ դպրոցի անդամակցության։
- Երկու դպրոցներում նույն անունով դասարաններ և առարկաներ՝ դպրոցային scope-ը ստուգելու համար։
- Նույն անունով երկու առանձին դասատու՝ տարբեր ID-ներով։
- Վավեր դասաժամեր, առարկաներ, դասատուներ, դասեր՝ նաև teacher=null օրինակով։

Օգտագործել միայն հորինված տվյալներ և տեղային փորձնական հաշիվներ։ Վերարտադրվող UUID-ներ, ոչ իրական օգտատերերի տվյալներ։ Փորձնական գաղտնաբառերը հստակ նշել որպես միայն local-ի համար և երբեք ինքնաբերաբար remote չուղարկել։ Auth schema-ի հետ աշխատելու ձևը ստուգել կիրառվող Supabase տարբերակով։

README-ում նկարագրել փորձնական մուտքը և մեկ հրամանով schema+seed վերականգնումը։ Seed-ը production bootstrap չէ։

## 7. Ավտոմատ թեստեր

Օգտագործել Supabase-ի database test հոսքը և pgTAP-ը կամ համարժեք SQL integration մոտեցում։ Policy թեստերը կատարել իրական `anon` / `authenticated` դերերով և համապատասխան auth.uid context-ով, ոչ միայն postgres/service-role շրջանցմամբ։

### Schema և constraints

- Դատարկ անուն, invalid weekday/color/timezone/time միջակայք մերժվում են։
- Նույն դպրոցի կրկնվող հայերեն class/subject անունը մերժվում է, տարբեր դպրոցներում՝ թույլատրվում։
- Համանուն teachers-ը թույլատրվում են։
- Նույն cell-ում երկրորդ lesson-ը մերժվում է։
- Նույն teacher/day/slot-ը տարբեր դասարաններում մերժվում է, այլ օրը կամ այլ slot-ը՝ թույլատրվում։ Teacher=null-ը թույլատրվում է։
- Դասաժամի մասնակի համընկնումը, ներդրված միջակայքը և նույն միջակայքը մերժվում են, կիցը՝ թույլատրվում։ Այլ դպրոցում նույն ժամը թույլատրվում է։
- Այլ դպրոցի class/slot/subject/teacher կապերը մերժվում են նաև privileged SQL-ով՝ constraint-ի մակարդակում։
- Օգտագործվող entity-ի ջնջումը մերժվում է։ Archive-ը պահպանում է կապերը և զբաղվածության կանոնը։
- Publication revision-ը եզակի է դասարանի համար, այլ դպրոցին կապված class-ը մերժվում է։

### Իրավունքներ

- Admin և scheduler-ը ունեն միայն մատրիցում նշված իրավունքները։
- Դպրոց A-ի օգտատերը չի տեսնում B-ի rows-ը և չի կարող INSERT/UPDATE/DELETE կատարել B-ի համար։
- Դպրոց չունեցող authenticated օգտատերը և anon-ը չեն կարդում կամ փոփոխում draft-ը։
- Scheduler-ը չի փոփոխում time slots-ը, դպրոցի տվյալները կամ անդամակցությունը։
- Admin-ն էլ չի կարող իրեն ավելացնել այլ դպրոցում կամ browser-ից շրջանցել membership կառավարման սահմանը։
- Profiles-ի միջոցով role escalation հնարավոր չէ։
- School ID-ի տեղափոխմամբ, helper-ի ուղիղ կանչով կամ UPDATE-ի նոր row-ով իրավունքները չեն շրջանցվում։
- Publications-ի ուղղակի գրառումը և փոփոխումը մերժվում են բոլոր client դերերի համար։

### Միաժամանակյա գործողություններ

Առնվազն integration ստուգումով ապացուցել, որ երկու առանձին connection-ով նույն teacher/day/slot նշանակելիս միայն մեկը կարող է commit լինել։ Նույնը՝ համընկնող time slots ստեղծելու համար։ Թեստը չպետք է հիմնվի timing-ի պատահականության վրա. համակարգել transactions-ը և կիրառել timeout։

## 8. Գործարկման և ավարտի հերթականություն

1. Ստուգել միջավայրը և repository-ն։
2. Ավելացնել pinned CLI dependency, config և scripts։
3. Գրել schema, constraints, grants/RLS migrations-ը։
4. Ավելացնել local Auth fixtures, seed և թեստեր։
5. Գործարկել տեղային stack-ը և նոր disposable բազայի վրա կիրառել migrations-ը։
6. Անցկացնել tests և database lint, ուղղել իրական խնդիրները։
7. Նույն տեղային disposable բազան reset անելով կրկնել migrations+seed+tests՝ վերարտադրելիությունն ապացուցելու համար։
8. Ստուգել առկա frontend թեստերն ու build-ը, եթե tooling փոփոխությունները դրանց կարող են ազդել։
9. Գրավոր ներկայացնել ստեղծված ֆայլերը, գործարկման հրամանները, հաջող/չկատարված ստուգումները և հաջորդ փուլի սահմանը։

Docker-ի կամ dependency download-ի խոչընդոտի դեպքում ավարտել անկախ աշխատանքը, փորձել միջավայրի թույլատրված լուծումը և հստակ նշել չանցած ստուգումները։ Մի ներկայացնել SQL-ի աչքով վերանայումը որպես իրական database test։

## 9. Ավարտի չափանիշներ և հաջորդ փուլ

- Repository-ից հնարավոր է նոր տեղային Supabase բազա կառուցել migrations+seed-ով։
- Constraints-ը, դպրոցների մեկուսացումը և դերերը ապացուցված են tests-ով։
- Frontend-ը շարունակում է աշխատել իր գործող տեղային տվյալներով։ Դրանք այս աշխատանքը չի կարդում/ներմուծում/ջնջում որպես seed։
- Remote project-ում ոչինչ չի փոխվել։
- README-ը բավարար է տեղային միջավայրը նորից գործարկելու համար։

Հաջորդ հանձնարարությունը կլինի hosted development project-ի կապումը և նույն migrations-ի վերահսկվող կիրառումը, հետո՝ Teacher login/data adapter և տեղային տվյալների առանձին ներմուծում։ Publish-ը, anonymous Student read RPC-ն, cache-ի դասարանային բաժանումն ու timezone-ի Student վարքը հետագա առանձին փուլեր են։

## Պաշտոնական հղումներ

- [Տեղային մշակում և CLI](https://supabase.com/docs/guides/local-development)
- [Տեղային workflow և migrations](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Փորձնական տվյալներ](https://supabase.com/docs/guides/local-development/seeding-your-database)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Database functions](https://supabase.com/docs/guides/database/functions)
- [CLI commands](https://supabase.com/docs/reference/cli/overview)

Կոնկրետ CLI syntax-ը և պահանջվող տարբերակները իրականացման պահին ստուգել պաշտոնական փաստաթղթերով։
