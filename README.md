# My Plants

A first local version of a mobile-first PWA for a friendly AI houseplant care companion.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## What is included

- Next.js App Router, TypeScript, Tailwind CSS, and React components
- Mobile-first Home screen based on the supplied Figma direction
- Mock plant data with dynamic priority sorting and attention count
- English and Russian translations with persistent language selection
- Functional Settings screen, Add Plant placeholder modal, and Plant Detail placeholder route
- Basic PWA manifest and app icon

## Future integration points

- Replace `data/mockPlants.ts` with a Supabase query or server action.
- Keep uploaded photo URLs in `latestPhotoUrl`; cards already use `object-fit: cover` for varied image shapes.
- Store AI-generated plant status as the `status`, `messageKey`, and `statusLabelKey` fields, or add a translation/content layer when AI messages become user-specific.
- Add authentication, notifications, weather, and AI APIs after the local UI and data contracts settle.
