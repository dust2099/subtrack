# SubTrack

SubTrack is a subscription-tracking app for keeping recurring payments and shared costs in one place. Track upcoming renewal dates, see spending totals, invite other users to share subscriptions, and manage friends and invitations.

The interface is available in English and Spanish.

## Features

- Create subscriptions from the popular catalog or add custom subscriptions.
- Track price, currency, billing cycle, category, and next payment date.
- Edit subscriptions and the contributions of invited members.
- Share subscriptions with other SubTrack users and manage invitations.
- See shared members’ profile pictures and contribution amounts.
- Send and respond to friend requests.
- Receive notifications for incoming friend requests and subscription invitations.
- Upload a profile picture and customize subscription avatar colors.
- Review upcoming payments and monthly spending totals.

## Tech stack

- React 19 and TypeScript
- Vite
- Supabase Auth, Postgres, RPC functions, and Storage
- Tailwind CSS
- React Router
- i18next

## Requirements

- Node.js (current LTS recommended)
- npm
- A Supabase project

## Local development

1. Clone the repository and install dependencies:

   ```bash
   git clone <repository-url>
   cd subtrack
   npm install
   ```

2. Create a `.env.local` file in the project root with your Supabase project URL and **publishable/anon key**:

   ```dotenv
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-publishable-or-anon-key
   ```

   These values are used by the Vite client. Never put a Supabase `service_role` key or other server secret in a `VITE_` variable; Vite includes client variables in the browser bundle.

3. Configure the Supabase database and storage as described below.

4. Start the local development server:

   ```bash
   npm run dev
   ```

Vite prints the local URL when the server starts.

## Supabase setup

The application expects a Supabase schema with the core `profiles`, `subscription_catalog`, `user_subscriptions`, and `subscription_members` tables, plus the profile setup used by authentication. The SQL files in `supabase/` add app features to that schema; they are not a complete initial database schema. Apply them in the Supabase SQL Editor after the core tables exist.

| SQL file | Purpose |
| --- | --- |
| `supabase/share_subscriptions.sql` | Sharing, member invitations, contribution updates, and row-level security policies for subscription sharing. |
| `supabase/friends.sql` | Friend requests and friend-management RPC functions. |
| `supabase/search_profiles_for_subscription.sql` | Authenticated account search for subscription invitations. |
| `supabase/subscription_member_previews.sql` | Secure profile previews for members of shared subscriptions. Depends on the sharing helpers in `share_subscriptions.sql`. |
| `supabase/subscription_appearance_preferences.sql` | Per-user subscription avatar colors. |
| `supabase/profile_avatar_storage_policies.sql` | Profile-picture storage policies. Requires an `avatars` Storage bucket. |
| `supabase/seed_subscription_catalog.sql` | Adds starter catalog entries. Prices and logos are intentionally blank. |

After creating the core schema, apply the sharing and friend SQL, then the search, preview, appearance, and avatar-storage scripts. Apply the catalog seed whenever you want to add the starter catalog entries. Review SQL changes before applying them to a production database.

For profile pictures, create an `avatars` bucket in Supabase Storage. The app stores each profile image at `<user-id>/avatar` and saves its public URL in the user’s profile. Configure the bucket and access policies according to your privacy requirements.

Enable the Supabase Auth sign-in and sign-up settings you want to use. If email confirmation is enabled, users may need to confirm their address before they can sign in.

## Production build

Create the production bundle:

```bash
npm run build
```

Vite writes the generated site to `dist/`. To serve the production build locally:

```bash
npm run preview
```

Run ESLint with:

```bash
npm run lint
```

## Deploy to Vercel

1. Import the repository into Vercel.
2. Use the Vite preset. The standard build command is `npm run build`, and the output directory is `dist`.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel project’s environment-variable settings for each deployment environment.
4. Apply the required Supabase SQL and storage setup before using features backed by those functions.
5. Deploy the project and test sign-in, subscription loading, sharing, friend requests, notifications, and profile-picture access.

The app uses client-side routes under `/dashboard`. If deep links return a 404 in your Vercel deployment, configure a rewrite so those routes serve the Vite `index.html` entry point.

## Project scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Type-check and create a production build. |
| `npm run preview` | Preview the production build locally. |
| `npm run lint` | Run ESLint. |
