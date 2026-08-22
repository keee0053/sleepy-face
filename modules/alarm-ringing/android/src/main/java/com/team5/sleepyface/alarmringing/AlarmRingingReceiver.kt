package com.team5.sleepyface.alarmringing

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class AlarmRingingReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action

    if (
      action != ACTION_FIRE_TEST_ALARM &&
      action != ACTION_FIRE_SAVED_ALARM &&
      action != ACTION_FIRE_REMOTE_ACTIVATION
    ) {
      return
    }

    val alarmId = intent.getStringExtra(EXTRA_ALARM_ID) ?: return
    val scheduledFor = intent.getStringExtra(EXTRA_SCHEDULED_FOR) ?: return
    val soundId = intent.getStringExtra(EXTRA_SOUND_ID)

    val serviceIntent = Intent(context, AlarmRingingService::class.java).apply {
      this.action = action
      putExtra(EXTRA_ALARM_ID, alarmId)
      putExtra(EXTRA_SCHEDULED_FOR, scheduledFor)
      soundId?.let { putExtra(EXTRA_SOUND_ID, it) }
    }

    ContextCompat.startForegroundService(context, serviceIntent)
  }
}
