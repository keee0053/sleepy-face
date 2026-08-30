package com.team5.sleepyface.alarmringing

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import java.time.Instant

private const val LOG_TAG = "AlarmRingingService"

// A last-resort fallback for resolveAlarmToneUri(): the fixed content:// path Android's
// own Settings app writes the alarm tone to, so reading it doesn't go through
// RingtoneManager's lazy "default" resolution (the thing the other fallbacks are already
// dodging -- see resolveAlarmToneUri's comment). Reported by a closed tester whose device
// silenced the alarm entirely on "device default" even after those fallbacks.
private val FALLBACK_SYSTEM_ALARM_URI: Uri =
  Uri.parse("content://settings/system/alarm_alert")

class AlarmRingingService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var mediaPlayer: MediaPlayer? = null

  // The action/alarmId/soundId this instance last started ringing with, kept so a swiped
  // notification can be re-armed as the same real alarm (not a synthetic test alarm) --
  // see handleNotificationSwiped().
  private var currentAction: String? = null
  private var currentAlarmId: String? = null
  private var currentSoundId: String? = null

  private val safetyStop = Runnable {
    stopRinging()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_FIRE_TEST_ALARM, ACTION_FIRE_SAVED_ALARM -> {
        val alarmId = intent.getStringExtra(EXTRA_ALARM_ID) ?: return START_NOT_STICKY
        val soundId = intent.getStringExtra(EXTRA_SOUND_ID)
        currentAction = intent.action
        currentAlarmId = alarmId
        currentSoundId = soundId
        startRinging(alarmId, soundId)
      }
      ACTION_STOP_RINGING -> stopRinging()
      ACTION_NOTIFICATION_SWIPED -> handleNotificationSwiped()
    }

    return START_NOT_STICKY
  }

  // setOngoing(true) no longer keeps this notification pinned on Android 14+ (see
  // buildNotification's comment) -- reported by a closed tester (Android 16) who had to
  // reboot to silence an alarm after swiping it away. Relaunching the ringing Activity
  // straight from this delete intent doesn't work either: it's a PendingIntent-triggered
  // Activity start with no visible caller, which Android's Background Activity Launch
  // policy blocks outright (confirmed via logcat: "Background activity launch blocked!
  // ... resultIfPiSenderAllowsBal: BAL_BLOCK"). A fresh AlarmManager trigger sidesteps
  // that entirely, since setFullScreenIntent's whole purpose is auto-launching from the
  // background -- so this quiets the current tone and re-arms the same alarm a short
  // delay later through that normal path, instead of either leaving it stuck ringing or
  // letting a swipe silently end the wake challenge for good.
  private fun handleNotificationSwiped() {
    val action = currentAction
    val alarmId = currentAlarmId

    if (action != null && alarmId != null) {
      AlarmScheduler.scheduleImmediateRefire(
        applicationContext,
        action,
        alarmId,
        currentSoundId,
        NOTIFICATION_SWIPE_REFIRE_DELAY_MS,
      )
    }

    stopRinging()
  }

  override fun onDestroy() {
    handler.removeCallbacks(safetyStop)
    stopDefaultAlarmTone()
    AlarmRingingState.stop()
    super.onDestroy()
  }

  private fun startRinging(alarmId: String, soundId: String?) {
    val startedAt = Instant.now().toString()
    AlarmRingingState.start(alarmId, startedAt)
    createNotificationChannel()

    startForeground(
      NOTIFICATION_ID,
      buildNotification(alarmId, startedAt),
    )

    playAlarmTone(soundId)
    handler.removeCallbacks(safetyStop)
    handler.postDelayed(safetyStop, SAFETY_TIMEOUT_MS)
  }

  private fun stopRinging() {
    handler.removeCallbacks(safetyStop)
    stopDefaultAlarmTone()
    AlarmRingingState.stop()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  // A Saved Alarm's chosen sound (see src/constants/alarm-sounds.ts). "default"/null/an
  // unknown id all fall back to the device's own alarm tone, same as before this option
  // existed.
  private fun resourceIdForSound(soundId: String?): Int? = when (soundId) {
    "classic_beep" -> R.raw.classic_beep
    "digital_pulse" -> R.raw.digital_pulse
    "gentle_chime" -> R.raw.gentle_chime
    else -> null
  }

  private fun playAlarmTone(soundId: String?) {
    stopDefaultAlarmTone()

    val customSoundResId = resourceIdForSound(soundId)
    val player = MediaPlayer()

    try {
      player.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build(),
      )

      if (customSoundResId != null) {
        val descriptor = resources.openRawResourceFd(customSoundResId)
        descriptor.use {
          player.setDataSource(it.fileDescriptor, it.startOffset, it.length)
        }
      } else {
        // On some OEM builds (observed on Samsung One UI), RingtoneManager.getDefaultUri()
        // internally triggers a lazy write to Settings.System the first time it resolves
        // the default alarm/notification tone, which throws SecurityException without
        // WRITE_SETTINGS (an app should never need to hold that permission just to read a
        // default tone). Guard every step so a tone-resolution/playback failure silences
        // the alarm sound instead of crashing the whole ringing service.
        val alarmToneUri = resolveAlarmToneUri()

        if (alarmToneUri == null) {
          Log.e(LOG_TAG, "No alarm tone URI could be resolved; ringing silently.")
          player.release()
          return
        }

        player.setDataSource(applicationContext, alarmToneUri)
      }

      player.isLooping = true
      player.prepare()
      player.start()
      mediaPlayer = player
    } catch (error: Exception) {
      Log.e(LOG_TAG, "Failed to play alarm tone (soundId=$soundId); ringing silently.", error)
      player.release()
      mediaPlayer = null
    }
  }

  private fun resolveAlarmToneUri(): Uri? {
    // Deliberately avoid RingtoneManager.getDefaultUri()/getActualDefaultRingtoneUri():
    // on some OEM builds (observed on Samsung One UI) resolving "the default" tone lazily
    // writes a Settings.System init value the first time it's touched, which throws
    // SecurityException without WRITE_SETTINGS (an app should never need that permission
    // just to read a tone) -- and it's non-deterministic, since MediaPlayer.setDataSource()
    // triggers the same resolution internally even when getDefaultUri() itself didn't throw.
    // Querying the ringtone database directly for an already-resolved URI sidesteps that
    // "default" resolution path entirely.
    return safeGetFirstRingtoneUri(RingtoneManager.TYPE_ALARM)
      ?: safeGetFirstRingtoneUri(RingtoneManager.TYPE_NOTIFICATION)
      ?: safeGetValidRingtoneUri()
      ?: FALLBACK_SYSTEM_ALARM_URI
  }

  private fun safeGetFirstRingtoneUri(type: Int): Uri? {
    return try {
      val manager = RingtoneManager(applicationContext)
      manager.setType(type)
      val cursor = manager.cursor

      if (!cursor.moveToFirst()) {
        return null
      }

      manager.getRingtoneUri(cursor.position)
    } catch (error: Exception) {
      Log.e(LOG_TAG, "Querying ringtones for type $type failed", error)
      null
    }
  }

  private fun safeGetValidRingtoneUri(): Uri? {
    return try {
      RingtoneManager.getValidRingtoneUri(applicationContext)
    } catch (error: Exception) {
      Log.e(LOG_TAG, "getValidRingtoneUri() failed", error)
      null
    }
  }

  private fun stopDefaultAlarmTone() {
    mediaPlayer?.apply {
      if (isPlaying) {
        stop()
      }
      release()
    }
    mediaPlayer = null
  }

  private fun buildNotification(alarmId: String, startedAt: String) =
    NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("Alarm ringing")
      .setContentText("Alarm is ringing.")
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setOngoing(true)
      .setAutoCancel(false)
      .setFullScreenIntent(createRingingPendingIntent(alarmId, startedAt), true)
      .setContentIntent(createRingingPendingIntent(alarmId, startedAt))
      // setOngoing(true) alone no longer keeps this notification pinned: since Android 14
      // the system lets a user swipe away a foreground service's notification regardless.
      // Reported by a closed tester (Android 16) -- swiping it left the alarm still
      // ringing with no way to reach the stop flow short of rebooting. Routed to
      // handleNotificationSwiped() (a Service start, not an Activity launch, so it isn't
      // subject to Android's Background Activity Launch restrictions) which quiets this
      // instance and re-arms the same alarm moments later through the normal
      // setFullScreenIntent path, instead of leaving it stuck or letting a swipe become a
      // free way to dodge the wake challenge.
      .setDeleteIntent(createNotificationSwipedPendingIntent())
      .build()

  private fun createNotificationSwipedPendingIntent(): PendingIntent {
    val intent = Intent(this, AlarmRingingService::class.java).apply {
      action = ACTION_NOTIFICATION_SWIPED
    }

    return PendingIntent.getService(
      this,
      DELETE_INTENT_REQUEST_CODE,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun createRingingPendingIntent(alarmId: String, startedAt: String): PendingIntent {
    val ringingUri = Uri.parse("sleepyface:///ringing")
      .buildUpon()
      .appendQueryParameter(EXTRA_ALARM_ID, alarmId)
      .appendQueryParameter(EXTRA_STARTED_AT, startedAt)
      .build()

    val launchIntent = Intent(Intent.ACTION_VIEW, ringingUri).setPackage(packageName)

    launchIntent.apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
      putExtra(EXTRA_ALARM_ID, alarmId)
      putExtra(EXTRA_STARTED_AT, startedAt)
    }

    return PendingIntent.getActivity(
      this,
      FULL_SCREEN_REQUEST_CODE,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val channel = NotificationChannel(
      NOTIFICATION_CHANNEL_ID,
      "Android Alarm Mechanics",
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = "Test alarm ringing alerts."
      setSound(null, null)
      enableVibration(false)
      lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
    }

    val notificationManager =
      getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    notificationManager.createNotificationChannel(channel)
  }
}
