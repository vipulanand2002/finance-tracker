package com.vipul.financetracker;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Hourly alarm: look for a new app build or web deployment. */
public class UpdateReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        final PendingResult pending = goAsync();
        UpdateChecker.checkAsync(context, pending::finish);
    }
}
