# Teacher — դասացուցակի խմբագրիչ

## Տեղային գործարկում

Node.js 22.17+ տարբերակով, `apps/teacher` պանակից՝

```sh
npm ci
npm run dev
```

Ստուգումներ՝ `npm test` և `npm run build`։

## GitHub Pages

`.github/workflows/teacher-pages.yml`-ը ստուգում և կառուցում է հավելվածը։
`master`-ի push-ի ժամանակ, եթե փոխվել է `apps/teacher/**` կամ workflow-ը,
այն նաև հրապարակում է `dist`-ը GitHub Pages-ում։ Pull request-երի դեպքում
կատարվում են միայն ստուգումն ու build-ը։ Actions-ից կարելի է նաև ձեռքով
գործարկել **Teacher Pages** workflow-ը՝ ընտրելով `master`։

Առաջին հրապարակման համար repository-ի **Settings → Pages → Build and deployment → Source**
դաշտում ընտրել **GitHub Actions**, ապա workflow-ը հասցնել `master` և գործարկել։

Սպասվող հասցեն՝ https://armenbadal.github.io/horarium-classium/ ։
Հրապարակման իրական հասցեն ու արդյունքը տեսանելի են workflow-ի `github-pages` environment-ում։

Pages build-ը կիրառում է `--base=/horarium-classium/`, որպեսզի JS/CSS հղումներն
աշխատեն repository-ի ենթահասցեից։ Տեղային development-ի հասցեն չի փոխվում։
Repository-ն վերանվանելու կամ custom domain օգտագործելու դեպքում թարմացնել այդ base-ը։

Նույն build-ը տեղում ստուգելու համար՝

```sh
npm run build -- --base=/horarium-classium/
npm run preview -- --base=/horarium-classium/
```

Բացել preview-ի `/horarium-classium/` հասցեն, ստուգել խմբագրիչը, կարգավորումները
և էջի վերաբեռնումը։ Student-ի release-ը կառավարվում է առանձին workflow-ով։

## Մուտք և հաշիվներ

Առանց ակտիվ session-ի բացվում է email/գաղտնաբառ մուտքի էջը։ Supabase-ը
ստուգում է օգտատիրոջը մինչև խմբագրիչի բեռնումը։ Ակտիվ session-ը պահպանվում է,
վերաբեռնումից հետո ստուգվում է, իսկ «Ելք»-ը վերադարձնում է մուտքի էջ։
Public signup չկա. օգտագործեք ադմինիստրատորի ստեղծած և ակտիվացված հաշիվը։
Հրավերի `activate.html` էջը գաղտնաբառ սահմանելուց հետո հղում է մուտքի էջին։

Սահմանեք `VITE_SUPABASE_URL` և `VITE_SUPABASE_PUBLISHABLE_KEY` build-ի պահին
(տեղում՝ `.env.local`, Pages-ում՝ նույնանուն Actions Variables)։
Օրինակը՝ `.env.example`։ Կոդում development project-ի հասցե կամ բանալի ամրացված չէ։
Երբեք մի օգտագործեք service-role կամ secret key frontend-ում։ Նույն build variables-ը
Vite-ը փոխանցում է նաև `activate.html` հրավերի էջին։

## Ամպային աշխատանքային տարածք

Մուտքից հետո ծրագիրը բեռնում է օգտատիրոջ `school_members` անդամակցությունները։
Մեկ դպրոցի դեպքում այն բացվում է անմիջապես, մի քանիսի դեպքում տրվում է ընտրություն։
Անդամակցություն չունեցող հաշվի համար ցույց է տրվում բացատրություն, կրկին փորձելու
հնարավորություն և «Ելք»։ Սերվերի սխալը չի փոխարինվում դատարկ կամ demo տվյալներով։

Դպրոցի անունը, ժամային գոտին, դասարանները, դասաժամերը, առարկաները, դասատուներն ու
դասերը բեռնվում և պահպանվում են Supabase-ում։ Դատարկ դպրոցը մնում է դատարկ։
`cloud-workspace.ts`-ը փոխակերպում է բազայի UUID-ները խմբագրիչի ներքին թվային ID-ների՝
պահպանելով կապերն ու առկա public ID-ները։ Յուրաքանչյուր պահպանում փոխանցում է միայն
փոփոխված տողերը մեկ transaction-ով, գործող RLS կանոնների ներքո։

- Admin-ը կարող է փոխել դպրոցի կարգավորումները։
- Scheduler-ը կարող է կառավարել դասարաններն ու դասաժամերը, խմբագրել առարկաները, դասատուներն ու դասերը։
- Membership-ների փոփոխությունը frontend-ից հասանելի չէ։ Admin-ը և scheduler-ը կարող են հրապարակել ընտրված դասարանը։

«Պահպանված է ամպում» նշումը հայտնվում է միայն սերվերի հաստատումից հետո։ Արագ
հաջորդող փոփոխությունները հերթագրվում են։ Սխալի դեպքում սևագիրը մնում է հիշողության
մեջ և նշվում է որպես չպահպանված փոփոխություն։
Էջը փակելիս կամ ձեռքով ելք կատարելիս չպահպանված փոփոխության մասին զգուշացվում է։
Երկրորդ ներդիրում/սարքում փոփոխված տարբերակը լուռ չի վերագրվում. տարբերակների
հակասության դեպքում նախ ներբեռնեք ձեր սևագիրը, հետո բեռնեք սերվերի տարբերակը։
Ավտոմատ միավորում, realtime համատեղ խմբագրում և offline queue դեռ չկան։

