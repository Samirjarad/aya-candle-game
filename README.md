# Light AYA Candels (GitHub Pages mini-game)

A lightweight arcade mini-game you can host for free on **GitHub Pages** and link from your **Canva website**.

**Gameplay**
- 60 seconds
- Tap **candels** to light them: **+1**
- Tap **bombs** (avoid): **-5**
- Tap **gift boxes**: **+1 / +2 / +3 seconds**
- Speed & spawn rate increase over time
- End screen shows **score** + a low-stakes **voucher code**

## 1) Configure Formspree (email forwarding)
This project uses a regular HTML `<form>` that posts to Formspree.

1. Create a Formspree form:
   - https://formspree.io/
2. In Formspree, set forwarding to your email (e.g. `info@ayacandels.com`).
3. Copy your Form endpoint URL. It looks like:

```
https://formspree.io/f/xxxxabcd
```

4. Open `index.html` and replace the placeholder:

```html
<form id="scoreForm" method="POST" action="https://formspree.io/f/REPLACE_WITH_YOUR_FORM_ID">
```

with your real endpoint.

## 2) (Optional) Back-to-store button
In `js/game.js` you can set your store URL:

```js
storeUrl: '#',
```

Replace `#` with your Canva website URL.

## 3) Run locally (test)
Because browsers block some features on `file://` URLs, run a tiny local server.

### Option A: Python
```bash
python -m http.server 5173
```
Then open:
- http://localhost:5173

### Option B: Node
```bash
npx serve
```

## 4) Publish to GitHub Pages
1. Create a new GitHub repository (example name: `lit-aya-candels`).
2. Upload these files:
   - `index.html`
   - `css/styles.css`
   - `js/game.js`
3. In GitHub repo settings:
   - **Settings → Pages**
   - Source: **Deploy from a branch**
   - Branch: **main** (root)
4. GitHub will show your URL, typically:

```
https://YOUR-USERNAME.github.io/lit-aya-candels/
```

## 5) Link from Canva
Since Canva often opens external embeds in a new tab:
- Add a **button** “Play the game”
- Link it to your GitHub Pages URL.

## Notes about “security”
- Voucher codes here are generated in the browser for fun.
- A determined user can fake scores.
- Since your vouchers are low value and you manually select monthly winners, this is usually fine.

If you later want stronger anti-cheat, we can add a small serverless backend (still low cost), but it’s not required for your campaign.
