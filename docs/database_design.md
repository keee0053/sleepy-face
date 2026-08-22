# Wake Up Challenge App - Database Design

## Purpose

This document records the current Supabase Postgres schema for the app.

The current online Supabase setup is intentionally smaller than the full product model. It supports Google Login, Initial Setup, simple photo records, and friend relations. Wake Up Challenge attempt tracking and Failure Card-specific persistence are deferred.

## Main Decisions

- Use Supabase Auth's built-in `auth.users` table for authenticated accounts.
- Do not create an app-owned `users` table.
- Do not create `user_auth_providers`; Google provider identity is owned by Supabase Auth.
- Use `profiles` for app profile data tied one-to-one to `auth.users`.
- Use `display_name` in code and docs instead of `username`.
- Keep `user_id` as the public immutable User ID for Friend Search.
- Keep `icon_url` as the profile icon field; it stores either one of the 8 known preset icon identifiers (`human`, `man`, `man2`, `woman`, `boy`, `child`, `old-man`, `grandmother`) chosen during Initial Setup, or a custom photo's full Storage URL chosen from the photo library (both during Initial Setup and from the Profile screen). `create_profile` still only accepts a preset identifier; a custom photo is written afterward through a direct `profiles` update.
- Use simple `photos` records for uploaded image URLs in the current schema.
- Use `friends_relations` for directional friend relation rows in the current schema.
- Use Supabase Storage bucket `failure-photos` for the current simple captured-photo upload flow.
- Use Supabase Storage bucket `profile-icon-photos` for custom profile icon photo uploads.
- Defer `daily_attempts`, `failure_cards`, canonical `friendships`, feed access persistence, and final Failure Card-specific storage rules until the Wake Up Challenge backend is implemented.

## Tables

### profiles

One row per authenticated app user. The row ID is the Auth User ID from Supabase Auth.

| column name  | type        | constraints / memo                                     |
| ------------ | ----------- | ------------------------------------------------------ |
| `id`         | uuid        | primary key, references `auth.users(id)`               |
| `user_id`    | varchar     | unique public User ID used for Friend Search           |
| `display_name` | varchar  | required public Display Name                           |
| `icon_url`   | varchar     | required; a preset Profile Icon identifier or a custom photo's Storage URL |
| `created_at` | timestamptz | default `now()`                                        |

Rules:

- `profiles.id` is the internal Auth User ID.
- `profiles.user_id` is the public User ID.
- `profiles.user_id` must not be confused with the Auth User ID.
- A user can create only their own Profile.
- Public User ID and Display Name are immutable for the MVP.

### photos

Simple image records associated with a Profile.

| column name  | type        | constraints / memo                       |
| ------------ | ----------- | ---------------------------------------- |
| `id`         | uuid        | primary key, default `gen_random_uuid()` |
| `profile_id` | uuid        | references `profiles(id)`                |
| `image_url`  | varchar     | image URL                                |
| `created_at` | timestamptz | default `now()`                          |

Rules:

- Users can read and insert only their own photo records in the current policy set.
- This table is not yet the final Failure Card model.

### failure-photos Storage

Storage bucket used by the current camera upload flow.

Rules:

- Captured photos are uploaded under a path scoped by the current Auth User ID.
- The app stores the public URL in `photos.image_url`.
- This bucket supports the current simple photo records and is not yet the final Failure Card storage model.

### profile-icon-photos Storage

Storage bucket used by the custom profile icon photo picker (Initial Setup and the Profile screen).

Rules:

- Uploaded under a path scoped by the current Auth User ID (`{profileId}/icon.jpg`, upserted on re-pick).
- The app stores the public URL directly in `profiles.icon_url`.
- Publicly readable, same as `failure-photos`, since friends need to see it in the feed and Friend Search.

### friends_relations

Directional friend relation rows between Profiles.

