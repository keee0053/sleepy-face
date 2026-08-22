# Wake Up Challenge App - Project Overview

## Purpose

The Wake Up Challenge App is a university MVP project focused on helping users wake up and stay awake.

A normal alarm is easy to stop passively. This project adds a required Wake Up Challenge after the alarm rings so the user must take active steps before the alarm experience is considered complete.

## Product Aim

The product should answer one core question:

> Does the app make it harder for a user to dismiss an alarm and fall asleep again?

Every feature in the MVP should support that goal. The app is not trying to become a full social network, productivity dashboard, health analytics tool, or competition platform.

## Core Experience

At a high level, the user experience is:

1. A saved alarm rings at the scheduled time.
2. The user completes a Wake Up Challenge.
3. The app records whether the challenge ended in Challenge Success or Challenge Failure.
4. If the user fails in the quiz stage, a Failure Card can be shown to friends.

The challenge makes the user provide active proof that they are awake through a selfie and simple arithmetic quiz.

## Friends Accountability Loop

The MVP includes a small friends-only accountability loop.

If the user has a Quiz Failure, the captured photo becomes a Failure Card visible to friends. This creates a lightweight consequence for not completing the challenge and gives friends a reason to hold each other accountable.

This loop is intentionally narrow:

- Users only see Failure Cards from friends.
- Friendships are mutual immediately.
- There are no friend requests in the MVP.
- The Friends Feed is not public.
- A viewer can react to a friend's Failure Card with a single 😂 reaction (toggle, not a multi-emoji picker) and can leave comments on it from the photo's detail screen; there are no threaded comment replies, rankings, or reports in the MVP.

## Scope Philosophy

The project should prioritize a stable, demonstrable prototype over feature completeness.

The current project direction is to focus on the essential wake-up experience, keep the product understandable, and make the MVP realistic for a small university team to complete.

## Design Status

The product design is not finished yet.

For now, project documentation should not define detailed UI layout, visual style, navigation design, screen composition, or component-level interaction design. Those design decisions should be documented separately after the design direction is ready.

