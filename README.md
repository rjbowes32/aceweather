# AceWeather

AceWeather is a visually rich weather dashboard powered by Open-Meteo by default, with optional Meteomatics augmentation if you provide credentials.

## Features

- Search for places globally using Open-Meteo geocoding
- Current conditions, hourly forecast, and 14-day outlook
- Air quality, sun cycle, wind, humidity, pressure, UV, cloud layers, and soil data
- Historical daily weather for the last 30 days
- Same-period historical comparison across recent years
- Optional Meteomatics provider panel through Python-side credentials

## Run The Python API

```bash
python server.py
```

Then open [http://localhost:8000](http://localhost:8000).

## Run The Next.js Frontend

Install dependencies and start the frontend:

```bash
npm install
npm run dev
```

The Next.js app expects the Python weather API to be running. By default, Next proxies `/api/*` to the local Python server at `http://127.0.0.1:8000`, so the frontend can behave like one app on `http://localhost:3000`.

Set `.env.local` from `.env.example` if you want to override the backend target or point the frontend at a different API host:

```bash
ACEWEATHER_API_PROXY_TARGET=http://127.0.0.1:8000
NEXT_PUBLIC_ACEWEATHER_API_BASE=
```

Then open [http://localhost:3000](http://localhost:3000).

## Open It On Your Phone

To make the local dev server reachable from your phone on the same Wi-Fi network, start it with:

```powershell
$env:ACEWEATHER_HOST="0.0.0.0"
python server.py
```

The server will print both:

- the local desktop URL
- the LAN URL to open on your phone

If you need a different port:

```powershell
$env:ACEWEATHER_HOST="0.0.0.0"
$env:ACEWEATHER_PORT="8080"
python server.py
```

## Optional Meteomatics credentials

Set these environment variables before starting the server:

```powershell
$env:METEOMATICS_USERNAME="your-username"
$env:METEOMATICS_PASSWORD="your-password"
python server.py
```

If credentials are absent, the app still works fully with Open-Meteo.
