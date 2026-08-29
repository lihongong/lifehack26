# uNivUS Hackathon Mockup

A lightweight, mobile-first webpage that emulates the supplied uNivUS app screen. The Maps position is replaced with a configurable integration tile for hackathon demonstrations.

## Run it

Open `index.html` directly in a browser, or serve this folder with any local static server.

## Change the integration tile

Edit the `customApp` object at the top of `app.js`:

```js
const customApp = {
  name: "Hackathon App",
  icon: "assets/hackathon-app.svg",
  url: "https://example.com",
};
```

- `name` is the label below the icon.
- `icon` can be a local image path or an HTTPS image URL.
- `url` must be a valid HTTP or HTTPS link and opens in a new tab.

No packages or build step are required.
