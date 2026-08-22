package com.team5.sleepyface.alarmringing

internal const val ACTION_FIRE_TEST_ALARM =
  "com.team5.sleepyface.alarmringing.action.FIRE_TEST_ALARM"
internal const val ACTION_FIRE_SAVED_ALARM =
  "com.team5.sleepyface.alarmringing.action.FIRE_SAVED_ALARM"
// Started directly by AlarmActivationMessagingService on receipt of an alarm-activation
// FCM push -- unlike the two actions above, there is no local AlarmManager broadcast
// involved, since the remote push itself is the trigger.
internal const val ACTION_FIRE_REMOTE_ACTIVATION =
  "com.team5.sleepyface.alarmringing.action.FIRE_REMOTE_ACTIVATION"
internal const val ACTION_STOP_RINGING =
  "com.team5.sleepyface.alarmringing.action.STOP_RINGING"

internal const val EXTRA_ALARM_ID = "alarmId"
internal const val EXTRA_SCHEDULED_FOR = "scheduledFor"
internal const val EXTRA_STARTED_AT = "startedAt"
internal const val EXTRA_SOUND_ID = "soundId"

internal const val TEST_ALARM_REQUEST_CODE = 51017
internal const val FULL_SCREEN_REQUEST_CODE = 51018
internal const val NOTIFICATION_ID = 51017
internal const val NOTIFICATION_CHANNEL_ID = "android-alarm-mechanics"
internal const val SAFETY_TIMEOUT_MS = 180_000L
