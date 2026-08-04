package pt.sosmais.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/**
 * Widget de ecrã principal — um botão SOS visível sem precisar de abrir a app.
 * Ao tocar, abre a app e dispara logo o ecrã de emergência (reutiliza o mesmo
 * evento "sos-activated" que já usamos para o comando de voz).
 */
public class SOSWidgetProvider extends AppWidgetProvider {

    public static final String ACTION_AUTO_SOS = "pt.sosmais.app.ACTION_AUTO_SOS";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_sos);

            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.setAction(ACTION_AUTO_SOS);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

            PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            views.setOnClickPendingIntent(R.id.widget_sos_button, pendingIntent);
            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }
}
