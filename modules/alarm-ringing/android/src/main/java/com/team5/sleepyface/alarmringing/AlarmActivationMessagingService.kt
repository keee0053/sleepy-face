package com.team5.sleepyface.alarmringing

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

private const val ALARM_ACTIVATION_DATA_TYPE = "alarm-activation"
private const val PASSIVE_NOTIFICATION_CHANNEL_ID = "sleepyface-remote-push"
private const val PASSIVE_NOTIFICATION_ID = 61019

// The sole FirebaseMessagingService for this app: expo-notifications registers its own
// receiving service at intent-filter priority -1 (see its AndroidManifest.xml), so a
// service declared here at the default priority (0) is the one FCM actually delivers to
// -- only one FirebaseMessagingService ever receives a given message. That means this
// class is responsible for both jobs: starting Alarm Ringing directly for an Alarm
// Activation payload (so it works even with the JS/React Native process fully killed),
// and posting a plain notification for every other push (e.g. push-on-failure's existing
// "friend failed" notification) so that existing behavior isn't lost by taking over here.
class AlarmActivationMessagingService : FirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    super.onMessageReceived(remoteMessage)

    val customData = parseCustomData(remoteMessage)

    if (customData?.optString("type") == ALARM_ACTIVATION_DATA_TYPE) {
      startAlarmActivation(customData)
      return
    }

    showPassiveNotification(remoteMessage)
  }

  // Expo's Android push payload format (see expo-notifications' own NotificationData.kt)
  // does NOT put the caller's `data` object at a top-level RemoteMessage.data["<key>"] --
  // it JSON-encodes the whole `data` object into the single data["body"] key. data["title"]
  // and data["message"] carry the notification title/body text instead.
  private fun parseCustomData(remoteMessage: RemoteMessage): JSONObject? {
    return try {
      remoteMessage.data["body"]?.let { JSONObject(it) }
    } catch (error: Exception) {
      null
    }
  }

  // Deliberately does NOT call startForegroundService() directly: Android 12+ generally
  // blocks starting a foreground service from a background context (which an FCM handler
  // usually is, when the app is closed/backgrounded), so a direct call here would silently
  // fail exactly when this feature matters most. Routing through an immediate
  // AlarmManager.setAlarmClock() broadcast to AlarmRingingReceiver reuses the same
  // OS-granted exemption the local test/saved alarms already rely on to start ringing
  // reliably from a fully killed app state.
  private fun startAlarmActivation(customData: JSONObject) {
    val alarmId = "remote-activation-${UUID.randomUUID()}"
    val soundId = customData.optString("soundId").ifEmpty { null }
    val scheduledFor = Instant.now().toString()

    val intent = Intent(this, AlarmRingingReceiver::class.java).apply {
      action = ACTION_FIRE_REMOTE_ACTIVATION
      putExtra(EXTRA_ALARM_ID, alarmId)
      putExtra(EXTRA_SCHEDULED_FOR, scheduledFor)
      soundId?.let { putExtra(EXTRA_SOUND_ID, it) }
    }

    val pendingIntent = PendingIntent.getBroadcast(
      this,
      REMOTE_ACTIVATION_REQUEST_CODE,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val alarmClockInfo = AlarmManager.AlarmClockInfo(
      System.currentTimeMillis(),
      pendingIntent,
    )

    alarmManager.setAlarmClock(alarmClockInfo, pendingIntent)
  }

  private fun showPassiveNotification(remoteMessage: RemoteMessage) {
    val title = remoteMessage.notification?.title ?: remoteMessage.data["title"]
    val body = remoteMessage.notification?.body ?: remoteMessage.data["message"]

    if (title == null && body == null) {
      return
    }

    createPassiveNotificationChannel()

    val notification = NotificationCompat.Builder(this, PASSIVE_NOTIFICATION_CHANNEL_ID)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle(title)
      .setContentText(body)
      .setAutoCancel(true)
      .build()

    val notificationManager =
      getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    notificationManager.notify(PASSIVE_NOTIFICATION_ID, notification)
  }

  private fun createPassiveNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val channel = NotificationChannel(
      PASSIVE_NOTIFICATION_CHANNEL_ID,
      "Sleepy Face",
      NotificationManager.IMPORTANCE_DEFAULT,
    )

    val notificationManager =
      getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    notificationManager.createNotificationChannel(channel)
  }
}
