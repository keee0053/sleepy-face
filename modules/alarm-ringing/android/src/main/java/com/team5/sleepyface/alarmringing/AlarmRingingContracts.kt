package com.team5.sleepyface.alarmringing

internal const val ACTION_FIRE_TEST_ALARM =
  "com.team5.sleepyface.alarmringing.action.FIRE_TEST_ALARM"
internal const val ACTION_FIRE_SAVED_ALARM =
  "com.team5.sleepyface.alarmringing.action.FIRE_SAVED_ALARM"
internal const val ACTION_STOP_RINGING =
  "com.team5.sleepyface.alarmringing.action.STOP_RINGING"
internal const val ACTION_NOTIFICATION_SWIPED =
  "com.team5.sleepyface.alarmringing.action.NOTIFICATION_SWIPED"

internal const val EXTRA_ALARM_ID = "alarmId"
internal const val EXTRA_SCHEDULED_FOR = "scheduledFor"
internal const val EXTRA_STARTED_AT = "startedAt"
internal const val EXTRA_SOUND_ID = "soundId"

internal const val TEST_ALARM_REQUEST_CODE = 51017
internal const val FULL_SCREEN_REQUEST_CODE = 51018
internal const val DELETE_INTENT_REQUEST_CODE = 51019
internal const val REFIRE_REQUEST_CODE = 51020
internal const val NOTIFICATION_ID = 51017
internal const val NOTIFICATION_CHANNEL_ID = "android-alarm-mechanics"
internal const val SAFETY_TIMEOUT_MS = 180_000L
// How long a swiped-away ringing notification stays quiet before the alarm re-fires
// through the normal setFullScreenIntent path. Deliberately near-instant: a swipe isn't
// meant to buy any real time, just to never be a way to escape the wake challenge (see
// the comment on handleNotificationSwiped in AlarmRingingService.kt).
internal const val NOTIFICATION_SWIPE_REFIRE_DELAY_MS = 1_000L
