# Mini App — ErffanHub dashboard

Plain HTML/CSS/JS. No framework, no bundler, no npm dependency.

## Build

```sh
node miniapp/build.js
```

This copies `index.html`, `app.css` and `app.js` into `miniapp/dist/`.
`tgcloud.jsonc` serves `dist/` (see the repo root README).

## How it works

The page loads the official Mini Apps SDK (`telegram-web-app.js`) and talks
to the bot only through `Telegram.WebApp.Serverless.call`. It never talks to
Cloudflare directly and never handles any secret.
