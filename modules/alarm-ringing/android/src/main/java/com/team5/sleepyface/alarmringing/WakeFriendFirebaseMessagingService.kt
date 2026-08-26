package com.team5.sleepyface.alarmringing

import android.util.Log
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService
import org.json.JSONObject

private const val WAKE_FRIEND_ACTIVATE_TYPE = "wake-friend-activate"
private const val WAKE_FRIEND_TEST_ALARM_DELAY_SECONDS = 20
private const val TAG = "WakeFriendFCM"

// Expo's push service (exp.host) wraps the data payload we send from
// buildWakeFriendPushMessages under a "body" field, alongside its own
// projectId/experienceId/scopeKey metadata -- expo-notifications' JS SDK unwraps this
// automatically before handing data to any JS listener, but this native callback sees
// the raw FCM payload, so "type" has to be read from inside that nested JSON string
// instead of remoteMessage.data directly.
private fun extractType(remoteMessage: RemoteMessage): String? {
  remoteMessage.data["type"]?.let { return it }

  val body = remoteMessage.data["body"] ?: return null
  return runCatching { JSONObject(body).optString("type").ifEmpty { null } }.getOrNull()
}

// Handles a wake-friend push (see supabase/functions/activate-alarm and
// src/services/wake-friend-notifications.ts) entirely natively, with no React
// Native/JS instance involved at all. A prior JS-only implementation (a data-only push
// waking a React Native background task) lost a race against Android's process
// freezer often enough to be unreliable when the app was fully killed: the OS could
// suspend the freshly spawned process before the JS bundle ever finished booting far
// enough to register the task. Scheduling the alarm here, in a plain FCM callback that
// runs the instant the OS delivers the message, has no such bootstrap step to race.
//
// Extends (rather than replaces) expo-notifications' own FirebaseMessagingService, and
// always calls through to it, so every other push notification the app already relies
// on keeps working exactly as before -- see the manifest, which removes
// expo-notifications' own <service> registration for the same FCM intent-filter and
// substitutes this subclass instead (Android/FCM can only bind one such service).
class WakeFriendFirebaseMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val type = extractType(remoteMessage)
    Log.d(TAG, "onMessageReceived type=$type data=${remoteMessage.data}")

    if (type == WAKE_FRIEND_ACTIVATE_TYPE) {
      val result = AlarmScheduler.scheduleTestAlarmAfterSeconds(
        applicationContext,
        WAKE_FRIEND_TEST_ALARM_DELAY_SECONDS,
        null,
      )
      Log.d(TAG, "scheduleTestAlarmAfterSeconds result=$result")
    }

    super.onMessageReceived(remoteMessage)
  }
}
