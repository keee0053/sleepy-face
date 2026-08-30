package com.team5.sleepyface.alarmringing

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import java.time.Instant
import java.util.UUID

private const val TAG = "AlarmScheduler"

// Plain-Context alarm scheduling, shared by AlarmRingingModule (the Expo Module, called
// from JS) and WakeFriendFirebaseMessagingService (a native FCM callback that runs with
// no React Native/JS instance at all). Keeping the actual AlarmManager mechanics here
// means a wake-friend push can ring this device's alarm the instant the OS delivers it,
// without waiting on React Native's JS bundle to boot -- see
// src/services/wake-friend-notifications.ts for the history of why that wait was
// unreliable (a headless-JS-launch race that Android's process freezer could win before
// the JS ever ran).
object AlarmScheduler {
  fun canScheduleExactAlarms(context: Context): Boolean {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()
  }

  // Best-effort, matching the JS-facing scheduleTestAlarmAfterSeconds' own tolerance:
  // silently does nothing (returns null) if an alarm is already ringing or exact-alarm
  // scheduling isn't available, rather than throwing -- there's no promise/caller to
  // report back to here. Returns the scheduled alarmId/scheduledFor so callers that DO
  // have somewhere to report to (the Expo Module) can hand back the exact values that
  // were actually armed, instead of independently recomputing their own.
  fun scheduleTestAlarmAfterSeconds(
    context: Context,
    seconds: Int,
    soundId: String?,
  ): Map<String, String>? {
    val isRinging = AlarmRingingState.isRinging()
    val canScheduleExact = canScheduleExactAlarms(context)
    Log.d(TAG, "scheduleTestAlarmAfterSeconds isRinging=$isRinging canScheduleExact=$canScheduleExact")

    if (isRinging || !canScheduleExact) {
      return null
    }

    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    cancelScheduledTestAlarm(context)

    val triggerAtMillis = System.currentTimeMillis() + (seconds * 1000L)
    val scheduledFor = Instant.ofEpochMilli(triggerAtMillis).toString()
    val alarmId = UUID.randomUUID().toString()

    val pendingIntent = createTestAlarmPendingIntent(context, alarmId, scheduledFor, soundId)
    val alarmClockInfo = AlarmManager.AlarmClockInfo(
      triggerAtMillis,
      createShowIntent(context, alarmId, scheduledFor),
    )

    alarmManager.setAlarmClock(alarmClockInfo, pendingIntent)

    return mapOf(
      "alarmId" to alarmId,
      "scheduledFor" to scheduledFor,
    )
  }

  // Re-arms the same real alarm a short delay after its notification was swiped away
  // (see AlarmRingingService.handleNotificationSwiped) -- reuses the caller's own
  // action/alarmId/soundId instead of minting a new test alarm, and skips the
  // isRinging() guard scheduleTestAlarmAfterSeconds has, since this is always called
  // right before that same ringing instance stops itself.
  fun scheduleImmediateRefire(
    context: Context,
    action: String,
    alarmId: String,
    soundId: String?,
    delayMillis: Long,
  ) {
    if (!canScheduleExactAlarms(context)) {
      return
    }

    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val triggerAtMillis = System.currentTimeMillis() + delayMillis
    val scheduledFor = Instant.ofEpochMilli(triggerAtMillis).toString()

    val pendingIntent = createRefirePendingIntent(context, action, alarmId, scheduledFor, soundId)
    val alarmClockInfo = AlarmManager.AlarmClockInfo(
      triggerAtMillis,
      createShowIntent(context, alarmId, scheduledFor),
    )

    alarmManager.setAlarmClock(alarmClockInfo, pendingIntent)
  }

  private fun createRefirePendingIntent(
    context: Context,
    action: String,
    alarmId: String,
    scheduledFor: String,
    soundId: String?,
  ): PendingIntent {
    val intent = Intent(context, AlarmRingingReceiver::class.java).apply {
      this.action = action
      putExtra(EXTRA_ALARM_ID, alarmId)
      putExtra(EXTRA_SCHEDULED_FOR, scheduledFor)
      soundId?.let { putExtra(EXTRA_SOUND_ID, it) }
    }

    return PendingIntent.getBroadcast(
      context,
      REFIRE_REQUEST_CODE,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  fun cancelScheduledTestAlarm(context: Context) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    alarmManager.cancel(createTestAlarmPendingIntent(context, null, null, null))
  }

  private fun createTestAlarmPendingIntent(
    context: Context,
    alarmId: String?,
    scheduledFor: String?,
    soundId: String?,
  ): PendingIntent {
    val intent = Intent(context, AlarmRingingReceiver::class.java).apply {
      action = ACTION_FIRE_TEST_ALARM
      alarmId?.let { putExtra(EXTRA_ALARM_ID, it) }
      scheduledFor?.let { putExtra(EXTRA_SCHEDULED_FOR, it) }
      soundId?.let { putExtra(EXTRA_SOUND_ID, it) }
    }

    return PendingIntent.getBroadcast(
      context,
      TEST_ALARM_REQUEST_CODE,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun createShowIntent(
    context: Context,
    alarmId: String,
    scheduledFor: String,
  ): PendingIntent {
    val ringingUri = Uri.parse("sleepyface:///ringing")
      .buildUpon()
      .appendQueryParameter(EXTRA_ALARM_ID, alarmId)
      .appendQueryParameter(EXTRA_SCHEDULED_FOR, scheduledFor)
      .build()

    val launchIntent = Intent(Intent.ACTION_VIEW, ringingUri).setPackage(context.packageName)

    launchIntent.apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }

    return PendingIntent.getActivity(
      context,
      FULL_SCREEN_REQUEST_CODE,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }
}
