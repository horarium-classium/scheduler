# Multiplatform verification

## Ավտոմատ ստուգումներ

`apps/student` պանակից՝ բոլոր երեք OS-երում․

```sh
npm ci
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked
cargo check --manifest-path src-tauri/Cargo.toml --locked
```

Native փաթեթավորումը գործարկեք համապատասխան OS-ում․

| OS | Հրաման |
| --- | --- |
| Windows | `npm run tauri build -- --bundles msi,nsis` |
| macOS | `npm run tauri build -- --bundles app,dmg` |
| Ubuntu/Xubuntu | `npm run tauri build -- --bundles deb,appimage` |

Սովորական push/PR-ի համար GitHub Actions չի գործարկվում։ `vX.Y.Z` tag-ի push-ից [Windows release](.github/workflows/release.yml)-ը `windows-latest` runner-ում կատարում է ստուգումները, կառուցում միայն NSIS installer և կցում GitHub Release-ին։ Ռելիզից առաջ տեղային գործարկել `npm run check:release-version -- vX.Y.Z` և համոզվել, որ tag-ի տարբերակը համընկնում է `package.json`-ի ու `src-tauri/tauri.conf.json`-ի տարբերակներին։ CI-ն չի փորձում headless runner-ում հաստատել toast, tray, audio կամ speech վարքը։

Ռելիզից առաջ տեղային ստուգել `npm run check:release-version -- vX.Y.Z` հրամանը։ Այն պետք է հաջողվի միայն այն դեպքում, երբ tag-ի տարբերակը համընկնում է և՛ `package.json`-ի, և՛ `src-tauri/tauri.conf.json`-ի տարբերակներին։ Tag-ի push-ից հետո ստուգել, որ `Windows release` workflow-ը հաջող է, GitHub Release-ը ստեղծվել է, իսկ կցված MSI-ն ներբեռնվում և տեղադրվում է Windows-ում։

TypeScript թեստերը ծածկում են validation/cache/timeout, current-next summary և speech-ի բացակայությունը։ Rust թեստերը՝ scheduler-ի նախազգուշացում, ավարտի հատում, հաջորդ դաս, կրկնությունների կանխում, sleep/wake/կեսգիշեր, JSON persistence և sound-disabled վարք։ Bundled PCM ֆորմատն ու audio sample-ները ստուգվում են առանց ֆիզիկական audio device-ի։

## Ընդհանուր functional checklist

Ստորևի քայլերը կրկնել **յուրաքանչյուր OS-ում** և արդյունքը գրանցել տվյալ հարթակի բաժնում։ Թեստի համար հանրային Gist-ը մի փոփոխեք։ Կարելի է պահուստավորել Tauri `app_data_dir()/schedule-v1.json`-ը, տեղադրել այսօր սկսվող կարճ վավեր դասեր և offline գործարկել հավելվածը։ Վերջում վերականգնել cache-ը։

- [ ] Առցանց startup-ը բեռնում է դասացուցակը և պահում cache-ը՝ առանց աղբյուրի ու թարմացման ժամի տողի։
- [ ] Offline restart-ը օգտագործում է cache-ը՝ «պահված տարբերակ» նշումով։
- [ ] Առանց cache-ի և կապի կա հասկանալի error ու կրկին փորձելու հնարավորություն։
- [ ] Invalid time/day/name/overlap և վնասված cache-ը չեն փոխանցվում scheduler-ին։
- [ ] Գլխավոր պատուհանում «Թարմացնել» և «Կարգավորումներ» գործողություններ չկան։ Tray-ում ձեռքով թարմացման կետ չկա։ Գործարկման ժամանակ դասացուցակը բեռնվում է UI/cache/scheduler-ում։
- [ ] Կարգավորումների դիալոգ չկա։ Tray-ի երեք անջատիչները փոխում են համապատասխան կարգավորումները, իսկ պահպանման սխալի դեպքում նշումները վերականգնվում են և գլխավոր պատուհանում երևում է սխալը։
- [ ] Փոփոխված դասացուցակը ստանալու համար վերագործարկել ծրագիրը. ցանցի անհասանելիության դեպքում օգտագործվում է պահված տարբերակը։
- [ ] Current/next summary-ն, progress-ը և ազատ օրվա վիճակը ճիշտ են, նաև օրափոխությունից հետո։
- [ ] Settings-ը պահպանվում է restart-ից հետո, tray checkmarks-ը համապատասխանում են պահպանված վիճակին։
- [ ] Հայերեն voice-ի դեպքում խոսքը հայերեն է, միայն անգլերենի դեպքում՝ անգլերեն առանց դասանունների, իսկ երկուսի կամ speech API-ի բացակայության դեպքում խոսքը բաց է թողնվում։
- [ ] Օրվա փոփոխությամբ հին notification key-երը հեռացվում են, կեսգիշերի նախազգուշացումը չի կրկնվում։