Teacher-ը localStorage տվյալներ չի կարդում և չի ներմուծում։ Ամպային սևագիրը
հրապարակված դասացուցակ չէ։ «Հրապարակել»-ը ստեղծում է ընտրված դասարանի առանձին անփոփոխ տարբերակը։ Student-ի աղբյուրը դեռ չի փոխվել։

Պահանջվող migration՝ `supabase/migrations/202609230001_teacher_workspace.sql`։
Այն պետք է կիրառված լինի մինչև նոր frontend-ի հրապարակումը։

Ստուգումներ՝ `npm test` և `npm run build`։ Տեղային Supabase-ը գործարկելուց,
migration-ները կիրառելուց և root dependencies-ը տեղադրելուց հետո կարող եք նաև
գործարկել `node --experimental-strip-types tests/cloud-api.local.mjs`։ Այն ընդունում
է միայն localhost/127.0.0.1 հասցե, օգտագործում է local seed հաշիվը և վերջում հեռացնում
է իր փորձնական դասարանը։ Hosted բազայի դեմ այդ թեստը մի գործարկեք։

Ձեռքով ստուգել՝ մուտք, դպրոցի ընտրություն/անդամակցության բացակայություն,
դասարանի և դասի ավելացում, երկրորդ browser-ից նոր տվյալների բեռնում,
հնացած ներդիրից պահպանման հակասություն, կապի կորուստ և ելք։

Workflow-ի առաջին հաջող remote գործարկումը և հրապարակված էջի ստուգումը
պետք է կատարել GitHub-ում. տեղային build-ի հաջողությունը հրապարակման հաստատում չէ։

## Կարգավորումների կառավարում

Առարկաները ցուցադրվում են կոմպակտ ցանկով՝ գույնը և անվանումը։ Առարկայի վրա
սեղմելիս բացվում է միայն այդ տողի խմբագրիչը՝ անվան, գունապնակի, չեղարկման,
պահպանման և ջնջման գործողություններով։ Նոր առարկան օգտագործում է նույն
ներտողային խմբագրիչը։ Ընտրված գույնը նշված է եզրագծով, իսկ գունապնակից դուրս
պահպանված գույնը նույնպես հասանելի է։ Դասատուներն ու դասաժամերը ևս ցուցադրվում
են կոմպակտ ցանկերով և բացվում են մեկ ներդրված խմբագրիչով։ Նոր գրառումները
ստեղծվում են նույն խմբագրիչով, իսկ ջնջումը հասանելի է միայն դրա ներսում։
Դասաժամերի սկիզբն ու ավարտը խմբագրվում են կոմպակտ ժամային դաշտերում։

Ձեռքով ստուգել նաև նեղ էկրանով և ստեղնաշարով՝ գույնի ընտրություն, պահպանումից
հետո գույնի ցուցադրում դասացուցակում, օգտագործվող գրառման ջնջման մերժում,
դասաժամի ավելացում/փոփոխում և ոչ ադմինիստրատորի սահմանափակումներ։

## Հրապարակում

Նախ կիրառել `202609240001_publication.sql` migration-ը։ «Հրապարակել»-ը միանում է միայն սևագրի հաջող պահպանման ավարտից հետո։ Ընթացքում խմբագրումը ժամանակավորապես արգելվում է։ Դատարկ դասացուցակի համար պահանջվում է հաստատում։ Սխալը չի ներկայացվում որպես հաջողություն, իսկ կորած պատասխանի դեպքում կարելի է կրկին փորձել նույն հրապարակումը։

Դասարանները ցույց են տալիս «Դեռ չի հրապարակվել», «Հրապարակված է» կամ «Չհրապարակված փոփոխություններ»։ Կարգավիճակի հուշումը ցույց է տալիս վերջին revision-ը և ժամանակը։ Գույնը, դասատուն ու մեկնաբանությունը նույնպես մասնակցում են փոփոխության հաշվարկին, բայց Student-ի հանրային payload-ում չեն հայտնվում։ Հին backend-ի դեպքում հրապարակումը մնում է անհասանելի։

RPC contract-ը, անանուն ընթերցումն ու ստուգումները՝ [PUBLICATION.md](../../supabase/PUBLICATION.md)։ Հանրային API-ն առկա է, Student-ի Gist աղբյուրի փոխարինումը հաջորդ փուլն է։

## Invite flow fix — pending deployment

The activation page handles invite/recovery callbacks with isolated in-memory credentials; it does not replace an existing browser login. Old invitation callbacks landing at the main page are forwarded to `activate.html` before normal authentication. After password setup, use the normal login page (sign out first if another account is already logged in). Missing/expired links require a new invitation; a page refresh clears the transient activation credentials. School membership must be assigned separately.

The hosted configuration now declares `activate.html` as Site URL. This local declaration has NOT been applied remotely. First publish and verify the Teacher Pages build, including activation assets under `/horarium-classium/`; then inspect the linked project's hosted config diff and apply only the intended URL changes. Preserve the default Invite email `{{ .ConfirmationURL }}` template. Do not push the root local Supabase config.

Verify one new Dashboard invitation end to end, an old still-valid root redirect, expired/reused links, recovery, password rejection/network retry, and a browser already signed into a different account. Confirm that an unassigned user sees the membership message. Email rate limiting is separate; avoid repeated invitation sends.

Scheduler-ի դասաժամերի կառավարումը պահանջում է `202609250001_scheduler_time_slots.sql` migration-ը։ Նախ կիրառել migration-ը, ապա հրապարակել Teacher-ը։
