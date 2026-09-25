# Horarium Classium — ուղեցույց գործակալների համար

## Կիրառման շրջանակ

Այս ֆայլը վերաբերում է ամբողջ repository-ին։ Ենթապանակի `AGENTS.md`-ը լրացնում է այն և իր շրջանակում ունի առաջնահերթություն։ Student-ի փոփոխություններից առաջ կարդա նաև `apps/student/AGENTS.md`-ը։

## Նախագծի կառուցվածք

- `apps/student/` — Windows, macOS և Linux desktop հավելված՝ TypeScript, Vanilla HTML/CSS, Vite, Tauri 2 և Rust։ Դասացուցակի բեռնումը frontend-ում է, հիշեցումների scheduler-ը՝ Rust-ում։
- `apps/teacher/` — TypeScript և Vanilla HTML/CSS վեբ խմբագրիչ։ `src/model.ts`-ը պահում է մոդելն ու բախումների ստուգումները, `src/state.ts`-ը՝ վիճակի validation-ը, `src/main.ts`-ը՝ UI-ն։ `src/cloud-workspace.ts`-ը կատարում է ամպային տվյալների փոխակերպումն ու հերթագրված պահպանումը, `src/auth.ts`-ը՝ մուտքն ու դպրոցի բեռնումը։
- `supabase/` — PostgreSQL migrations, RLS, local seed և pgTAP թեստեր։ Teacher-ի ամպային շերտի հիմքն է. ընթացիկ Teacher frontend-ը օգտագործում է workspace RPC-ներ՝ պահպանելով RLS-ը և հնացած տարբերակների մերժումը։
- `.github/workflows/release.yml` — `v*.*.*` tag-ից Windows NSIS installer-ի կառուցում և GitHub Release-ի հրապարակում։ Սովորական push/PR-ի ավտոմատ ստուգումների վրա հույս մի դիր։

Root-ը npm workspace չէ։ Root-ը, Student-ը և Teacher-ը ունեն առանձին `package.json` ու `package-lock.json`։ Կախվածությունները տեղադրիր համապատասխան պանակում՝ `npm ci`-ով։ Փոխիր միայն տվյալ բաղադրիչի անհրաժեշտ dependencies-ն ու lockfile-ը։

## Ինչ կարդալ աշխատանքի սկզբում

- `README.md` — Student-ի վարք, գործարկում և փաթեթավորում։
- `TESTING.md` — ավտոմատ և յուրաքանչյուր OS-ի ձեռքով ստուգումներ։
- Teacher-ի համար՝ խնդրին համապատասխան `teacher-workspace-instructions.md`, `table-editor-instructions.md`, `subjects-teachers-instructions.md`։
- Բազայի համար՝ `supabase/README.md`, `supabase-foundation-instructions.md`, իսկ hosted միջավայրի համար՝ `supabase/HOSTED-DEVELOPMENT.md`։

`*-instructions.md` ֆայլերը նկարագրում են զարգացման փուլերի պահանջները. դրանք ինքնաբերաբար բոլոր հաջորդ փուլերն իրականացնելու հանձնարարություն չեն։ Փաստացի վիճակը ստուգիր կոդով, scripts-ով և workflow-ով. հին փաստաթղթերում կարող են մնացած լինել արդեն փոխված վարքի նկարագրություններ։

## Փոփոխությունների սկզբունքներ

- Պահպանիր առկա TypeScript/Vanilla HTML/CSS կառուցվածքը։ Framework կամ մեծ dependency մի ավելացրու առանց խնդրով հիմնավորված անհրաժեշտության։
- Հետևիր փոփոխվող ֆայլի ձևաչափին և անվանումներին։ Խուսափիր խնդրին չառնչվող վերաձևաչափումից ու refactor-ից։
- Պահպանիր հայերեն UI-ն, հասկանալի սխալներն ու դատարկ վիճակները։ Օգտատիրոջ մուտքագրած տեքստը մի տեղադրիր HTML-ում առանց անվտանգ մշակման։
- Մոդելի ու validation-ի logic-ը պահիր UI-ից անկախ՝ գոյություն ունեցող մոդուլներում։ Մի թուլացրու TypeScript ստուգումները՝ build-ը անցկացնելու համար։
- Արտաքին կամ պահպանված տվյալները ստուգիր օգտագործելուց առաջ։ Պահպանման սխալը չպետք է ներկայացվի որպես հաջող պահպանում։
- Նախքան խմբագրումը ստուգիր `git status`-ը և պահպանիր օգտատիրոջ առկա փոփոխություններն ու չհետևվող ֆայլերը։

## Տվյալների և հարթակների պայմանագրեր

### Student

