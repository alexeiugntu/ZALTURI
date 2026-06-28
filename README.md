# ZALTURI — сайт

Статический сайт (HTML/CSS/JS, без сборки). Готов под GitHub Pages + домен `zalturi.com`.

8-бит / CRT эстетика, английский язык, SEO «под ключ» (мета, Open Graph, Twitter,
JSON-LD, sitemap, robots, манифест), пиксель-арт персонаж на главной, постоянный
виджет интернет-радио и аркада с двумя играми (Pac·Man с онлайн-таблицей рекордов и
ZALTURI Runner).

## Структура

```
zalturi-site/
├── index.html                 ← главная (hero, дом-эквалайзер, кликабельные плитки PROJECT FILE, тизеры)
├── about/index.html           ← манифест (длинный SEO-контент + FAQ)
├── arcade/index.html          ← хаб аркады (карточки игр + живые превью)
├── arcade/pacman/index.html   ← Pac·Man (Supabase-рекорды)
├── arcade/runner/index.html   ← ZALTURI Runner
├── tools/index.html           ← хаб аудио-инструментов
├── tools/analyzer/index.html  ← аудио-анализатор + cdn/ (движок, TF.js, Essentia, модели ~53 МБ)
├── tools/tuner/index.html     ← гитарный тюнер (YIN, микрофон)
├── tools/autotune/index.html  ← автотюн (запись/коррекция/реверб → WAV)
├── assets/
│   ├── css/base.css           ← дизайн-система (+ пиксельный курсор)
│   ├── js/pixelate.js         ← «оживающий» пиксель-персонаж
│   ├── js/equalizer.js        ← дом-эквалайзер «The block»
│   ├── js/radio.js            ← ZALTURI PIRATE STATION: постоянный radio shell + виджет
│   ├── fonts/*.woff2           ← Press Start 2P + VT323 (self-host)
│   └── img/*                   ← персонаж, og.png, фавикон (лицо в ушанке), cursor.png
├── sitemap.xml  robots.txt  site.webmanifest  404.html  CNAME  .gitignore
└── README.md
```

## Перед пушем — чеклист

- [x] Все 10 страниц отдают контент, внутренние ссылки целы, sitemap (9 URL) совпадает с файлами.
- [x] У каждой страницы `<title>` / `description` / canonical / OG (у `404` — только title, она `noindex`).
- [x] Секретов в коде нет (ключ Supabase — *publishable*, публичный по дизайну).
- [x] `console.log` в нашем коде — 0; `.DS_Store` исключён через `.gitignore`.
- [x] Мобильная адаптация проверена (нав стекается, игры/инструменты/дом масштабируются).

**Заметки по деплою:**
- **Размер ~53 МБ** — почти весь это модель жанров анализатора (`tools/analyzer/cdn/genre-discogs400`, 11×4 МБ). GitHub Pages держит, но это тяжёлый репозиторий, и модель качается в браузер при первом «определить жанр» (потом из кэша). Ядро анализа и тюнер/автотюн её не требуют. При желании — вынести `genre-discogs400/` на отдельный CDN/бакет и поправить путь в `tools/analyzer/cdn/lib/analyzer-app-v5.js`.
- **Микрофон** (тюнер, автотюн) и таблица рекордов Pac·Man требуют **HTTPS** — на GitHub Pages с доменом это есть; локально работает только `http://localhost` (secure context).
- После привязки домена включи **Enforce HTTPS** в Settings → Pages.

**Проверки после деплоя:** открой `/`, `/tools/analyzer/` (брось трек), `/tools/tuner/` и `/tools/autotune/` (дай микрофон), `/arcade/pacman/` (рекорд сохраняется онлайн), и глянь фавикон (лицо в ушанке) во вкладке.

## Локальный предпросмотр

Из папки `zalturi-site` (важно — с корня, чтобы пути `/assets/...` работали):

```bash
cd zalturi-site
python3 -m http.server 8000
# открыть http://localhost:8000
```

> Открывать как `file://` нельзя — пиксель-эффект и таблица рекордов требуют http.