## Windows manual checklist

OS/version/architecture, build revision և ամսաթիվ՝ **չստուգված**։

- [ ] NSIS build, առանց administrator իրավունքի current-user install, launch, uninstall և WebView2 առկայություն։
- [ ] Նոր գիրք/ժամացույց icon-ը երևում է installer-ում, Start/taskbar-ում և tray-ում՝ light/dark theme ու տարբեր scaling-ով։
- [ ] Native system notification՝ նախազգուշացում, ավարտ, ընթացող դասի ընթացքում startup և duplicate suppression։ Ստուգել notification permissions/Do Not Disturb-ը։
- [ ] System tray՝ Close → hide, Open, Refresh, կարգավորումների անջատիչներ, Quit։
- [ ] Launch at login՝ ավտոմատ գրանցում առաջին և հաջորդ մեկնարկներին, հաջորդ login-ից գործարկում, նաև հին false կարգավորումներով։
- [ ] Start minimized՝ սովորական launch/login առանց window flash-ի, tray-ից վերադարձ։
- [ ] Sleep/wake՝ բաց թողնված start/end և կեսգիշեր, յուրաքանչյուր event միայն մեկ անգամ։
- [ ] Sound՝ տեսանելի/թաքնված պատուհան, on/off, համաժամանակյա զանգերի միավորում, volume mixer, audio device-ի անջատում և հաջորդ զանգի վերականգնում։
- [ ] Speech՝ WebView2, հայերեն voice-ի առկայությամբ և առանց դրա, speech-disabled և ընթացիկ խոսքի cancellation։
- [ ] Notifications-disabled՝ նոր native notification, զանգ և խոսք չեն գործարկվում։
- [ ] Ընդհանուր functional checklist-ը կատարված է։

## macOS manual checklist

OS/version/architecture, build revision և ամսաթիվ՝ **չստուգված**։

- [ ] `.app`/`.dmg` build, drag-install, launch և uninstall։ Ստորագրում/notarization-ը ստուգել տարածման փուլում։
- [ ] Նոր icon-ը երևում է Finder/Dock-ում, իսկ menu bar-ի template icon-ը ընթեռնելի է light/dark mode-ում և Retina/non-Retina էկրաններին։
- [ ] Native system notification՝ Notification Center, permissions/Focus, նախազգուշացում/ավարտ և duplicate suppression։
- [ ] Menu bar tray՝ Close → hide, Open, Refresh, կարգավորումների անջատիչներ, Quit։ Dock reopen-ը վերադարձնում է պատուհանը։
- [ ] Launch at login՝ LaunchAgent ավտոմատ գրանցում և logout/login-ից հետո փաստացի գործարկում։
- [ ] Start minimized՝ launch/login առանց window flash-ի, tray և Dock reopen։
- [ ] Sleep/wake՝ missed start/end, կեսգիշեր, կրկնությունների բացակայություն։
- [ ] Sound՝ native output, on/off, թաքնված պատուհան, output device-ի փոփոխություն/անջատում և վերականգնում։
- [ ] Speech՝ WKWebView, հայերեն voice-ի առկայությամբ և առանց դրա, hidden window և cancellation։
- [ ] Notifications-disabled՝ բոլոր նոր ազդանշաններն անջատված են։
- [ ] Ընդհանուր functional checklist-ը կատարված է։

## Linux — Ubuntu/Xubuntu manual checklist

Distro/version, desktop session (GNOME/XFCE), X11/Wayland, architecture, revision և ամսաթիվ՝ **չստուգված**։ Կրկնել Ubuntu և Xubuntu միջավայրերում։

