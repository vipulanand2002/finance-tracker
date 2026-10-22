package com.vipul.financetracker;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Fires at each reminder time: shows the notification and sets the next day's alarm. */
public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Reminders.enabled(context)) Reminders.notifyNow(context);
        Reminders.schedule(context);
    }
}
