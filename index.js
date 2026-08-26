// Custom entry point (see package.json "main") instead of pointing straight at
// expo-router/entry, so that TaskManager.defineTask (called at module scope inside
// wake-friend-notifications.ts) runs as early as physically possible in the JS bundle --
// before expo-router's own route-matching/initialization work. A headless launch (the
// app fully killed, woken by a background push) races the native side calling
// startTask() against this module-scope registration completing; the earlier this file
// evaluates, the more often that race is won. See wake-friend-notifications.ts for the
// full explanation.
import '@/services/wake-friend-notifications';

import 'expo-router/entry';
