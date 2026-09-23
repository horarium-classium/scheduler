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

Teacher-ը դեռ պահում է տվյալները տվյալ browser-ի `localStorage`-ում։
Տեղային հասցեի տվյալներն ինքնաբերաբար չեն տեղափոխվում հրապարակված հասցե։
Այս հրապարակումը Supabase Auth կամ ամպային պահպանում չի միացնում, և Supabase
բանալիներ կամ Actions Variables այս փուլում պետք չեն։

Workflow-ի առաջին հաջող remote գործարկումը և հրապարակված էջի ստուգումը
պետք է կատարել GitHub-ում. տեղային build-ի հաջողությունը հրապարակման հաստատում չէ։