- Պահպանիր Windows/macOS/Linux համատեղելիությունը և `apps/student/AGENTS.md`-ի հարթակային կանոնները։
- Հիշեցումները պետք է աշխատեն Rust scheduler-ից նաև թաքնված պատուհանով։ Մի տեղափոխիր դրանք միայն frontend timer-ների վրա։
- Cache/settings ֆայլերի ուղիները որոշիր Tauri-ի application-data API-ներով։ Student-ի համար browser-ի `localStorage` մի ներմուծիր։
- Պահպանիր դասացուցակի validation-ը, offline fallback-ը և ծանուցումների կրկնությունների կանխումը։ Teacher-ի ներքին մոդելը մի փոխանցիր Student-ին առանց հստակ համատեղելիության շերտի։

### Teacher

- Պահպանիր versioned պահոցը և հին տվյալների migration/backup ընթացքը։ Անվավեր կամ ավելի նոր schema-ի տվյալները լուռ մի վերագրիր դատարկ defaults-ով։
- Պահպանիր դասարանների, առարկաների, դասատուների ու դասաժամերի կապերի ամբողջականությունը և դասերի/դասատուների բախումների ստուգումները։
- Իրական հրապարակման մեխանիզմի բացակայության դեպքում մի ցուցադրիր կեղծ հաջող հրապարակում կամ «հրապարակված» կարգավիճակ։
- Auth, cloud persistence և տեղային տվյալների ներմուծումը առանձին աշխատանքներ են. դրանք մի ավելացրու տեղային խմբագրիչի փոքր փոփոխության շրջանակում։

### Supabase

- Արդեն deployed migrations-ը մի վերագրիր. schema-ի հետագա փոփոխությունների համար ավելացրու նոր migration։
- Պահպանիր դպրոցների տվյալների մեկուսացումը, RLS-ը, դերերի սահմանները և database constraints-ը։ Frontend validation-ը database-ի ստուգումներին փոխարինող չէ։
- `seed.sql`-ը և pgTAP թեստերը միայն տեղային միջավայրի համար են։ Hosted բազայի վրա մի գործարկիր local tests, reset կամ `--include-seed`։
- Remote գործողությունից առաջ ստուգիր linked project-ը և կարդա hosted ուղեցույցը։ Hosted Auth config-ի համար օգտագործվում է `supabase/environments/development`-ը. root-ի local config-ը մի ուղարկիր hosted միջավայր։
- Գաղտնաբառերը, tokens-ը, service-role keys-ը և `.env*.local`-ի պարունակությունը մի արտածիր log-երում, պատասխաններում կամ version control-ում։

## Գործարկում և ստուգումներ

Օգտագործիր Node.js 22.17+ կամ dependencies-ի պահանջներին համատեղելի ավելի նոր տարբերակ։ Student native աշխատանքի համար անհրաժեշտ են Rust stable և տվյալ OS-ի Tauri prerequisites-ը։ Local Supabase-ի համար անհրաժեշտ է աշխատող Docker-compatible runtime։

Teacher՝ `apps/teacher/` պանակից.

```sh
npm ci
npm run dev
# Փոփոխությունից հետո՝
npm test
npm run build
```

Student՝ `apps/student/` պանակից.

```sh
npm ci
npm run tauri dev
# Փոփոխությանը համապատասխան ստուգումներ՝
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked
cargo check --manifest-path src-tauri/Cargo.toml --locked
```

Student-ի `npm run dev`-ը միայն frontend preview է. native cache/settings/tray/audio ստուգումների համար պետք է Tauri shell-ը։ Native bundle-ը կառուցիր թիրախ OS-ում՝ `README.md`-ի հրամաններով։ Ռելիզի աշխատանքի ժամանակ ստուգիր տարբերակների համընկնումը՝ `npm run check:release-version -- vX.Y.Z`։

Supabase՝ repository root-ից.

```sh
npm ci
npm run supabase:start
npm run supabase:test
npm run supabase:lint
```

Մաքուր տեղային բազայով ամբողջական ստուգումը `npm run supabase:verify` է։ Այն նախ կատարում է `supabase:reset`, որը **ջնջում է տեղային բազայի տվյալները** և նորից կիրառում migrations/seed-ը։ Օգտագործիր միայն այն դեպքում, երբ այդ տվյալների վերաստեղծումը թույլատրելի է առաջադրանքի շրջանակում։

## Աշխատանքի ավարտ

- Գործարկիր փոփոխված բաղադրիչի համապատասխան ստուգումները։ Վարքի փոփոխության կամ սխալի ուղղման դեպքում ավելացրու իմաստալից regression test՝ առկա test runner-ով։ Միայն փաստաթղթի փոփոխությունը native build չի պահանջում։
- Օգտատիրոջ տեսանելի վարքի, գործարկման կամ ստուգման քայլերի փոփոխության դեպքում թարմացրու համապատասխան փաստաթղթերը։
- Նշիր՝ ինչ է փոխվել, ինչ ստուգումներ են անցել և ինչը չի ստուգվել։ Desktop-ի համար նշիր փաստացի ստուգված OS/architecture-ը. մեկ OS-ի build-ը մյուսների կամ ձեռքով ստուգումների ապացույց չէ։
