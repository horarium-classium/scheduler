# Tauri + Vanilla TS

This template should help get you started developing with Tauri in vanilla HTML, CSS and Typescript.

## Recommended IDE Setup


# Դասացուցակ (Horarium)

Փոքր Windows desktop application՝ շաբաթական դասացուցակը դիտելու և հետագայում դասերի մասին հիշեցումներ ստանալու համար։

## Technology

- Tauri 2
- Rust backend
- TypeScript, Vanilla HTML և CSS
- Vite և npm
- Official Tauri notification և autostart plugins
- Schedule data loaded from the GitHub Gist

React, Vue, Svelte, Angular և UI framework-ներ չեն օգտագործվում։

## Prerequisites

- Node.js և npm
- Rust և Cargo՝ `stable-x86_64-pc-windows-msvc` toolchain-ով
- Windows WebView2 Runtime

## Development

```powershell
npm install
npm run tauri dev
```

Frontend-only build-ը ստուգելու համար՝

```powershell
npm run build
```

Windows application bundle ստեղծելու համար՝

```powershell
npm run tauri build
```

## Structure

```text
src/
	main.ts          # Main window rendering and notification test button
	schedule.ts      # Gist loader, validation, and Armenian day names
	scheduler.ts     # Timer and duplicate-notification protection
	notifications.ts # Native notification wrapper
	audio.ts         # Sound placeholder
	speech.ts        # Browser speechSynthesis wrapper
	tray.ts          # Frontend tray boundary placeholder
	settings.ts      # Autostart wrapper
	types.ts         # Lesson and DaySchedule interfaces
	style.css        # Plain application styles
src-tauri/
	src/lib.rs       # Tauri plugins and system tray menu
	capabilities/    # Minimal plugin permissions
```

## Implemented

- Armenian sample schedule displayed in the main window.
- The current day's lessons are loaded from the versioned GitHub Gist at startup.
- The scheduler checks every 30 seconds for lesson starts and ends.
- Start and end notifications are sent at most once per lesson and day.
- Native notification test button with permission handling.
- System tray menu with `Բացել` and `Ելք` actions.
- Notification and autostart plugins installed and configured.
- Autostart remains disabled unless enabled through the future Settings UI.

## TODO

- Load and edit a complete weekly schedule.
- Add a local cache or bundled fallback for offline startup.
- Hide the window to the tray when it is closed.
- Connect sound and speech settings to the tray/UI.
- Add Windows autostart settings UI.
- Test native notifications in an installed Windows build.