| column name         | type        | constraints / memo                       |
| ------------------- | ----------- | ---------------------------------------- |
| `id`                | uuid        | primary key, default `gen_random_uuid()` |
| `profile_id`        | uuid        | references `profiles(id)`                |
| `friend_profile_id` | uuid        | references `profiles(id)`                |
| `created_at`        | timestamptz | default `now()`                          |

Rules:

- `profile_id` and `friend_profile_id` cannot be the same Profile.
- `(profile_id, friend_profile_id)` is unique.
- The current policy allows a user to insert relations only from their own Profile.
- The current policy allows a user to read relations where they are either side of the relation.

### photo_reactions

A single 😂 reaction a Profile can toggle on a friend's photo from the Home feed. Not a
multi-emoji picker, and not the Comments feature (table design owned separately).

| column name  | type        | constraints / memo                          |
| ------------ | ----------- | -------------------------------------------- |
| `id`         | uuid        | primary key, default `gen_random_uuid()`     |
| `photo_id`   | uuid        | references `photos(id)`                      |
| `profile_id` | uuid        | references `profiles(id)`                    |
| `created_at` | timestamptz | default `now()`                              |

Rules:

- `(photo_id, profile_id)` is unique — one reaction per Profile per photo; removing it is a delete, not a second reaction type.
- Authenticated users can read all reaction rows (needed to render counts on friends' photos).
- A user can insert or delete only their own reaction rows (`profile_id = auth.uid()`).

### comments

A comment a Profile leaves on a friend's photo, viewed and added from the photo's detail
screen (reached by tapping the photo or the comment-bubble button in the Home feed).

| column name          | type        | constraints / memo                       |
| --------------------- | ----------- | ---------------------------------------- |
| `id`                  | uuid        | primary key, default `gen_random_uuid()` |
| `user_id`             | uuid        | references `profiles(id)`, not null      |
| `photo_id`            | uuid        | references `photos(id)`, not null        |
| `parent_comment_id`   | uuid        | references `comments(id)`, nullable      |
| `content`             | text        | not null                                 |
| `created_at`          | timestamptz | not null, default `now()`                |

Rules:

- Authenticated users can read all comment rows (same visibility shape as `photo_reactions`).
- A user can insert only their own comment rows (`user_id = auth.uid()`); no update or delete yet.
- `parent_comment_id` exists for a future "comment on a comment" feature and stays nullable — a top-level comment has none. There is no UI for replies yet.

## RPC Functions

### create_profile

Creates the authenticated user's Profile after Google Login.

Inputs:

| argument       | type | memo                          |
| -------------- | ---- | ----------------------------- |
| `user_id`      | text | public User ID                |
| `display_name` | text | public Display Name           |
| `icon_id`      | text | preset Profile Icon identifier |

Success payload:

```json
{
  "status": "ok",
  "data": {
    "profile_id": "uuid",
    "user_id": "public-user-id",
    "display_name": "Display Name",
    "icon_url": "icon-identifier",
    "created_at": "timestamp"
  }
}
```

Error codes:

- `not_authenticated`
- `profile_already_created`
- `user_id_already_taken`
- `invalid_profile_input` (includes an unknown `icon_id`)

## Row Level Security

Current RLS policies:

- Authenticated users can read Profiles for Friend Search.
- Authenticated users can insert only their own Profile.
- Profiles cannot be updated or deleted through current app policies.
- Authenticated users can read and insert only their own photo records.
- Authenticated users can read friend relation rows where they are either side.
- Authenticated users can insert friend relation rows only from their own Profile.
- Authenticated users can read all photo reaction rows, and insert/delete only their own.
- Authenticated users can read all comment rows, and insert only their own.

## Deferred Backend Tables

These tables were part of the larger MVP design, but they are not in the current manual Supabase schema:

- `daily_attempts`
- `failure_cards`
- canonical mutual `friendships`

Add them later when implementing Wake Up Challenge result persistence, Friends Feed Access, and Failure Card behavior.