## Деплой на GitHub Pages (бесплатно)

1. Создай новый репозиторий на GitHub (например `zalturi`).
2. Залей **содержимое** папки `zalturi-site` в корень репозитория (не саму папку).
3. Settings → Pages → Source: `Deploy from a branch`, ветка `main`, папка `/ (root)`.
4. Через минуту сайт будет на `https://<логин>.github.io/<репо>/`.

### Домен zalturi.com

Файл `CNAME` уже лежит в корне (`zalturi.com`). После покупки домена пропиши DNS:

```
A     @   185.199.108.153
A     @   185.199.109.153
A     @   185.199.110.153
A     @   185.199.111.153
CNAME www <логин>.github.io
```

Затем в Settings → Pages укажи Custom domain `zalturi.com` и включи **Enforce HTTPS**.
Канонические ссылки/OG уже настроены на `https://zalturi.com`.

> Пока домена нет, сайт удобнее всего смотреть локально (см. выше). На временном
> адресе `github.io/<репо>/` абсолютные пути `/assets/...` не подхватятся — это норма,
> после привязки домена всё встанет на место.

## Где что менять

| Что | Файл |
|---|---|
| Базовый/канонический URL | поиск-замена `https://zalturi.com` по всем файлам |
| Плейлист SoundCloud (плеер) | `index.html` → `iframe ... playlists%253A2258423573` |
| Ссылки SoundCloud | в шапке/подвале всех страниц (`soundcloud.com/zalturi`) |
| Ссылка на скачивание | `disk.yandex.ru/d/LQxYDO_lA7LHRQ` (везде) |
| Поток ZALTURI PIRATE STATION | `assets/js/radio.js` → `STREAM_URL`. Сейчас используется базовый SurferNetwork stream URL без короткоживущего `zt`-токена |
| Таблица рекордов Pac·Man | `arcade/pacman/index.html` → `SB_URL` / `SB_KEY` (Supabase, publishable-ключ — публичный по дизайну) |
| Картинка персонажа | `assets/img/zalturi-character.png` |
| Сила пикселизации персонажа | атрибуты `data-cols` / `data-cell` у `<img data-pixelate>` в `index.html` |
| Дом-эквалайзер «The block» | `assets/js/equalizer.js` — 9 этажей (`COLS`/`FLOORS`), палитра, динамика. Эквалайзер при play (SoundCloud Widget API). Жильцы/коты (прыгают на подоконник)/прохожие силуэты/качающиеся шторы/лампы-ТВ анимируются; квартиры и балконы генерятся детерминированно (seed `mulberry(...)`). Интерактив (плеер не трогает): наведение мыши = «фонарик» по окнам в радиусе (`Rr` в `torch()`), частые клики = больше окон загорается (`clickCharge`) |
| Текст манифеста / FAQ | `about/index.html` (не забудь обновить и JSON-LD `FAQPage`) |

> **Дом-эквалайзер:** реальный FFT со звука SoundCloud недоступен (iframe кросс-доменный). Через SoundCloud Widget API ловится play/pause, а спектр процедурный — «музыкально-похожий», медленный и тёплый. Клик по дому = ручная подсветка (и фолбэк, если виджет заблокирован).

## Добавить новую игру в аркаду

1. Создай `arcade/<game>/index.html` по образцу `runner` (шапка/подвал/SEO-голова).
2. Добавь карточку в `arcade/index.html` и пункт в JSON-LD `CollectionPage`.
3. Добавь URL в `sitemap.xml`.

## Что включено по SEO

- Уникальные `<title>` / `description` / canonical на каждой странице.
- Open Graph + Twitter Card + `og.png` (1200×630).
- JSON-LD: `WebSite`, `MusicGroup`, `FAQPage`, `BreadcrumbList`, `CollectionPage`, `VideoGame`.
- `sitemap.xml`, `robots.txt`, `site.webmanifest`, кастомная `404.html`.
- Семантичная разметка, один `<h1>` на страницу, alt-тексты, skip-link, focus-стили,
  `prefers-reduced-motion`, self-host шрифтов, preload, lazy-iframe.
