# Secure Exam UI

React + Vite single-page interface used by the Cursor Secure Exam platform.

## Scripts

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run preview
```

Copy `.env.example` to `.env` if the backend API is not running on the default `http://localhost:4000`.

## Security behavior

- Requests fullscreen before entering the assessment and watches for focus or visibility changes.
- Blocks selection, copy, paste, drag, and context menus plus common shortcuts (Ctrl+C, Ctrl+P, Alt+Tab, PrintScreen, F12, etc.).
- Immediately reports violations to the backend so the attempt is closed and logged in MySQL.

Update `src/App.jsx` for logic changes and `src/App.css` for the pastel look-and-feel. These files are heavily commented to show where protections are mounted.
