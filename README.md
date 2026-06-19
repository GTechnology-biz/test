# 🚗 Road Trip Bingo Generator

A simple, **fully client-side** web app for creating printable road trip bingo
cards. It runs entirely in the browser, so it can be hosted for free on
**GitHub Pages** — no server or backend required.

## Features

- Choose **how many cards** to generate (each one is unique)
- Set the **percentage of items shared across all cards** (these appear on every
  card, in shuffled positions — handy for "everyone's looking for the same
  things" play)
- Add your own **custom items**, mixed in with a built-in list of ~100 road-trip
  sightings
- Set a **custom title** printed on every card
- Optional **FREE** center space
- Generates a single **PDF** containing all the cards (one card per page),
  ready to print

Everything happens in your browser — nothing is uploaded anywhere.

## Use it

1. Open the app (see deployment below, or just serve `index.html` locally).
2. Fill in the title, number of cards, shared-item percentage, and any custom
   items.
3. Click **Generate PDF** — a PDF downloads automatically.
4. Open the PDF and print it.

## Deploy to GitHub Pages

1. Push this repository to GitHub.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Select the branch (e.g. `main`) and the `/ (root)` folder, then **Save**.
5. After a minute, your app is live at
   `https://<your-username>.github.io/<repo-name>/`.

> A note on the stack: GitHub Pages only serves static files and cannot run
> server-side Python, so the app is written in plain HTML/CSS/JavaScript and
> generates PDFs in the browser with [jsPDF](https://github.com/parallax/jsPDF).
> No build step is needed.

## Files

| File         | Purpose                                            |
| ------------ | -------------------------------------------------- |
| `index.html` | The page and UI                                    |
| `app.js`     | Card generation logic and PDF rendering            |
| `words.json` | The built-in road-trip word list (edit to taste)   |

## Customizing the word list

Open `words.json` and edit the JSON array of strings. The app fetches this list
at startup and picks from it plus any custom items you enter in the form.

## Running locally

Because the app fetches `words.json` and loads `app.js` as separate files, some
browsers block them when opening `index.html` directly via `file://`. The
simplest fix is to serve the folder with any static server, for example:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```
