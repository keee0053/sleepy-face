# Wake Up Challenge App - MVP Scope

## Purpose

This document defines what belongs in the MVP and what is intentionally out of scope.

It describes product behavior and rules only. Detailed API contracts, database design, framework choices, and visual design belong in separate documents.

## MVP Feature Summary

The MVP contains only the features needed to demonstrate the core wake-up experience:

1. Initial Setup
2. Home
3. Alarm
4. Wake Up Challenge
5. Friends
6. Friends Feed
7. Profile
8. Offline Page

## 1. Initial Setup

Initial Setup is required after Google Login and before the user can access the main app.

For the MVP, Initial Setup collects:

- Public User ID
- Display Name

Rules:

- Google Login is the only supported authentication method.
- Public User ID is separate from Supabase Auth's internal UUID.
- Public User ID is used for friend search.
- Public User ID cannot be edited after setup in the MVP.
- Display Name cannot be edited after setup in the MVP.
- Initial Setup should not become onboarding, settings, profile customization, or preference collection.

## 2. Home

Home is the main app entry after Initial Setup.

For the MVP, the Alarm area is the default Home. Home should give access to:

- Alarm
- Friends Feed
- Friends
- Profile

Home should not become a separate dashboard or onboarding page.

## 3. Alarm

Alarm is the core scheduling feature.

The MVP supports:

- Creating saved alarms
- Editing saved alarms
- Deleting saved alarms
- Viewing saved alarms
- Turning saved alarms ON or OFF
- Starting the Wake Up Challenge when an alarm rings

Rules:

- A user may have multiple Saved Alarms.
- Saved Alarms are stored locally on the device and are not stored in Supabase in the MVP.
- Saved Alarms repeat by selected days of the week, including weekends.
- A Saved Alarm must include at least one selected weekday.
- Two Saved Alarms cannot include the same selected weekday.
- If a selected weekday is already used, the app should block the change and direct the user to edit the existing alarm for that day.
- Saved Alarms cannot be edited or deleted while they are the active Daily Alarm Attempt.
- Saved Alarm ON/OFF state is stored locally with the Saved Alarm. Older local alarms without this state are treated as ON.
- There is no snooze behavior in the MVP.

## 4. Wake Up Challenge

Wake Up Challenge is the required post-alarm task.

The MVP challenge has three parts:

1. Photo Capture
2. Face Verification
3. Quiz

The challenge succeeds only when all three parts succeed.

Rules:

- The Alarm Timer is 3 minutes.
- The Alarm Timer starts when the alarm rings.
- The Alarm Timer pauses during Face Verification.
- The Alarm Timer resumes when the Quiz starts.
- If the user closes the app, locks the phone, or leaves the active alarm/challenge flow before completion, the result is a Challenge Failure.
- If the app goes offline during an active alarm or challenge, the active attempt becomes a Challenge Failure.

### Photo Capture

Photo Capture asks the user to take a selfie after the alarm rings.

Rules:

- The app can capture a selfie with the device camera.
- The captured photo is copied into app local storage before upload.
- The app can upload the captured photo to Supabase Storage and create a simple `photos` table record for the current user.
- Each photo attempt has a 2-minute Photo Timer.
- A bad or timed-out photo attempt counts as a Bad Photo Attempt.
- Three Bad Photo Attempts cause Challenge Failure.

### Face Verification

Face Verification checks whether the submitted photo contains at least one usable human face.

Rules:

- The MVP does not require identity matching.
- The face does not need to be verified as the logged-in user.
- Multiple faces are acceptable.
- Face Verification is a practical wake-up check, not a security or biometric identity system.

### Quiz

Quiz asks the user to answer simple arithmetic questions.

Rules:

- Questions are two-digit addition and subtraction.
- The user must answer 3 questions correctly before the remaining Alarm Timer expires.
- Wrong answers are replaced with new questions.
- Wrong answers do not cause immediate failure.
- Quiz timeout causes Quiz Failure.

## 5. Friends

Friends controls who can see uploaded Failure Cards.

Rules:

- Users search by public User ID or Display Name.
- A user can add another user directly.
- There are no friend requests.
- There are no pending states or approvals.
- Friendship is mutual immediately.
- Once user A adds user B, both users can see each other's uploaded Failure Cards.
- Friend removal is not required for the MVP.

## 6. Friends Feed

Friends Feed shows uploaded Failure Cards from friends.

Rules:

- Only Failure Cards from friends are visible.
- The feed is newest first.
- Failure photos are displayed directly in the feed.
- Only Quiz Failure creates a friends-visible Failure Card.
- Timeout failure, Bad Photo Failure, Active Offline Failure, and Abandoned Failure do not create Failure Cards.
- Non-quiz failures block Friends Feed Access for the rest of the user's current local day.
- Challenge Success restores or allows Friends Feed Access for the current local day.
- Friends Feed Access does not block Alarm, Friends, or Profile.

### Reactions

A viewer can react to a friend's Failure Card in the feed with a single 😂 reaction.

Rules:

- 😂 is the only reaction; this is not a multi-emoji picker.
- Reacting is a toggle: tapping again removes the viewer's own reaction.
- The reaction count is visible to anyone who can see the photo.

### Comments

A viewer can comment on a friend's Failure Card, on the photo's detail screen.

Rules:

- Tapping the photo, or the comment-bubble button, in the Home feed opens the photo's detail screen.
- The detail screen shows the photo, the 😂 reaction control, the comment count, and the comment thread oldest-first.
- A viewer can add a comment from the detail screen; the viewer's own comments are labeled "自分" instead of their Display Name.
- Comments are visible to anyone who can see the photo.
- Comment on a comment (threaded replies) is optional, not required for the MVP.
- There is no edit or delete for a comment yet.

## 7. Profile

Profile is the user's minimal personal area.

It shows:

- Public User ID
- Display Name
- Newest-first list of the user's own Failure Cards

Rules:

- Profile remains available even when Friends Feed Access is blocked.
- Only failures with uploaded photos appear in Profile.
- Each listed Failure Card can be opened to view its photo.
- Users cannot delete or hide Failure Cards in the MVP.
- Profile should not expand into settings, statistics, achievements, streaks, account deletion, or social identity features.

## 8. Offline Page

Offline Page is shown when the app detects no internet connection.

Rules:

- While offline, all app functions are unavailable.
- If the app is offline before login or Initial Setup, Offline Page still blocks app use.
- If the app is offline at a scheduled alarm time, no Daily Alarm Attempt starts and no Challenge Failure is recorded.
- If the app goes offline during an active alarm or Wake Up Challenge, the active attempt becomes a Challenge Failure.

## Out Of Scope

The following are not part of the MVP:

- Apple Login
- Email/password login
- Guest login
- Snooze
- Friend requests
- Friend removal
- Contact import
- Friend recommendations
- QR-code friend adding
- Threaded comment replies
- Rankings
- Public all-user feed
- Reports
- Moderation tools
- Statistics
- Streaks
- Achievements
- Account deletion
- Logout flow
- Admin features
- Server-side face detection
- Detailed visual design specification
