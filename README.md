# ZALTURI — сайт

Статический сайт (HTML/CSS/JS, без сборки). Готов под GitHub Pages + домен `zalturi.com`.

8-бит / CRT эстетика, английский язык, SEO «под ключ» (мета, Open Graph, Twitter,
JSON-LD, sitemap, robots, манифест), пиксель-арт персонаж на главной и аркада с двумя
играми (Pac·Man с онлайн-таблицей рекордов и ZALTURI Runner).

## Структура

```
zalturi-site/
├── index.html              ← главная (hero, музыка, манифест-тизер, аркада-тизер)
├── about/index.html        ← манифест (длинный SEO-контент + FAQ)
├── arcade/index.html       ← хаб аркады (карточки игр + живые превью)
├── arcade/pacman/index.html← Pac·Man (Supabase-рекорды)
├── arcade/runner/index.html← ZALTURI Runner (бывший dino, перекрашен в бренд)
├── assets/
│   ├── css/base.css        ← вся дизайн-система
│   ├── js/pixelate.js      ← «оживающий» пиксель-персонаж на главной
│   ├── fonts/*.woff2        ← Press Start 2P + VT323 (self-host, ~12 КБ)
│   └── img/*                ← персонаж, og.png, иконки, фавиконы
├── sitemap.xml  robots.txt  site.webmanifest  404.html  CNAME
└── README.md
```

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
| Таблица рекордов Pac·Man | `arcade/pacman/index.html` → `SB_URL` / `SB_KEY` (Supabase, publishable-ключ — публичный по дизайну) |
| Картинка персонажа | `assets/img/zalturi-character.png` |
| Сила пикселизации персонажа | атрибуты `data-cols` / `data-cell` у `<img data-pixelate>` в `index.html` |
| Текст манифеста / FAQ | `about/index.html` (не забудь обновить и JSON-LD `FAQPage`) |

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