- [ ] `.deb`/`.AppImage` build, install/run և uninstall։ Ստուգել WebKitGTK/ALSA runtime dependencies-ը և AppImage-ի պահանջները տվյալ distro-ում։
- [ ] Նոր icon-ը երևում է launcher-ում և GNOME/XFCE tray-ում՝ light/dark panel-ներով ու տարբեր scaling-ով։
- [ ] Native system notification՝ session notification daemon-ի միջոցով, pre-alert/end, Do Not Disturb և duplicate suppression։
- [ ] Tray՝ AppIndicator/StatusNotifier-ը երևում է GNOME/XFCE panel-ում, menu-ի Open/Refresh/կարգավորումների անջատիչներ/Quit-ը աշխատում են։ Raw tray click event չի պահանջվում։
- [ ] Tray-ի ստեղծման սխալի դեպքում app-ը մնում է տեսանելի․ Close-ը չի թաքցնում այն անհասանելի վիճակում։ Ստուգել նաև panel-ի բացակայության սահմանափակումը։
- [ ] Launch at login՝ desktop autostart entry-ի ավտոմատ գրանցում, հաջորդ graphical login, AppImage-ի կայուն ուղի։
- [ ] Start minimized՝ միայն գործող tray-ով, login և սովորական launch, menu-ից վերականգնում։
- [ ] Sleep/wake՝ missed start/end, կեսգիշեր և duplicate suppression։
- [ ] Sound՝ ALSA/default output՝ տվյալ համակարգի PulseAudio/PipeWire ինտեգրմամբ, on/off, թաքնված պատուհան, սարքի փոփոխություն/անջատում և վերականգնում։
- [ ] Speech՝ WebKitGTK API/voice availability։ Հայերեն voice-ի բացակայության դեպքում crash չկա։ Առկայության դեպքում՝ hidden window և cancellation։
- [ ] Notifications-disabled՝ նոր notification, զանգ և խոսք չեն գործարկվում։
- [ ] Ընդհանուր functional checklist-ը կատարված է։

## Փաստացի ստուգումների սահմանները

Icon-երի փոխարինումից հետո առանձին անցել են `npm run icons`, `npm run build` և macOS x86_64 `cargo check --offline` ստուգումները։ Գեներացված app/tray PNG-ները դիտվել են, ICO/ICNS ֆայլերի ձևաչափերը՝ ստուգվել։ Նոր icon-երով native bundle build և երեք OS-ի desktop manual ստուգումներ դեռ չեն կատարվել։ Ստորևի bundle արդյունքը վերաբերում է նախորդ cross-platform փոփոխություններին։

Այս փոփոխությունները ստուգվում են macOS `x86_64-apple-darwin` միջավայրում։ Windows target/VM չկա, իսկ տեղադրված Docker client-ի daemon-ը չի աշխատում, հետևաբար տեղային Linux build նույնպես չի կատարվել։ Remote CI դեռ չի գործարկվել։ Browser/լսողական/desktop manual checklist-երը չեն համարվում անցած ավտոմատ թեստերից կամ build-ից։

Այս cross-platform փոփոխություններից հետո անցած տեղային ստուգումներ․

| Ստուգում | Արդյունք |
| --- | --- |
| `npm test` | 8 թեստ՝ հաջող |
| `npm run build` | Հաջող |
| `cargo test --manifest-path src-tauri/Cargo.toml --lib --offline` | 14 թեստ՝ հաջող |
| `cargo check --manifest-path src-tauri/Cargo.toml --offline` | Հաջող՝ macOS x86_64 |
| `npm run tauri build -- --bundles app,dmg` | Հաջող՝ macOS x86_64 `.app` և `.dmg` |
| Workflow YAML parsing | Հաջող, remote job-երը չեն գործարկվել |
| Windows / Linux native builds | Այս միջավայրում չեն կատարվել |

### Speech fallback regression (յուրաքանչյուր OS-ում առանձին)

- Windows / WebView2՝ ստուգել հայերենը, միայն անգլերենը և երկու լեզուների բացակայությունը։
- macOS / WKWebView՝ կրկնել նույն երեք դեպքերը նաև թաքնված պատուհանով։
- Ubuntu/Xubuntu / WebKitGTK՝ կրկնել նույն դեպքերը, ներառյալ անհասանելի speech API-ն։
- Յուրաքանչյուր հարթակում ստուգել `voiceschanged`-ով ուշ բեռնվելը, 5 վայրկյանից հետո հին խոսքի չկրկնվելը և սպասման ընթացքում «Խոսք»/«Ծանուցումներ» անջատելը։
- Փորձնական ծանուցումը և scheduler-ի նախազգուշացումը, սկիզբը, ավարտը պետք է ընտրեն նույն լեզվային քաղաքականությունը. անգլերենը չի արտասանում հայերեն դասանունները։

### «Կաքավիկ» զանգ

- Windows, macOS և Ubuntu/Xubuntu հարթակներից յուրաքանչյուրում փորձնական ծանուցմամբ հաստատել, որ հնչում է «Կաքավիկ»-ի 6 նոտանոց մոտիվը՝ մոտ 2 վայրկյան, առանց կտտոցների։ Կրկնել թաքնված պատուհանով և «Ձայն» անջատված վիճակում։
