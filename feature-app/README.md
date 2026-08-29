# NUS Community Exchange

React/Vite frontend and Node/Express backend for the public Marketplace tracer bullet.

```bash
npm run install:all
npm run dev
```

For the complete authenticated handoff, build and start the Node server, then open the served mock uNivUS page:

```bash
npm run build
npm start
```

- Mock uNivUS entry: `http://127.0.0.1:3000/univus/`
- Feature app: `http://127.0.0.1:3000/`

Participant data is stored in `backend/data/community-exchange.sqlite` and is ignored by Git. Run verification with `npm test`, `npm run build`, and `npm run test:e2e`.
